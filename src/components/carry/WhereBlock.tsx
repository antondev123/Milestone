// Listen dial: the only words on the driving screen. Topic (chapter) and Section; the dial ring's
// notches show which section of the topic you are in.
import type { Leg } from "@/lib/view";

export function WhereBlock({ leg }: { leg: Leg | undefined }) {
  if (!leg) {
    return (
      <div className="flex flex-col gap-2.5">
        <div className="h-0.5 bg-muted-on-ink" aria-hidden="true" />
        <div className="text-[15px] text-muted-on-ink">Topic</div>
        <div className="font-display text-[34px] leading-[1.12] font-semibold tracking-[-0.015em]">Getting your place…</div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <div className="mb-1.5 h-0.5 bg-muted-on-ink" aria-hidden="true" />
      <div className="text-[15px] text-muted-on-ink">Topic</div>
      <h1 className="font-display text-[34px] leading-[1.12] font-semibold tracking-[-0.015em] text-balance">{leg.chapterTitle}</h1>
      <div className="my-2 h-px bg-ink-track" aria-hidden="true" />
      <div className="text-[15px] text-muted-on-ink">
        Section<span className="sr-only">{` ${leg.sectionIdx} of ${leg.sectionCount}`}</span>
      </div>
      <div className="text-[22px] leading-[1.25] font-semibold">{leg.sectionTitle}</div>
    </div>
  );
}
