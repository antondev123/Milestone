"use client";
// Settings: pick the reading voice. Eight rows in the answer-button style (docs/DESIGN.md §3):
// tap the row to choose, tap the round button to hear the sample. Samples are static files under
// public/voices/, so a preview costs nothing and works offline once cached.
import { useEffect, useRef, useState } from "react";
import type { Voice } from "@/lib/voices";
import { PlayIcon, StopIcon } from "@/components/carry/Icons";
import { postJSON } from "@/components/carry/net";

type Props = { voices: Voice[]; current: string };

export function VoicePicker({ voices, current }: Props) {
  const [chosen, setChosen] = useState<string>(current);
  const [playing, setPlaying] = useState<string | null>(null);
  const [trouble, setTrouble] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const a = new Audio();
    a.preload = "none";
    const stop = () => setPlaying(null);
    a.addEventListener("ended", stop);
    a.addEventListener("error", stop);
    audio.current = a;
    return () => {
      a.pause();
      a.removeEventListener("ended", stop);
      a.removeEventListener("error", stop);
    };
  }, []);

  function toggleSample(v: Voice) {
    const a = audio.current;
    if (!a) return;
    if (playing === v.id) {
      a.pause();
      setPlaying(null);
      return;
    }
    a.pause();
    a.src = v.sample;
    setPlaying(v.id);
    a.play().catch(() => setPlaying(null));
  }

  async function choose(v: Voice) {
    const before = chosen;
    setChosen(v.id);
    setTrouble(false);
    try {
      const r = await postJSON<{ current: string }>("/api/voice", { voiceId: v.id });
      if (r.current !== v.id) throw new Error("not saved");
    } catch {
      setChosen(before);
      setTrouble(true);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2.5" role="list">
        {voices.map((v) => {
          const selected = chosen === v.id;
          const isPlaying = playing === v.id;
          return (
            <li key={v.id} className="flex items-stretch gap-2.5">
              <button
                type="button"
                aria-pressed={selected}
                onClick={() => choose(v)}
                className={`flex min-h-16 min-w-0 flex-1 items-center justify-between gap-3 rounded-[14px] bg-panel px-4 text-left ring-inset ${selected ? "ring-2 ring-ink" : "ring-1 ring-rule"}`}
              >
                <span className="flex min-w-0 flex-col">
                  <span className="text-[17px] font-semibold">{v.name}</span>
                  <span className="truncate text-[14px] text-muted">{v.blurb}</span>
                </span>
                {selected && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-gold ring-2 ring-ink" aria-hidden="true" />}
              </button>
              <button
                type="button"
                onClick={() => toggleSample(v)}
                aria-label={isPlaying ? `Stop ${v.name} sample` : `Play ${v.name} sample`}
                aria-pressed={isPlaying}
                className={`flex w-14 shrink-0 items-center justify-center rounded-[14px] ${isPlaying ? "bg-ink text-ground" : "bg-panel text-ink ring-1 ring-rule ring-inset"}`}
              >
                {isPlaying ? <StopIcon /> : <PlayIcon />}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="text-[14px] text-muted">{trouble ? "Could not save that. Check your signal and try again." : "Applies to Listen and to read-aloud in Study."}</p>
    </div>
  );
}
