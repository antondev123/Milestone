"use client";
// The passage as a calm reading page: one paragraph per read-aloud block, sentence and word spans
// so the spoken word (gold) and sentence (gold rule, darker text) can be shown, tap a sentence to
// play from there, and an "Ask" chip on the current sentence. With audio off it is just the text.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { BlockIndex } from "@/lib/reading";
import type { Position } from "./useReadAloud";

const STRIP_H = 72; // px, the pinned player at the bottom (phone)
const TOP_H = 60; // px, sticky top bar plus its hairline

export function Reader({
  title,
  blocks,
  pos,
  audioOn,
  onTapSentence,
  onAsk,
  children,
}: {
  title: string;
  blocks: BlockIndex[];
  pos: Position | null;
  audioOn: boolean;
  onTapSentence: (pos: Position) => void;
  onAsk: (sentence: string) => void;
  children?: React.ReactNode; // rendered after the passage (the checkpoint on phones)
}) {
  const root = useRef<HTMLDivElement>(null);
  const [rule, setRule] = useState<{ top: number; height: number } | null>(null);
  const userScrolledAt = useRef(0);

  const curSentence = pos && audioOn ? blocks[pos.block]?.sentenceOf[pos.word] ?? -1 : -1;
  const curKey = pos && audioOn ? `${pos.block}:${curSentence}` : "";

  // the gold rule hugs the current sentence's line box; measured, not laid out, so multi-line sentences work
  useLayoutEffect(() => {
    if (!root.current || !curKey) return setRule(null);
    const el = root.current.querySelector<HTMLElement>(`[data-s="${curKey}"]`);
    if (!el) return setRule(null);
    const measure = () => {
      const rects = el.getClientRects();
      if (!rects.length || !root.current) return;
      const pr = root.current.getBoundingClientRect();
      const top = rects[0].top - pr.top;
      const bottom = rects[rects.length - 1].bottom - pr.top;
      setRule({ top: top + 2, height: Math.max(0, bottom - top - 4) });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [curKey]);

  // keep the spoken sentence inside a comfortable band, unless the reader just scrolled themselves
  useEffect(() => {
    const onUser = () => (userScrolledAt.current = Date.now());
    window.addEventListener("wheel", onUser, { passive: true });
    window.addEventListener("touchmove", onUser, { passive: true });
    return () => {
      window.removeEventListener("wheel", onUser);
      window.removeEventListener("touchmove", onUser);
    };
  }, []);
  useEffect(() => {
    if (!curKey || !root.current) return;
    if (Date.now() - userScrolledAt.current < 4000) return;
    const el = root.current.querySelector<HTMLElement>(`[data-s="${curKey}"]`);
    if (!el) return;
    const rects = el.getClientRects();
    if (!rects.length) return;
    const top = rects[0].top;
    const bottom = rects[rects.length - 1].bottom;
    const bandTop = TOP_H + 24;
    const bandBottom = window.innerHeight - STRIP_H - 48;
    if (top < bandTop || bottom > bandBottom) {
      window.scrollBy({ top: top - window.innerHeight * 0.3, behavior: "smooth" });
    }
  }, [curKey]);

  return (
    <div ref={root} className="relative">
      {rule && <div aria-hidden="true" className="absolute -left-4 w-[3px] rounded-sm bg-gold transition-[top,height] duration-200" style={rule} />}
      <h1 className="mb-6 font-display text-[34px] leading-[1.12] font-semibold tracking-[-0.015em]">{title}</h1>
      {blocks.map((b, bi) => (
        <p key={bi} className="mb-5 text-[19px] leading-[1.6]">
          {b.sentences.map((s, si) => {
            const isCur = pos?.block === bi && si === curSentence;
            return (
              <span key={si}>
                <span
                  data-s={`${bi}:${si}`}
                  role={audioOn ? "button" : undefined}
                  tabIndex={audioOn ? 0 : undefined}
                  onClick={audioOn ? () => onTapSentence({ block: bi, word: s.first }) : undefined}
                  onKeyDown={audioOn ? (e) => e.key === "Enter" && onTapSentence({ block: bi, word: s.first }) : undefined}
                  className={isCur ? "text-ink-deep" : audioOn ? "cursor-pointer" : ""}
                >
                  {b.words.slice(s.first, s.last + 1).map((w, k) => {
                    const wi = s.first + k;
                    const spoken = isCur && pos!.word === wi;
                    return (
                      <span key={wi}>
                        <span className={spoken ? "rounded-[3px] bg-gold/35 transition-colors duration-100" : undefined}>{w}</span>
                        {wi < s.last ? " " : ""}
                      </span>
                    );
                  })}
                </span>
                {isCur && (
                  <>
                    {" "}
                    <button
                      type="button"
                      onClick={() => onAsk(s.text)}
                      className="mx-1 inline-flex h-7 items-center rounded-full border border-ink px-2.5 align-middle text-[13px] font-semibold"
                    >
                      Ask
                    </button>
                  </>
                )}
                {si < b.sentences.length - 1 ? " " : ""}
              </span>
            );
          })}
        </p>
      ))}
      {children}
    </div>
  );
}
