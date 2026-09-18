// Who may read the session log. ADMIN_SECRET set → `?key=` once (a cookie carries it after) or the
// cookie. Unset → localhost only, so a Fly deploy without the secret exposes nothing.
// Writers (the app's own client) use the same x-tool-secret rule as /api/tools.
import { NextResponse } from "next/server";

export const ADMIN_COOKIE = "milestone_admin";

function cookie(req: Request, name: string): string | null {
  const raw = req.headers.get("cookie") ?? "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

function isLocal(req: Request): boolean {
  const host = (req.headers.get("host") ?? "").replace(/:\d+$/, "");
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}

/** null when allowed; otherwise the response to return. `setCookie` is true when `?key=` matched. */
export function adminGate(req: Request): { deny: NextResponse | null; setCookie: boolean } {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return { deny: isLocal(req) ? null : NextResponse.json({ error: "set ADMIN_SECRET to read the session log off localhost" }, { status: 403 }), setCookie: false };
  const key = new URL(req.url).searchParams.get("key");
  if (key === secret) return { deny: null, setCookie: true };
  if (cookie(req, ADMIN_COOKIE) === secret) return { deny: null, setCookie: false };
  return { deny: NextResponse.json({ error: "unauthorized: add ?key=<ADMIN_SECRET>" }, { status: 401 }), setCookie: false };
}

export function withAdminCookie(res: NextResponse, setCookie: boolean): NextResponse {
  if (setCookie) res.cookies.set(ADMIN_COOKIE, process.env.ADMIN_SECRET!, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
  return res;
}

/** Same rule as /api/tools: open in dev, header-gated when TOOL_WEBHOOK_SECRET is real. */
export function writerAllowed(req: Request): boolean {
  const secret = process.env.TOOL_WEBHOOK_SECRET;
  if (!secret || secret === "change-me") return true;
  return req.headers.get("x-tool-secret") === secret;
}

/** For server components: cookie / key check against a Headers + searchParams pair. */
export function adminAllowedFrom(headers: Headers, key: string | undefined): boolean {
  const secret = process.env.ADMIN_SECRET;
  const req = new Request("http://x/", { headers });
  if (!secret) return isLocal(req);
  return key === secret || cookie(req, ADMIN_COOKIE) === secret;
}
