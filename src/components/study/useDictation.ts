"use client";
// Mic for the assistant composer: record a clip with MediaRecorder, post it to /api/stt, hand the
// text back. Three states so the button can show them. Auto-stops after MAX_MS so a forgotten mic
// does not run forever. Hidden entirely (`supported` false) where MediaRecorder is missing.
import { useCallback, useEffect, useRef, useState } from "react";

export type DictationState = "idle" | "recording" | "transcribing";

const MAX_MS = 30_000;
const MIMES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

function pickMime(): string | undefined {
  return MIMES.find((m) => MediaRecorder.isTypeSupported(m));
}

export function useDictation(onResult: (text: string) => void) {
  const [state, setState] = useState<DictationState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState(false);
  const rec = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(onResult);
  latest.current = onResult;

  useEffect(() => {
    setSupported(typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia);
  }, []);

  const stop = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const r = rec.current;
    if (r && r.state !== "inactive") r.stop();
  }, []);

  const start = useCallback(async () => {
    if (rec.current) return;
    setError(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Mic blocked — check browser permissions");
      return;
    }
    const mime = pickMime();
    const r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks: Blob[] = [];
    r.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    r.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      rec.current = null;
      const blob = new Blob(chunks, { type: r.mimeType || mime || "audio/webm" });
      if (blob.size === 0) {
        setState("idle");
        return;
      }
      setState("transcribing");
      try {
        const form = new FormData();
        form.append("audio", blob, "question");
        const res = await fetch("/api/stt", { method: "POST", body: form });
        const data = (await res.json()) as { text?: string; reason?: string };
        if (!res.ok) throw new Error(data.reason || `stt ${res.status}`);
        const text = (data.text ?? "").trim();
        if (text) latest.current(text);
        else setError("Didn't catch that, try again");
      } catch (e) {
        console.warn(`[stt] ${(e as Error).message}`);
        setError("Couldn't transcribe, try again");
      }
      setState("idle");
    };
    rec.current = r;
    r.start();
    setState("recording");
    timer.current = setTimeout(stop, MAX_MS);
  }, [stop]);

  const toggle = useCallback(() => {
    if (state === "recording") stop();
    else if (state === "idle") void start();
  }, [state, start, stop]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      const r = rec.current;
      if (r) {
        r.onstop = null;
        if (r.state !== "inactive") r.stop();
        r.stream.getTracks().forEach((t) => t.stop());
      }
    },
    [],
  );

  return { state, error, supported, start, stop, toggle };
}
