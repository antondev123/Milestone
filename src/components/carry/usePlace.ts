"use client";
// Keeps the server's resume pointer in step with the learner. The latest place wins;
// a failed save is retried every few seconds and surfaces a "lost signal" notice.
// Progress lives on the server, so this never implies offline support.
import { useCallback, useEffect, useRef, useState } from "react";
import type { Mode } from "@/types/lesson";

export interface Place {
  segmentId: string;
  position: "start" | "checkpoint";
  offset: number;
}

const RETRY_MS = 3000;
const HEARTBEAT_MS = 30_000;

export async function postJSON<T>(url: string, body: unknown, timeoutMs = 12_000): Promise<T> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
    if (!r.ok) throw new Error(`${url} ${r.status}`);
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

export function usePlace(mode: Mode) {
  const [trouble, setTrouble] = useState(false);
  const latest = useRef<Place | null>(null);
  const sent = useRef<string>("");
  const inflight = useRef<Promise<void> | null>(null);

  const flush = useCallback(async (): Promise<void> => {
    if (inflight.current) await inflight.current;
    const p = latest.current;
    if (!p) return;
    const key = JSON.stringify(p);
    if (key === sent.current) return;
    const run = persist(() => postJSON("/api/position", { ...p, mode }), setTrouble).then(
      () => {
        sent.current = key;
      },
      () => {},
    );
    inflight.current = run.finally(() => {
      inflight.current = null;
    });
    await inflight.current;
    // a newer place may have arrived while we were sending
    if (latest.current && JSON.stringify(latest.current) !== sent.current) await flush();
  }, [mode]);

  const save = useCallback(
    (p: Place) => {
      latest.current = p;
      void flush();
    },
    [flush],
  );

  // Heartbeat: time spent on a page counts toward the trip even without a page turn.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState !== "visible" || !latest.current) return;
      sent.current = "";
      void flush();
    }, HEARTBEAT_MS);
    return () => clearInterval(id);
  }, [flush]);

  // Closing the tab or locking the phone mid-sentence still lands the exact place.
  useEffect(() => {
    const onHide = () => {
      const p = latest.current;
      if (!p || JSON.stringify(p) === sent.current || !navigator.sendBeacon) return;
      navigator.sendBeacon("/api/position", new Blob([JSON.stringify({ ...p, mode })], { type: "application/json" }));
    };
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, [mode]);

  return { save, flush, trouble, setTrouble };
}
