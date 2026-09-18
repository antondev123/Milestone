"use client";
// Browser-side session log: buffer events, POST them in batches to /api/log/events, flush on
// pagehide with sendBeacon. The session id is the trip id (Plan.tripId) the screen already holds.
// Nothing here throws; a lost batch is a lost batch.

const FLUSH_MS = 2000;
const FLUSH_AT = 20;

type Pending = { ts: string; kind: string; data?: unknown };

let sessionId: string | null = null;
let buffer: Pending[] = [];
let timer: number | null = null;
let errorHookInstalled = false;

export function setLogSession(id: string | null): void {
  if (sessionId && sessionId !== id) flushLog();
  sessionId = id;
}

export function clientLog(kind: string, data?: unknown): void {
  if (typeof window === "undefined" || !sessionId) return;
  buffer.push({ ts: new Date().toISOString(), kind, data });
  if (buffer.length >= FLUSH_AT) flushLog();
  else if (timer === null) timer = window.setTimeout(flushLog, FLUSH_MS);
}

export function flushLog(useBeacon = false): void {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  if (!sessionId || buffer.length === 0) return;
  const body = JSON.stringify({ sessionId, events: buffer });
  buffer = [];
  try {
    if (useBeacon && navigator.sendBeacon) {
      navigator.sendBeacon("/api/log/events", new Blob([body], { type: "application/json" }));
      return;
    }
    void fetch("/api/log/events", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => {});
  } catch {}
}

/** window.onerror / unhandledrejection → client_error rows. Call once per learn screen. */
export function installErrorLog(): void {
  if (typeof window === "undefined" || errorHookInstalled) return;
  errorHookInstalled = true;
  window.addEventListener("error", (e) => clientLog("client_error", { message: e.message, source: e.filename, line: e.lineno, col: e.colno, stack: (e.error as Error | undefined)?.stack?.slice(0, 2000) }));
  window.addEventListener("unhandledrejection", (e) => {
    const r = e.reason as { message?: string; stack?: string } | string | undefined;
    clientLog("client_error", { message: typeof r === "string" ? r : r?.message ?? "unhandled rejection", stack: typeof r === "object" ? r?.stack?.slice(0, 2000) : undefined });
  });
  window.addEventListener("pagehide", () => flushLog(true));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushLog(true);
  });
}
