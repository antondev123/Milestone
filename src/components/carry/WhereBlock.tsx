// Listen dial: the only words on the driving screen. Topic (chapter), Section, one dot per section.
import type { Leg } from "@/lib/view";

export function WhereBlock({ leg }: { leg: Leg | undefined }) {
  if (!leg) {
    return (
      <div className="flex flex-col gap-0.5">
        <div className="text-[15px] text-muted-on-ink">Topic</div>
        <div className="font-display text-[34px] leading-[1.12] font-semibold tracking-[-0.015em]">Getting your place…</div>
      </div>
    );
  }
  const dots = Array.from({ length: leg.sectionCount }, (_, i) => i + 1);
  return (
    <div className="flex flex-col">
      <div className="text-[15px] text-muted-on-ink">Topic</div>
      <h1 className="font-display text-[34px] leading-[1.12] font-semibold tracking-[-0.015em] text-balance">{leg.chapterTitle}</h1>
      <div className="mt-4 text-[15px] text-muted-on-ink">Section</div>
      <div className="text-[22px] leading-[1.25] font-semibold">{leg.sectionTitle}</div>
      {leg.sectionCount <= 8 ? (
        <div className="mt-3 flex gap-2" aria-label={`Section ${leg.sectionIdx} of ${leg.sectionCount}`} role="img">
          {dots.map((i) => (
            <span
              key={i}
              className={`h-3 w-3 rounded-full ${
                i < leg.sectionIdx ? "bg-gold" : i === leg.sectionIdx ? "bg-gold ring-2 ring-ground ring-offset-2 ring-offset-ink" : "bg-ink-track"
              }`}
            />
          ))}
        </div>
      ) : (
        <div className="mt-3 h-1.5 w-full rounded-full bg-ink-track" aria-label={`Section ${leg.sectionIdx} of ${leg.sectionCount}`} role="img">
          <div className="h-full rounded-full bg-gold" style={{ width: `${(leg.sectionIdx / leg.sectionCount) * 100}%` }} />
        </div>
      )}
    </div>
  );
}
