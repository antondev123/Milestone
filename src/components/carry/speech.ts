"use client";
// Browser speech in and out. No keys, no extra data for audio files: the phone's own
// voice reads the lesson, and word-boundary events tell us the exact character reached.
import { useCallback, useEffect, useRef, useState } from "react";

type SpeakHandlers = {
  onStart?: () => void;
  onBoundary?: (charIndex: number) => void;
  onEnd?: () => void;
  onBlocked?: () => void; // autoplay refused: needs a tap
};

function pickVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const en = voices.filter((v) => v.lang?.toLowerCase().startsWith("en"));
  const rank = (v: SpeechSynthesisVoice) =>
    (v.lang.toLowerCase() === "en-za" ? 40 : 0) +
    (v.lang.toLowerCase() === "en-gb" ? 20 : 0) +
    (/natural|neural|online|google/i.test(v.name) ? 10 : 0) +
    (v.localService ? 1 : 0);
  return en.sort((a, b) => rank(b) - rank(a))[0] ?? voices[0] ?? null;
}

export function useSpeaker() {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [ready, setReady] = useState(false);
  const voice = useRef<SpeechSynthesisVoice | null>(null);
  const gen = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setSupported(false);
      return;
    }
    setSupported(true);
    const synth = window.speechSynthesis;
    const load = () => {
      const vs = synth.getVoices();
      if (vs.length) {
        voice.current = pickVoice(vs);
        setReady(true);
      }
    };
    load();
    synth.addEventListener("voiceschanged", load);
    // some engines never fire voiceschanged and speak fine with the default voice
    const t = setTimeout(() => setReady(true), 1500);
    return () => {
      synth.removeEventListener("voiceschanged", load);
      clearTimeout(t);
      gen.current++;
      synth.cancel();
    };
  }, []);

  const cancel = useCallback(() => {
    gen.current++;
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  }, []);

  const speak = useCallback((text: string, h: SpeakHandlers = {}) => {
    const synth = window.speechSynthesis;
    const my = ++gen.current;
    synth.cancel();
    synth.resume(); // Chrome can get stuck in a paused state
    const u = new SpeechSynthesisUtterance(text);
    if (voice.current) {
      u.voice = voice.current;
      u.lang = voice.current.lang;
    }
    u.rate = 1;
    u.onstart = () => my === gen.current && h.onStart?.();
    u.onboundary = (e) => {
      if (my === gen.current && e.name === "word") h.onBoundary?.(e.charIndex);
    };
    u.onend = () => my === gen.current && h.onEnd?.();
    u.onerror = (e) => {
      if (my !== gen.current) return;
      if (e.error === "not-allowed") h.onBlocked?.();
      else if (e.error !== "interrupted" && e.error !== "canceled") h.onEnd?.();
    };
    synth.speak(u);
  }, []);

  return { supported, ready, speak, cancel };
}

// ---------- speech to text ----------

interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
}

function recognitionCtor(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useListener() {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState("");
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<Recognition | null>(null);

  useEffect(() => {
    setSupported(!!recognitionCtor());
    return () => rec.current?.abort();
  }, []);

  /** Listen for one answer. Resolves with the final transcript ("" if nothing was caught). */
  const listen = useCallback(
    () =>
      new Promise<string>((resolve) => {
        const Ctor = recognitionCtor();
        if (!Ctor) return resolve("");
        rec.current?.abort();
        const r = new Ctor();
        rec.current = r;
        r.lang = "en-ZA";
        r.interimResults = true;
        r.continuous = false;
        r.maxAlternatives = 1;
        let text = "";
        setHeard("");
        setError(null);
        r.onresult = (e) => {
          text = Array.from(e.results)
            .map((res) => res[0]?.transcript ?? "")
            .join(" ")
            .trim();
          setHeard(text);
        };
        r.onerror = (e) => {
          if (e.error === "not-allowed" || e.error === "service-not-allowed") setError("mic-blocked");
          else if (e.error === "network") setError("network");
          else if (e.error !== "no-speech" && e.error !== "aborted") setError(e.error);
        };
        r.onend = () => {
          setListening(false);
          resolve(text);
        };
        setListening(true);
        try {
          r.start();
        } catch {
          setListening(false);
          resolve("");
        }
      }),
    [],
  );

  const stop = useCallback(() => rec.current?.stop(), []);
  const abort = useCallback(() => {
    rec.current?.abort();
    setListening(false);
  }, []);

  return { supported, listening, heard, error, listen, stop, abort, setHeard };
}
