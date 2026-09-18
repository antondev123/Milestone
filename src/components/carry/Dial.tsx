// Listen dial: one big pause/play button with the topic-progress ring around it. The button is
// only ever pause or play; state lives in the mic button, the state word and the strip.
// The ring is notched at each section boundary, so it doubles as the "section n of N" marker.
// It creeps forward while the tutor reads (`creep`: the block's end value over its speaking time),
// holds where it is on pause or barge-in, and only ever moves backwards on a "go back".
import { useEffect, useId, useRef, useState } from "react";
import type { Leg } from "@/lib/view";
import { PauseGlyph, PlayGlyph } from "./Icons";

/** Ring value (0–1) at the start of the current part. */
export function legRing(leg: Leg | undefined): number {
  if (!leg) return 0;
  return (leg.sectionIdx - 1 + (leg.partIndex - 1) / leg.partCount) / leg.sectionCount;
}

/** Ring value (0–1) at the end of the current part; the creep never passes it. */
export function legRingEnd(leg: Leg | undefined): number {
  if (!leg) return 0;
  return (leg.sectionIdx - 1 + leg.partIndex / leg.partCount) / leg.sectionCount;
}

export type Creep = { to: number; ms: number };

const R = 124; // ring radius in a 260 box
const C = 2 * Math.PI * R;
const NOTCH = 4; // notch width in the 260 box; cut through the ring so the page shows through
const TICK_MS = 250; // creep step; the CSS transition blends the steps

export function Dial({
  glyph,
  progress,
  creep = null,
  sections = 1,
  dimmed = false,
  disabled = false,
  size = 260,
  label,
  onTap,
}: {
  glyph: "pause" | "play";
  progress: number; // 0–1, the committed value (start of the current part)
  creep?: Creep | null; // while set, the ring moves linearly toward `to` over `ms`
  sections?: number; // notch the ring into this many sections
  dimmed?: boolean;
  disabled?: boolean;
  size?: number;
  label: string;
  onTap: () => void;
}) {
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const [shown, setShown] = useState(() => clamp(progress));
  const shownRef = useRef(shown);
  const prevProgress = useRef(progress);
  shownRef.current = shown;

  // A committed move forward lifts the ring if the creep fell short; a move backwards (goto back) snaps it.
  useEffect(() => {
    const p = clamp(progress);
    if (p < prevProgress.current || p > shownRef.current) setShown(p);
    prevProgress.current = p;
  }, [progress]);

  useEffect(() => {
    if (!creep) return;
    const from = shownRef.current;
    const to = clamp(creep.to);
    if (to <= from || creep.ms <= 0) return;
    const rate = (to - from) / creep.ms; // ring units per ms
    const t0 = performance.now();
    const id = window.setInterval(() => {
      const v = Math.min(to, from + rate * (performance.now() - t0));
      setShown(v);
      if (v >= to) window.clearInterval(id);
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [creep]);

  const btn = Math.round(size * (220 / 260));
  const icon = Math.round(size * (84 / 260));
  const mask = `dial-notches-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  // Boundaries between sections; the svg is rotated -90deg, so angle 0 (+x) lands at the top.
  const notches = Array.from({ length: Math.max(0, sections - 1) }, (_, i) => ((i + 1) / sections) * 2 * Math.PI);
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg viewBox="0 0 260 260" width={size} height={size} className="pointer-events-none absolute inset-0 -rotate-90" aria-hidden="true">
        <mask id={mask} maskUnits="userSpaceOnUse" x="0" y="0" width="260" height="260">
          <rect width="260" height="260" fill="white" />
          {notches.map((a) => (
            <line
              key={a}
              x1={130 + (R - 8) * Math.cos(a)}
              y1={130 + (R - 8) * Math.sin(a)}
              x2={130 + (R + 8) * Math.cos(a)}
              y2={130 + (R + 8) * Math.sin(a)}
              stroke="black"
              strokeWidth={NOTCH}
            />
          ))}
        </mask>
        <g mask={`url(#${mask})`}>
          <circle cx="130" cy="130" r={R} fill="none" stroke="var(--color-ink-track)" strokeWidth="8" />
          <circle
            cx="130"
            cy="130"
            r={R}
            fill="none"
            stroke="var(--color-gold)"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - shown)}
            style={{ transition: `stroke-dashoffset ${creep ? TICK_MS + 50 : 400}ms linear` }}
          />
        </g>
      </svg>
      <button
        type="button"
        onClick={onTap}
        disabled={disabled}
        aria-label={label}
        className={`relative grid place-items-center rounded-full bg-gold text-ink disabled:opacity-60 ${dimmed ? "opacity-60" : ""}`}
        style={{ width: btn, height: btn }}
      >
        {glyph === "pause" ? <PauseGlyph size={icon} /> : <PlayGlyph size={icon} />}
      </button>
    </div>
  );
}
