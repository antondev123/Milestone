// Listen dial: a 6px strip on the bottom edge is the voice chrome. Off when idle or paused,
// steady while the tutor speaks, dashed while it listens, a sweep while it thinks or connects.
// The only animated thing on the driving screen; globals.css stops it under reduced motion.
export type StripState = "off" | "steady" | "dashed" | "sweep";

export function VoiceStrip({ state }: { state: StripState }) {
  if (state === "off") return null;
  const look =
    state === "steady"
      ? { background: "linear-gradient(90deg, transparent, var(--color-gold) 30%, var(--color-gold) 70%, transparent)" }
      : state === "dashed"
        ? { background: "repeating-linear-gradient(90deg, var(--color-gold) 0 8px, transparent 8px 16px)" }
        : undefined;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 h-1.5 overflow-hidden" style={{ marginBottom: "env(safe-area-inset-bottom, 0px)" }} aria-hidden="true">
      {state === "sweep" ? (
        <div className="h-full w-[30%] bg-gold" style={{ animation: "strip-sweep 1.2s ease-in-out infinite alternate" }} />
      ) : (
        <div className="h-full w-full" style={look} />
      )}
    </div>
  );
}
