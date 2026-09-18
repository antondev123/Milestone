"use client";
// How long is this trip? Feeds the planner. Carry styling; `dark` for Listen mode.
import { useState } from "react";

const PRESETS = [5, 10, 15, 20, 30, 45];

export function TripPicker({
  label,
  onStart,
  busy,
  dark = false,
}: {
  label: string;
  onStart: (minutes: number) => void;
  busy?: boolean;
  dark?: boolean;
}) {
  const [minutes, setMinutes] = useState(10);
  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className={`text-[15px] ${dark ? "text-muted-on-ink" : "text-muted"}`}>{label}</div>
        <h1 className="font-display text-[34px] leading-[1.12] font-semibold tracking-[-0.015em]">How long is this trip?</h1>
      </div>
      <div className="grid grid-cols-3 gap-3" role="radiogroup" aria-label="Trip length">
        {PRESETS.map((m) => {
          const on = minutes === m;
          return (
            <button
              key={m}
              role="radio"
              aria-checked={on}
              onClick={() => setMinutes(m)}
              className={`min-h-16 rounded-[14px] text-lg font-semibold ${
                on ? (dark ? "bg-gold text-ink" : "bg-ink text-ground") : dark ? "bg-ink-raised text-ground" : "bg-panel text-ink"
              }`}
            >
              {m} min
            </button>
          );
        })}
      </div>
      <button
        disabled={busy}
        onClick={() => onStart(minutes)}
        className="mt-auto flex min-h-[60px] w-full items-center justify-center rounded-2xl bg-gold px-5 text-lg font-bold text-ink disabled:opacity-60"
      >
        {busy ? "Planning your trip…" : `Start a ${minutes}-minute trip`}
      </button>
    </div>
  );
}
