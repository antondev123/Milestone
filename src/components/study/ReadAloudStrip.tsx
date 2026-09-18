"use client";
// The pinned mini-player: the sentence being read as a one-line teleprompter that keeps the spoken
// word centred, block progress underneath, play/pause, one sentence back or forward, and speed.
import { useLayoutEffect, useRef, useState } from "react";
import { PauseGlyph, PlayGlyph, SkipIcon } from "@/components/carry/Icons";

export function ReadAloudStrip({
  words,
  wordIdx,
  progress,
  playing,
  loading,
  error,
  speed,
  onToggle,
  onPrev,
  onNext,
  onSpeed,
  onTapText,
}: {
  words: string[]; // the current sentence
  wordIdx: number; // index into `words`, -1 for none
  progress: number; // 0..1 through the block
  playing: boolean;
  loading: boolean;
  error: string | null;
  speed: number;
  onToggle: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSpeed: () => void;
  onTapText: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const line = useRef<HTMLDivElement>(null);
  const [shift, setShift] = useState(0);

  // slide the line so the spoken word sits mid-strip; never show empty space at either end
  useLayoutEffect(() => {
    const b = box.current;
    const l = line.current;
    if (!b || !l) return;
    const w = l.children[wordIdx] as HTMLElement | undefined;
    const bw = b.clientWidth;
    const lw = l.scrollWidth;
    if (lw <= bw) return setShift(0);
    let x = w ? bw / 2 - (w.offsetLeft + w.offsetWidth / 2) : 0;
    x = Math.min(0, Math.max(bw - lw, x));
    setShift(x);
  }, [wordIdx, words]);

  const status = error ? error : loading ? "Preparing audio…" : words.length === 0 ? "Read aloud" : null;

  return (
    <div className="flex h-[72px] items-center gap-1 bg-ink px-3 text-ground">
      <button type="button" onClick={onToggle} aria-label={playing ? "Pause" : "Play"} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full">
        {playing ? <PauseGlyph size={28} /> : <PlayGlyph size={28} />}
      </button>
      <button type="button" onClick={onTapText} className="min-w-0 flex-1 text-left" aria-label="Scroll to the sentence being read">
        <div ref={box} className="overflow-hidden whitespace-nowrap text-[15px] leading-[1.35]">
          {status ? (
            <span className={error ? "text-gold" : "text-muted-on-ink"}>{status}</span>
          ) : (
            <div ref={line} className="inline-block transition-transform duration-200 ease-out" style={{ transform: `translateX(${shift}px)` }}>
              {words.map((w, i) => (
                <span key={i} className={`${i === wordIdx ? "rounded-[3px] bg-gold/35 text-ground" : i < wordIdx ? "text-ground" : "text-muted-on-ink"} ${i > 0 ? "ml-[0.3em]" : ""}`}>
                  {w}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="mt-1.5 h-[3px] overflow-hidden rounded-sm bg-ink-track" aria-hidden="true">
          <div className="h-full bg-gold transition-[width] duration-300" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      </button>
      <button type="button" onClick={onPrev} aria-label="Previous sentence" className="flex h-11 w-10 shrink-0 items-center justify-center">
        <SkipIcon size={22} back />
      </button>
      <button type="button" onClick={onNext} aria-label="Next sentence" className="flex h-11 w-10 shrink-0 items-center justify-center">
        <SkipIcon size={22} />
      </button>
      <button type="button" onClick={onSpeed} aria-label="Playback speed" className="ml-0.5 flex h-8 shrink-0 items-center rounded-xl border border-muted-on-ink px-2 text-[13px] font-semibold">
        {speed}×
      </button>
    </div>
  );
}
