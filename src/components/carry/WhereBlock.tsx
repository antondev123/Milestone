// Listen dial: the only words on the driving screen. Topic (chapter) and Section; the dial ring's
// notches show which section of the topic you are in.
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
  return (
    <div className="flex flex-col">
      <div className="text-[15px] text-muted-on-ink">Topic</div>
      <h1 className="font-display text-[34px] leading-[1.12] font-semibold tracking-[-0.015em] text-balance">{leg.chapterTitle}</h1>
      <div className="mt-4 text-[15px] text-muted-on-ink">
        Section<span className="sr-only">{` ${leg.sectionIdx} of ${leg.sectionCount}`}</span>
      </div>
      <div className="text-[22px] leading-[1.25] font-semibold">{leg.sectionTitle}</div>
    </div>
  );
}
