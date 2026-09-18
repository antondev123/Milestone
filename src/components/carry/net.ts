"use client";
// Retry for calls made on patchy signal. Position lives on the server, so a failed call loses
// nothing; the screen says so (SignalNotice) and tries again. This never implies offline support.

const RETRY_MS = 3000;

export async function postJSON<T>(url: string, body: unknown, timeoutMs = 30_000): Promise<T> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
    if (!r.ok && r.status >= 500) throw new Error(`${url} ${r.status}`);
    return (await r.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/** Retry a request until it lands. `onTrouble(true)` while it is failing. */
export async function persist<T>(fn: () => Promise<T>, onTrouble: (t: boolean) => void, tries = 20): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      const v = await fn();
      onTrouble(false);
      return v;
    } catch (e) {
      onTrouble(true);
      if (i >= tries) throw e;
      await new Promise((r) => setTimeout(r, RETRY_MS));
    }
  }
}
