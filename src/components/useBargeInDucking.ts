"use client";
// Local barge-in ducking. The server takes ~0.5–1 s to confirm an interruption
// (it needs transcribed words, then the LiveKit playout buffer drains). We watch
// the local mic meter while the tutor is talking and drop the output volume the
// moment voice energy appears, then let the server's `interruption` event confirm
// (hold silence) or a timeout reject (fade back). Everything here is reversible:
// we only touch the output volume, never the conversation state.
import { useEffect, useRef, useState } from "react";
import type { useConversation } from "@elevenlabs/react";

type Conv = ReturnType<typeof useConversation>;
type Phase = "idle" | "ducked" | "confirmed" | "restoring";

const POLL_MS = 50;
const CANDIDATE_POLLS = 3; // 150 ms of sustained voice energy before ducking
const RATIO = 2.5; // input must exceed floor × RATIO ...
const FLOOR_MIN_DELTA = 0.04; // ... and floor + this, so a silent room does not trigger on nothing
const SPEECH_BAND: [number, number] = [300, 3400]; // Hz; road rumble lives below this
const SPEECH_RATIO = 0.5; // share of energy that must sit in the speech band
const FLOOR_ALPHA = 0.05; // EMA speed for the noise floor
const OUTPUT_ACTIVE = 0.02; // agent audio is playing if its meter is above this
const DUCK_LEVEL = 0.1; // provisional duck; a false alarm is a dip, not a cut
const FALSE_ALARM_MS = 1000; // no server confirmation within this → restore
const RESTORE_MS = 200;

// The SDK's frequency buffer is resampled linearly over 100–8000 Hz.
const BUFFER_MIN_HZ = 100;
const BUFFER_MAX_HZ = 8000;

export type DuckingDebug = { input: number; floor: number; ratio: number; output: number; phase: Phase };

export function useBargeInDucking(conv: Conv, debugEnabled = false) {
  const [ducked, setDucked] = useState(false);
  const [debug, setDebug] = useState<DuckingDebug>({ input: 0, floor: 0, ratio: 0, output: 0, phase: "idle" });

  const phase = useRef<Phase>("idle");
  const floor = useRef(0);
  const streak = useRef(0);
  const duckedAt = useRef(0);
  const confirmedAt = useRef(0);
  const convRef = useRef(conv);
  convRef.current = conv;

  const connected = conv.status === "connected";

  function setPhase(p: Phase) {
    phase.current = p;
    setDucked(p === "ducked" || p === "confirmed");
  }

  function restore() {
    // element.volume has no ramp, so step it back up over RESTORE_MS
    setPhase("restoring");
    const steps = 4;
    let i = 0;
    const tick = () => {
      i += 1;
      convRef.current.setVolume({ volume: Math.min(1, DUCK_LEVEL + ((1 - DUCK_LEVEL) * i) / steps) });
      if (i < steps) setTimeout(tick, RESTORE_MS / steps);
      else if (phase.current === "restoring") setPhase("idle");
    };
    tick();
  }

  /** Server confirmed the barge-in: hold silence until the agent speaks again. */
  function onInterruption() {
    if (phase.current === "ducked") {
      convRef.current.setVolume({ volume: 0 });
      confirmedAt.current = Date.now();
      setPhase("confirmed");
    }
  }

  /** Agent started a new utterance: back to full volume. */
  function onAgentStarts() {
    if (phase.current === "confirmed") {
      convRef.current.setVolume({ volume: 1 });
      setPhase("idle");
    }
  }

  useEffect(() => {
    if (!connected) return;
    floor.current = 0;
    streak.current = 0;
    const id = setInterval(() => {
      const c = convRef.current;
      const input = c.getInputVolume();
      const output = c.getOutputVolume();
      const agentTalking = output > OUTPUT_ACTIVE || c.isSpeaking;

      // Share of energy in the speech band. Rejects low-frequency road noise.
      const bins = c.getInputByteFrequencyData();
      const n = bins.length;
      const idx = (hz: number) => Math.round(((hz - BUFFER_MIN_HZ) / (BUFFER_MAX_HZ - BUFFER_MIN_HZ)) * n);
      let total = 0;
      let speech = 0;
      for (let i = 0; i < n; i++) {
        total += bins[i];
        if (i >= idx(SPEECH_BAND[0]) && i < idx(SPEECH_BAND[1])) speech += bins[i];
      }
      const ratio = total > 0 ? speech / total : 0;

      const p = phase.current;
      if (p === "idle") {
        if (agentTalking) {
          if (floor.current === 0) floor.current = input; // seed
          const threshold = Math.max(floor.current * RATIO, floor.current + FLOOR_MIN_DELTA);
          const candidate = input > threshold && ratio > SPEECH_RATIO;
          streak.current = candidate ? streak.current + 1 : 0;
          if (!candidate) floor.current += FLOOR_ALPHA * (input - floor.current);
          if (streak.current >= CANDIDATE_POLLS) {
            c.setVolume({ volume: DUCK_LEVEL });
            duckedAt.current = Date.now();
            streak.current = 0;
            setPhase("ducked");
          }
        } else {
          streak.current = 0;
        }
      } else if (p === "ducked" && Date.now() - duckedAt.current > FALSE_ALARM_MS) {
        restore();
      } else if (p === "confirmed" && output > OUTPUT_ACTIVE && Date.now() - confirmedAt.current > 400) {
        // fallback: new agent audio is flowing but no mode-change event arrived yet.
        // The 400 ms guard lets the interrupted audio's tail drain first.
        onAgentStarts();
      }

      if (debugEnabled) setDebug({ input, floor: floor.current, ratio, output, phase: phase.current });
    }, POLL_MS);

    return () => {
      clearInterval(id);
      convRef.current.setVolume({ volume: 1 });
      setPhase("idle");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, debugEnabled]);

  return { ducked, debug, onInterruption, onAgentStarts };
}
