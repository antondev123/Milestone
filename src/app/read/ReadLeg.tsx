"use client";
// Read mode: light, calm, text-first. Short paragraphs, two per page, one thumb.
// Every page turn saves the exact place, so "Listen instead" starts on the same sentence.
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Mode } from "@/types/lesson";
import { paragraphs, sentenceAt, sentences } from "@/lib/text";
import { BackLink, ModePill, PrimaryButton, Screen, SignalNotice, TopBar } from "@/components/carry/Chrome";
import { usePlace } from "@/components/carry/usePlace";

const PARAS_PER_PAGE = 2;

export function ReadLeg(props: {
  segmentId: string;
  title: string;
  script: string;
  legNumber: number;
  legTotal: number;
  offset: number;
  atCheck: boolean;
  lastMode: Mode | null;
}) {
  const { segmentId, script, offset, atCheck } = props;
  const router = useRouter();
  const { save, flush, trouble } = usePlace("text");
  const [leaving, setLeaving] = useState(false);

  const sents = useMemo(() => sentences(script), [script]);
  const resumed = offset > 0 && !atCheck;
  const startIdx = resumed ? sentenceAt(sents, offset) : 0;
  const pages = useMemo(() => {
    const paras = paragraphs(sents, startIdx);
    const out: (typeof paras)[] = [];
    for (let i = 0; i < paras.length; i += PARAS_PER_PAGE) out.push(paras.slice(i, i + PARAS_PER_PAGE));
    return out;
  }, [sents, startIdx]);
  const [page, setPage] = useState(atCheck ? pages.length - 1 : 0);
  const last = page >= pages.length - 1;
  const current = pages[page] ?? [];
  const pageStart = current[0]?.[0]?.start ?? 0;
  const pageEnd = current.at(-1)?.at(-1)?.end ?? script.length;
  // keep the precise (possibly mid-sentence) offset until the reader actually turns a page
  const place = page === 0 && resumed ? offset : pageStart;

  useEffect(() => {
    save({ segmentId, position: atCheck ? "checkpoint" : "start", offset: place });
  }, [save, segmentId, atCheck, place]);

  function turn() {
    setPage((p) => p + 1);
    window.scrollTo({ top: 0 });
  }

  async function go(href: string, checkpoint = false) {
    setLeaving(true);
    if (checkpoint) save({ segmentId, position: "checkpoint", offset: script.length });
    await flush();
    router.push(href);
  }

  const prev = resumed && page === 0 && startIdx > 0 ? sents[startIdx - 1].text : null;

  return (
    <Screen gap="gap-[22px]">
      <TopBar
        left={<BackLink href="/" />}
        title={`Leg ${props.legNumber} of ${props.legTotal}`}
        right={<ModePill to="listen" onClick={() => go("/listen")} />}
      />

      <div
        className="h-1 overflow-hidden rounded-sm bg-track"
        role="progressbar"
        aria-label="Progress through this leg"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round((pageEnd / script.length) * 100)}
      >
        <div className="h-1 bg-ink transition-[width] duration-300" style={{ width: `${(pageEnd / script.length) * 100}%` }} />
      </div>

      <h1 className="font-display text-[28px] leading-[1.15] font-semibold tracking-[-0.01em]">{props.title}</h1>

      {prev && <p className="text-[17px] leading-[1.6] text-muted">{prev}</p>}

      {resumed && page === 0 && (
        <div className="flex items-center gap-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-gold ring-2 ring-ink" aria-hidden="true" />
          <span className="text-sm font-semibold">
            {props.lastMode === "voice" ? "Picked up where you stopped listening" : "Picked up where your last trip ended"}
          </span>
        </div>
      )}
      {atCheck && page === pages.length - 1 && (
        <div className="flex items-center gap-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-gold ring-2 ring-ink" aria-hidden="true" />
          <span className="text-sm font-semibold">You finished reading this leg. The check is next.</span>
        </div>
      )}

      <div className="flex flex-col gap-4">
        {current.map((para, i) => (
          <p key={`${page}-${i}`} className="text-[19px] leading-[1.6]">
            {para.map((s) => s.text).join(" ")}
          </p>
        ))}
      </div>

      <div className="sticky bottom-0 -mx-6 mt-auto flex flex-col gap-2.5 bg-ground px-6 pt-3 pb-1">
        <SignalNotice show={trouble} />
        {last ? (
          <PrimaryButton onClick={() => go("/check?from=read", true)} disabled={leaving}>
            Check my understanding
          </PrimaryButton>
        ) : (
          <PrimaryButton onClick={turn}>Continue</PrimaryButton>
        )}
        <div className="text-center text-sm text-muted">Get off any time. Your place is saved.</div>
      </div>
    </Screen>
  );
}
