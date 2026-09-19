"use client";
// "Jump to" for Study mode, opened from the top-bar title:
// every teachable section, the current one marked, done ones labelled.
// Picking posts `goto` with "section N.M" (the page does that); nothing is locked.
import Link from "next/link";
import { LinesIcon } from "@/components/carry/Icons";
import { AssistantSheet } from "@/components/study/AssistantSheet";

export type PickerManifest = {
  chapters: { id: string; number: number; title: string; shortTitle?: string; quizFile?: string; sections: { id: string; number: string; title: string; kind?: string; segments: { id: string }[] }[] }[];
};

export function SectionPicker({
  open,
  onClose,
  manifest,
  hereSection,
  completed,
  busy,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  manifest: PickerManifest | null;
  hereSection: string; // "1.3"
  completed: Set<string>;
  busy: boolean;
  onPick: (sectionNumber: string) => void;
}) {
  return (
    <AssistantSheet open={open} onClose={onClose} title="Jump to" allSizes>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!manifest ? (
          <p className="text-[15px] text-muted" role="status">
            Loading the course…
          </p>
        ) : (
          manifest.chapters.map((ch) => {
            const teachable = ch.sections.filter((s) => s.segments.length > 0 && s.kind !== "summary");
            if (!teachable.length) return null;
            return (
              <div key={ch.id} className="mb-2">
                <p className="px-2 py-1.5 text-sm font-semibold text-muted">
                  {ch.number}. {ch.shortTitle || ch.title}
                </p>
                {teachable.map((s) => {
                  const here = s.number === hereSection;
                  const done = s.segments.every((g) => completed.has(g.id));
                  return (
                    <button
                      key={s.id}
                      type="button"
                      disabled={busy}
                      onClick={() => onPick(s.number)}
                      className={`flex min-h-11 w-full items-center gap-3 rounded-lg px-2 text-left text-[15px] hover:bg-panel disabled:opacity-40 ${here ? "font-semibold" : ""}`}
                    >
                      {here && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-gold ring-2 ring-ink" aria-hidden="true" />}
                      <span className="flex-1">
                        {s.number} {s.title}
                      </span>
                      {(here || done) && <span className="shrink-0 text-sm font-normal text-muted">{here ? "You are here" : "Done"}</span>}
                    </button>
                  );
                })}
              </div>
            );
          })
        )}
      </div>
      <Link href="/course" className="mt-3 flex min-h-10 items-center gap-2 border-t border-rule pt-3 text-[14px] font-semibold">
        <LinesIcon size={18} /> All chapters
      </Link>
    </AssistantSheet>
  );
}
