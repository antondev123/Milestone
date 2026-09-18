"use client";
import { useState } from "react";

const PRESETS = [5, 10, 15, 20, 30, 45];

export function TripPicker({
  label,
  onStart,
  busy,
}: {
  label: string;
  onStart: (minutes: number) => void;
  busy?: boolean;
}) {
  const [minutes, setMinutes] = useState(10);
  return (
    <div className="flex flex-1 flex-col justify-center gap-6">
      <div>
        <h1 className="text-2xl font-bold">{label}</h1>
        <p className="mt-1 text-slate-400">How long is this leg?</p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {PRESETS.map((m) => (
          <button
            key={m}
            onClick={() => setMinutes(m)}
            className={`rounded-xl px-3 py-4 text-lg font-semibold ${
              minutes === m ? "bg-emerald-500 text-slate-950" : "bg-slate-800"
            }`}
          >
            {m} min
          </button>
        ))}
      </div>
      <button
        disabled={busy}
        onClick={() => onStart(minutes)}
        className="rounded-xl bg-emerald-500 px-5 py-4 text-lg font-bold text-slate-950 disabled:opacity-50"
      >
        {busy ? "Planning…" : `Start ${minutes}-minute trip`}
      </button>
    </div>
  );
}
