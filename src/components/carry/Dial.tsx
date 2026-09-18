// Listen dial: one big pause/play button with the topic-progress ring around it. The button is
// only ever pause or play; state lives in the mic button, the state word and the strip.
import type { Leg } from "@/lib/view";
import { PauseGlyph, PlayGlyph } from "./Icons";

/** Progress through the topic as a 0–1 ring value. Moves once per part; never ticks. */
export function legRing(leg: Leg | undefined): number {
  if (!leg) return 0;
  return (leg.sectionIdx - 1 + leg.partIndex / leg.partCount) / leg.sectionCount;
}

const R = 124; // ring radius in a 260 box
const C = 2 * Math.PI * R;

export function Dial({
  glyph,
  progress,
  dimmed = false,
  disabled = false,
  size = 260,
  label,
  onTap,
}: {
  glyph: "pause" | "play";
  progress: number; // 0–1
  dimmed?: boolean;
  disabled?: boolean;
  size?: number;
  label: string;
  onTap: () => void;
}) {
  const p = Math.min(1, Math.max(0, progress));
  const btn = Math.round(size * (220 / 260));
  const icon = Math.round(size * (84 / 260));
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg viewBox="0 0 260 260" width={size} height={size} className="pointer-events-none absolute inset-0 -rotate-90" aria-hidden="true">
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
          strokeDashoffset={C * (1 - p)}
          style={{ transition: "stroke-dashoffset 400ms ease" }}
        />
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
