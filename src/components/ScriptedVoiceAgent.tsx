"use client";
// The Listen screen with its flow state driven from outside, for screen recordings (the judges'
// video, docs/DEMO.md "Fallbacks"). Same pieces as VoiceAgent's screen (Dial, mic, state line,
// hold-to-end, voice strip) but no session, no trip, no agent: `window.__voice.set({...})` puts the
// screen in any state, `window.__voice.earcon(name)` plays the app's own earcons. Reached only via
// /learn/voice?scripted=1; nothing in the UI links to it.
import { useEffect, useState } from "react";
import type { Leg, LegIndex } from "@/lib/view";
import { Dial, legRing, type Creep } from "./carry/Dial";
import { MicButton, type MicState } from "./carry/MicButton";
import { HoldButton } from "./carry/HoldButton";
import { VoiceStrip, type StripState } from "./carry/VoiceStrip";
import { WhereBlock } from "./carry/WhereBlock";
import { CheckIcon } from "./carry/Icons";
import { earcon, primeEarcons } from "./earcons";

export type ScriptedPhase = "off" | "connecting" | "speaking" | "listening" | "thinking" | "asking" | "paused";
type Flash = { kind: "correct" } | { kind: "milestone"; label: string };
type ScriptedState = { phase: ScriptedPhase; flash: Flash | null; creep: Creep | null; segmentId?: string };

declare global {
  interface Window {
    __voice?: {
      set: (s: Partial<ScriptedState>) => void;
      get: () => ScriptedState;
      earcon: (name: keyof typeof earcon) => void;
    };
  }
}

export function ScriptedVoiceAgent({ legs, startId, onPausedChange, onSegmentChange }: { legs: LegIndex; startId: string; onPausedChange: (paused: boolean) => void; onSegmentChange: (id: string) => void }) {
  const [state, setState] = useState<ScriptedState>({ phase: "off", flash: null, creep: null, segmentId: startId });
  const [holding, setHolding] = useState(false);
  const [mounted, setMounted] = useState(false); // the Dial's SVG is not SSR-stable (float rounding); the real screen never SSRs it either

  useEffect(() => {
    let cur = state;
    setMounted(true);
    window.__voice = {
      set: (s) => {
        cur = { ...cur, ...s };
        setState(cur);
        if (s.phase !== undefined) onPausedChange(s.phase === "paused");
        if (s.segmentId) onSegmentChange(s.segmentId);
      },
      get: () => cur,
      earcon: (name) => earcon[name](),
    };
    return () => {
      delete window.__voice;
    };
    // registered once; `cur` carries the latest state for the setter
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { phase, flash, creep, segmentId } = state;
  const leg: Leg | undefined = legs[segmentId ?? startId];
  const live = phase !== "off" && phase !== "connecting";
  const connecting = phase === "connecting";
  const isPaused = phase === "paused";
  const thinking = phase === "thinking";
  const tutorTalking = phase === "speaking";
  const asking = phase === "asking";

  // mirrors VoiceAgent's screen mapping, minus the reconnect and error branches
  const strip: StripState = !live && !connecting ? "off" : isPaused ? "off" : connecting || thinking ? "sweep" : tutorTalking ? "steady" : "dashed";
  const mic: MicState = !live || isPaused ? "off" : asking ? "question" : tutorTalking ? "rest" : "listening";
  let word: React.ReactNode;
  if (!live && !connecting) word = "Tap to start talking";
  else if (connecting) word = "Connecting";
  else if (isPaused) word = "Paused";
  else if (holding) word = "Keep holding";
  else if (flash)
    word = (
      <>
        <CheckIcon size={22} color="var(--color-gold)" />
        {flash.kind === "correct" ? <>That&rsquo;s right</> : flash.label}
      </>
    );
  else if (asking) word = <Bars>Answer out loud</Bars>;
  else if (thinking) word = "One sec";
  else if (tutorTalking) word = <Dotted>Speaking</Dotted>;
  else word = <Bars>Listening</Bars>;

  if (!mounted) return null;
  return (
    <div className="flex flex-1 flex-col gap-6">
      <WhereBlock leg={leg} />
      <div className="my-auto self-center">
        <Dial
          glyph={!live || isPaused ? "play" : "pause"}
          progress={legRing(leg)}
          creep={creep}
          sections={leg?.sectionCount}
          dimmed={connecting || thinking}
          disabled={connecting}
          size={260}
          label={!live ? "Start listening" : isPaused ? "Continue" : "Pause"}
          onTap={() => {
            primeEarcons();
            if (!live) window.__voice?.set({ phase: "connecting" });
          }}
        />
      </div>
      <div className="flex items-center justify-between gap-3 border-t-2 border-ink-track pt-4">
        <MicButton state={mic} onTap={() => {}} />
        <div className="flex min-h-11 flex-1 items-center justify-center gap-2.5 text-center text-[18px] text-muted-on-ink" aria-live="polite">
          {word}
        </div>
        <HoldButton onHold={() => {}} onHoldingChange={setHolding} disabled={!live} />
      </div>
      <VoiceStrip state={strip} />
    </div>
  );
}

function Dotted({ children }: { children: React.ReactNode }) {
  return (
    <>
      <span className="h-2.5 w-2.5 rounded-full bg-gold" aria-hidden="true" />
      {children}
    </>
  );
}

function Bars({ children }: { children: React.ReactNode }) {
  return (
    <>
      <span className="flex h-3.5 items-end gap-[3px]" aria-hidden="true">
        {[6, 14, 9, 12].map((h, i) => (
          <span key={i} className="w-[3px] rounded-[2px] bg-gold" style={{ height: h }} />
        ))}
      </span>
      {children}
    </>
  );
}
