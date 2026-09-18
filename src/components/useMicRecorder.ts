"use client";
// Records the driver's microphone during a voice trip so a session can be replayed afterwards.
// The ElevenLabs SDK keeps its own mic track private (WebRTC), so this is a second capture of the
// same device: Chrome allows it and does not prompt again. Chunks go to /api/log/audio every
// CHUNK_MS and are appended server-side into one WebM. Silent no-op where MediaRecorder is missing.
import { useRef } from "react";
import { clientLog } from "@/lib/log/client";

const CHUNK_MS = 10_000;

export function useMicRecorder() {
  const rec = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const seq = useRef(0);
  const startedAt = useRef(0);
  const chain = useRef<Promise<unknown>>(Promise.resolve());

  async function start(sessionId: string) {
    if (rec.current || typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) return;
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
      const r = new MediaRecorder(s, mime ? { mimeType: mime, audioBitsPerSecond: 48_000 } : undefined);
      seq.current = 0;
      startedAt.current = Date.now();
      r.ondataavailable = (e) => {
        if (!e.data || e.data.size === 0) return;
        const n = seq.current++;
        const dur = Date.now() - startedAt.current;
        // serialise uploads so chunks land in order (the server drops out-of-order ones)
        chain.current = chain.current.then(() =>
          fetch(`/api/log/audio?session=${encodeURIComponent(sessionId)}&seq=${n}`, {
            method: "POST",
            headers: { "content-type": r.mimeType || "audio/webm", "x-duration-ms": String(dur) },
            body: e.data,
            keepalive: true,
          }).catch(() => {}),
        );
      };
      r.onerror = (e) => clientLog("client_error", { message: `mic recorder: ${(e as ErrorEvent).message ?? "error"}` });
      r.start(CHUNK_MS);
      rec.current = r;
      stream.current = s;
      clientLog("mic_record", { state: "start", mime: r.mimeType });
    } catch (e) {
      clientLog("mic_record", { state: "unavailable", error: (e as Error).message });
    }
  }

  function stop() {
    const r = rec.current;
    if (!r) return;
    rec.current = null;
    try {
      if (r.state !== "inactive") r.stop(); // fires a final dataavailable
    } catch {}
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    clientLog("mic_record", { state: "stop", ms: Date.now() - startedAt.current });
  }

  return { start, stop, active: () => rec.current !== null };
}
