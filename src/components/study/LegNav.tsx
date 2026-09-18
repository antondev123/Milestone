"use client";
// Leg footer for Study mode: always there after the passage, so moving on never depends on the
// checkpoint. Previous / Next are outlined until the leg's checkpoint is done, then Next goes gold
// (one primary button per screen, docs/DESIGN.md §3). Labels never change through the flow (§5).
import Link from "next/link";
import { PrimaryButton } from "@/components/carry/Chrome";
import { LinesIcon } from "@/components/carry/Icons";

export type LegLink = { id: string; caption: string }; // caption: "1.2 · Title"

export function LegNav({ prev, next, primaryNext, disabled, onGo }: { prev: LegLink | null; next: LegLink | null; primaryNext: boolean; disabled?: boolean; onGo: (id: string) => void }) {
  const outlined = "flex min-h-[60px] w-full items-center justify-center rounded-2xl border-2 border-ink px-4 text-[17px] font-semibold disabled:opacity-40";
  return (
    <nav aria-label="Legs" className="mt-10 flex flex-col gap-4 border-t border-rule pt-6">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <button type="button" disabled={disabled || !prev} onClick={() => prev && onGo(prev.id)} className={outlined}>
            Previous leg
          </button>
          {prev && <span className="truncate text-center text-[13px] text-muted">{prev.caption}</span>}
        </div>
        <div className="flex flex-col gap-1.5">
          {next && primaryNext ? (
            <PrimaryButton onClick={() => onGo(next.id)} disabled={disabled}>
              Next leg
            </PrimaryButton>
          ) : (
            <button type="button" disabled={disabled || !next} onClick={() => next && onGo(next.id)} className={outlined}>
              Next leg
            </button>
          )}
          <span className="truncate text-center text-[13px] text-muted">{next ? next.caption : "Last leg of the course"}</span>
        </div>
      </div>
      <Link href="/course" className="flex min-h-10 items-center gap-2 text-[14px] font-semibold">
        <LinesIcon size={18} /> All chapters
      </Link>
    </nav>
  );
}
