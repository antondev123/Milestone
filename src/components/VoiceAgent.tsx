"use client";
// ElevenLabs Conversational AI wiring. The SERVER owns the learner's position (src/lib/cursor.ts);
// the agent LLM only ever sees `{ t: "<words to say>" }`. Tools run as CLIENT tools (in the browser)
// and call /api/tools/<name>, so no public URL is needed for local dev.
//
// Reading loop: the server returns one ~250-word block per `next` with `more: true`. When the agent
// finishes speaking (mode → listening) and nothing interrupted it, we send a text "continue" turn so
// the agent calls `next` again. Barge-in cancels the pending continue and tells the server, so the
// interrupted block is re-read after the driver's command. See docs/ELEVENLABS.md.
// Every turn boundary is a short silence (the agent's LLM turn plus TTS start), which is why blocks
// are long and the grace window short; the `next` round trip itself is ~15 ms and already warmed.
//
// Screen: the car-mode Dial (docs/DESIGN.md §4.3). No lesson text; Topic and Section are the only
// words. One pause/play dial with the topic ring, a mic button that carries the mic states, hold-to-end,
// a one-word state line and a 6px voice strip. Every state change has an earcon so the screen is optional.
//
// Pause has no SDK primitive on WebRTC. Pause = output volume 0, mic closed, auto-continue gated, and
// `interrupted` posted so the server marks the block unheard. Continue = volume and mic back, then a
// "continue" turn: the agent calls `next` and the same block is read again from its start.
import { ConversationProvider, useConversation, useConversationClientTool } from "@elevenlabs/react";
import { useEffect, useRef, useState } from "react";
import type { Plan, ToolReply } from "@/types/lesson";
import { useBargeInDucking } from "./useBargeInDucking";
import type { Leg, LegIndex } from "@/lib/view";
import { milestoneLabel } from "@/lib/milestones";
import { Dial, legRing, legRingEnd, type Creep } from "./carry/Dial";
import { WORDS_PER_MIN } from "@/lib/chunk";
import { MicButton, type MicState } from "./carry/MicButton";
import { HoldButton } from "./carry/HoldButton";
import { VoiceStrip, type StripState } from "./carry/VoiceStrip";
import { WhereBlock } from "./carry/WhereBlock";
import { CheckIcon } from "./carry/Icons";
import { earcon, primeEarcons, setEarconsEnabled } from "./earcons";
import { clientLog, flushLog, installErrorLog, setLogSession } from "@/lib/log/client";
import { useMicRecorder } from "./useMicRecorder";

const CONTINUE = "continue";
const GRACE_MS = 300; // let a late barge-in win the race against auto-continue; every ms here is silence between blocks
// mode → listening also fires in the gaps between TTS chunks (most under 300 ms, a few per session up to
// 1.5 s). An utterance cannot be over before its words could have been said at the fastest rate the voice
// runs at (measured 165–215 wpm on eleven_flash_v2 in the session log), so until then a "listening" is
// jitter, not the end of the turn, and auto-continue waits for the rest of that lower bound instead of firing.
const GATE_WPM = 220;
const SYNTHETIC_INTERRUPT_MS = 1500; // an `interruption` this soon after our own "continue" is that continue, not the driver
const UNSPOKEN_MS = 3000; // a tool reply with words that the agent has not started saying by then gets a nudge
const NUDGE = "say it"; // the prompt answers this with the pending t
const FLASH_MS = 3000; // "That's right" / a milestone label stays in the state line this long
// Trips are open-ended, so this is not a trip length: it is the credit guard for a forgotten tab.
const HARD_STOP_MS = 2 * 60 * 60_000;

type Flash = { kind: "correct" } | { kind: "milestone"; label: string };

async function post(tool: string, body: Record<string, unknown> = {}): Promise<ToolReply> {
  const r = await fetch(`/api/tools/${tool}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...body, mode: "voice" }),
  });
  return r.json() as Promise<ToolReply>;
}

type Props = {
  plan: Plan;
  onTripEnd: (tripId: string) => void;
  onReply?: (r: ToolReply) => void;
  legs?: LegIndex;
  leg?: Leg; // where the learner is now; drives the Where block and the ring
  paused: boolean;
  onPausedChange: (paused: boolean) => void;
  voiceId?: string; // learner's pick from /settings; undefined keeps the agent's dashboard voice
};

function Inner({ plan, onTripEnd, onReply, legs, leg, paused: isPaused, onPausedChange, voiceId }: Props) {
  const [err, setErr] = useState<string | null>(null);
  const [ctx, setCtx] = useState<number | null>(null);
  const [loc, setLoc] = useState<string>("");
  const [asking, setAsking] = useState(false); // a question is waiting for the learner
  const [thinking, setThinking] = useState(false); // a tool call is in flight (grading, grounded ask)
  const [flash, setFlash] = useState<Flash | null>(null);
  const [holding, setHolding] = useState(false);
  const [creep, setCreep] = useState<Creep | null>(null); // the ring's target while a block is being spoken
  const agentId = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID;
  // ?debug=1 shows the mic/duck meter for calibrating thresholds in rehearsal
  const [debugOn] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).has("debug"));
  // The ducking hook needs `conv`, and `conv` needs these callbacks: bridge with a ref.
  const ducking = useRef<ReturnType<typeof useBargeInDucking> | null>(null);
  // session log: events batch to /api/log/events, mic to /api/log/audio (see src/lib/log)
  const recorder = useMicRecorder();
  const vadHigh = useRef(false);
  useEffect(() => {
    installErrorLog();
    setLogSession(plan.tripId);
  }, [plan.tripId]);

  // flow state the LLM never sees
  const autoContinue = useRef(false); // server's `more`
  const barged = useRef(false);
  const timer = useRef<number | null>(null);
  const pendingCreep = useRef<Creep | null>(null); // computed from the read reply, started when speech starts
  const ended = useRef(false);
  const textOnly = useRef(false);
  const paused = useRef(false);
  const askingRef = useRef(false); // mirrors `asking` for the timers
  const thinkingRef = useRef(false); // mirrors `thinking`: a tool is in flight, so no auto-continue
  const mutedBeforePause = useRef(false);
  const flashTimer = useRef<number | null>(null);
  const prevLeg = useRef<Leg | undefined>(leg);
  const modeRef = useRef<"speaking" | "listening">("listening");
  const speechStart = useRef(0); // when the agent's current utterance started (its transcript arrives as speech starts)
  const speechMs = useRef(0); // the least time that utterance can take to say
  const continuedAt = useRef(0); // when we last sent the synthetic "continue"
  const unspoken = useRef<number | null>(null); // watchdog: a tool reply the agent has not started speaking
  const cancel = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };
  const clearUnspoken = () => {
    if (unspoken.current) {
      clearTimeout(unspoken.current);
      unspoken.current = null;
    }
  };
  // The SDK throws "No active conversation" if a timer fires after endSession(). Swallow it.
  const sendUser = (text: string) => {
    try {
      if (ended.current) return;
      if (text === CONTINUE) continuedAt.current = Date.now();
      conv.sendUserMessage(text);
    } catch {}
  };
  /**
   * Send "continue" once the agent has really finished its utterance. A "listening" that arrives before
   * the words could have been spoken is a gap between TTS chunks: wait out the remaining estimate and
   * look again, rather than barge in on our own tutor (which marked the block unheard and re-read it).
   */
  const armContinue = () => {
    cancel();
    const remaining = speechStart.current + speechMs.current - Date.now();
    timer.current = window.setTimeout(
      () => {
        timer.current = null;
        if (barged.current || paused.current || ended.current || askingRef.current || thinkingRef.current) return;
        if (modeRef.current !== "listening") return; // it started speaking again: the next listening re-arms
        if (speechStart.current + speechMs.current > Date.now()) return armContinue(); // a later utterance moved the bound
        sendUser(CONTINUE);
      },
      Math.max(GRACE_MS, remaining + GRACE_MS),
    );
  };
  /**
   * The one way a voice trip ends. Idempotent: the agent's end_trip tool, the End button and the
   * hard-stop timer all land here, and only the first caller does anything. Close the session
   * first so nothing (auto-continue, ducking, the agent) can fire another tool mid-navigation,
   * then hand over to the summary. Calls the server at most once per trip.
   */
  const finish = async (tripId?: string) => {
    if (ended.current) return;
    ended.current = true;
    autoContinue.current = false;
    cancel();
    clearUnspoken();
    earcon.end();
    recorder.stop();
    clientLog("status", { status: "ending", by: tripId ? "agent" : "user" });
    try {
      await conv.endSession();
    } catch {}
    const id = tripId ?? (await post("end_trip")).tripId ?? "";
    flushLog();
    onTripEnd(id);
  };

  const conv = useConversation({
    onConnect: (p) => {
      const { conversationId } = p as unknown as { conversationId?: string };
      clientLog("status", { status: "connected", conversationId, textOnly: textOnly.current });
      if (conversationId) void fetch("/api/log/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId: plan.tripId, convId: conversationId }) }).catch(() => {});
    },
    onDisconnect: (d) => {
      clientLog("disconnect", d as unknown as Record<string, unknown>);
      flushLog();
    },
    onStatusChange: ({ status }) => clientLog("status", { status }),
    onDebug: (d) => {
      const dbg = d as unknown as { type?: string; response?: string };
      if (dbg?.type === "tentative_agent_response") clientLog("tentative", { text: dbg.response });
    },
    onVadScore: ({ vadScore }) => {
      // sampled: one row when speech starts and one when it stops, not 20 per second
      const high = vadScore >= 0.5;
      if (high !== vadHigh.current) {
        vadHigh.current = high;
        clientLog("vad", { speaking: high, score: Math.round(vadScore * 100) / 100 });
      }
    },
    onMessage: (m) => {
      const msg = m as unknown as { message: string; source: "user" | "ai" | "agent"; event_id?: number };
      if (msg.source === "user" && (msg.message === CONTINUE || msg.message === NUDGE)) return; // synthetic
      clientLog("transcript", { role: msg.source === "user" ? "user" : "agent", text: msg.message, eventId: msg.event_id });
      if (msg.source === "user") {
        // The learner spoke: the server's next reply decides whether reading carries on (`more`).
        // Without this, the agent's filler while `ask` runs would re-trigger "continue" and the
        // answer would be spoken over by the next block.
        barged.current = true;
        autoContinue.current = false;
        cancel();
      }
      if (msg.source !== "user") {
        ducking.current?.onAgentStarts();
        clearUnspoken(); // the agent is saying the reply
        // the transcript lands as the speech starts: this is the clock the auto-continue gate runs on
        speechStart.current = Date.now();
        speechMs.current = (msg.message.split(/\s+/).filter(Boolean).length / GATE_WPM) * 60_000;
      }
      // never auto-"continue" into an open question: the agent would grade the word as the answer
      if (msg.source !== "user" && textOnly.current && autoContinue.current && !ended.current && !paused.current && !askingRef.current && !thinkingRef.current) {
        cancel();
        timer.current = window.setTimeout(() => sendUser(CONTINUE), 1500);
      }
    },
    onInterruption: () => {
      // Our own "continue" landing on the audio tail is reported as an interruption too. That is not the
      // driver, so the block stays heard: posting `interrupted` here made the server re-read it ("Back to it.").
      const synthetic = Date.now() - continuedAt.current < SYNTHETIC_INTERRUPT_MS;
      clientLog("interruption", synthetic ? { synthetic } : {});
      if (synthetic) return;
      ducking.current?.onInterruption();
      barged.current = true;
      cancel();
      setCreep(null); // the ring holds where the tutor was cut off
      void post("interrupted");
    },
    onModeChange: ({ mode }) => {
      clientLog("mode_change", { mode });
      modeRef.current = mode;
      if (mode === "speaking") {
        ducking.current?.onAgentStarts();
        barged.current = false;
        cancel();
        // the block's words are now being spoken: creep the ring to the block's end over its speaking time
        if (pendingCreep.current) {
          setCreep(pendingCreep.current);
          pendingCreep.current = null;
        }
        return;
      }
      // listening: the agent stopped talking, either naturally or because it was cut off.
      setCreep(null); // the ring holds until the next block is spoken
      // A tool in flight means this was a filler, not a block: wait for the reply.
      if (!autoContinue.current || barged.current || ended.current || paused.current || askingRef.current || thinkingRef.current) return;
      armContinue();
    },
    onContextUsage: (u) => {
      const usage = u as unknown as { context_tokens?: number; context_limit_tokens?: number };
      if (usage.context_tokens) {
        setCtx(usage.context_tokens);
        console.log(`[ctx] ${usage.context_tokens}/${usage.context_limit_tokens ?? "?"}`);
        clientLog("ctx_usage", { tokens: usage.context_tokens, limit: usage.context_limit_tokens, model: (u as unknown as { model?: string }).model });
      }
    },
    onError: (message, context) => {
      clientLog("client_error", { message: String(message), source: "elevenlabs", context });
      setErr(String(message));
    },
  });

  ducking.current = useBargeInDucking(conv, debugOn, () => paused.current);
  const { ducked, debug } = ducking.current;
  // `ducked` flips the screen the instant we hear the driver; isSpeaking lags by a few hundred ms
  const tutorTalking = conv.isSpeaking && !ducked;

  /** Keep everything except the words away from the LLM. Everything else here feeds the screen. */
  const absorb = (r: ToolReply): string => {
    autoContinue.current = r.more === true && !ended.current;
    if (r.loc) setLoc(r.loc);
    if (r.kind === "ask") {
      askingRef.current = true;
      setAsking(true);
      earcon.ask();
    } else if (r.correct !== undefined || r.kind === "read" || r.more) {
      // `more` means the server wants reading to carry on, so no question is open (e.g. after a skip)
      askingRef.current = false;
      setAsking(false);
    }
    const showFlash = (f: Flash) => {
      setFlash(f);
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = window.setTimeout(() => setFlash(null), FLASH_MS);
    };
    if (r.correct === true) {
      earcon.correct();
      showFlash({ kind: "correct" });
    }
    // a milestone earned on the road: the line is spoken, the earcon and label make it land while driving
    if (r.milestones?.length) {
      earcon.milestone();
      showFlash({ kind: "milestone", label: milestoneLabel(r.milestones[0]) });
    }
    // a section or chapter finished (the spoken line names it); the ring notches on the Dial
    const next = r.segmentId ? legs?.[r.segmentId] : undefined;
    if (next && prevLeg.current && (next.chapter !== prevLeg.current.chapter || next.sectionIdx !== prevLeg.current.sectionIdx)) earcon.section();
    if (next) prevLeg.current = next;
    // The ring creeps through the part: this block's slice of it over the block's speaking time.
    // It starts when the agent actually starts speaking (mode → speaking); text-only has no speech, so start now.
    if (r.kind === "read" && r.block && next) {
      const start = legRing(next);
      const span = legRingEnd(next) - start;
      const words = r.say.split(/\s+/).filter(Boolean).length;
      const c: Creep = { to: start + (span * (r.block.idx + 1)) / r.block.count, ms: (words / WORDS_PER_MIN) * 60_000 };
      if (textOnly.current) setCreep(c);
      else pendingCreep.current = c;
    } else {
      pendingCreep.current = null;
      setCreep(null);
    }
    onReply?.(r);
    // the course itself ran out and the server ended the trip: speak the closing line, then hand over
    if (r.kind === "end" && r.tripId) {
      autoContinue.current = false;
      const id = r.tripId;
      setTimeout(() => void finish(id), 4000);
    }
    return JSON.stringify({ t: r.say });
  };
  /** Every tool goes through here so the screen can show "One sec" while the server works. */
  const run = async (tool: string, call: () => Promise<ToolReply>): Promise<string> => {
    thinkingRef.current = true;
    setThinking(true);
    try {
      const r = await call();
      const out = absorb(r);
      // Belt and braces for the reply going unsaid (pre-tool speech used to close the agent's turn before a
      // slow `ask` came back, and the answer was never spoken). If nothing is being said by then, log it so
      // the session log shows the failure, and nudge once: the prompt answers "say it" with the pending t.
      if (r.say && !ended.current) {
        clearUnspoken();
        unspoken.current = window.setTimeout(() => {
          unspoken.current = null;
          if (ended.current || paused.current || modeRef.current !== "listening") return;
          clientLog("reply_unspoken", { tool });
          sendUser(NUDGE);
        }, UNSPOKEN_MS);
      }
      return out;
    } finally {
      thinkingRef.current = false;
      setThinking(false);
    }
  };

  useConversationClientTool("next", () =>
    run("next", async () => {
      const r = await post("next");
      if (r.more && r.kind === "read") void post("next", { peek: true }); // warm the next block (no commit)
      return r;
    }),
  );
  useConversationClientTool("explain", (p: { how?: string }) => run("explain", () => post("explain", { how: p?.how ?? "simpler" })));
  useConversationClientTool("answer", (p: { text?: string }) => run("answer", () => post("answer", { text: p?.text ?? "" })));
  useConversationClientTool("ask", (p: { question?: string }) => run("ask", () => post("ask", { question: p?.question ?? "" })));
  useConversationClientTool("goto", (p: { target?: string }) => run("goto", () => post("goto", { target: p?.target ?? "" })));
  useConversationClientTool("where_am_i", () => run("where_am_i", () => post("where_am_i")));
  useConversationClientTool("end_trip", async () => {
    const r = await post("end_trip");
    if (r.tripId) {
      autoContinue.current = false;
      onReply?.(r);
      const id = r.tripId;
      setTimeout(() => void finish(id), 4000); // let the agent say the closing line first
    }
    return JSON.stringify({ t: r.say });
  });

  // hard stop: the trip has no planned length, but a forgotten tab must not burn credits
  useEffect(() => {
    if (conv.status !== "connected") return;
    const stop = window.setTimeout(() => void finish(), HARD_STOP_MS);
    return () => clearTimeout(stop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conv.status]);

  useEffect(
    () => () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    },
    [],
  );

  function start() {
    if (!agentId) {
      setErr("NEXT_PUBLIC_ELEVENLABS_AGENT_ID is not set");
      return;
    }
    setErr(null);
    ended.current = false;
    // The greeting is spoken, then reading starts by itself: arm auto-continue so the first
    // mode → listening sends "continue" and the agent calls `next`. No "go" needed.
    autoContinue.current = true;
    barged.current = false;
    const greeting = plan.greeting ?? "Ready when you are.";
    // ?text=1 → text-only session (no mic, no TTS): same agent, same tools. For debugging and for
    // browsers without microphone access. Auto-continue then keys off agent messages instead of speech.
    textOnly.current = new URLSearchParams(window.location.search).get("text") === "1";
    primeEarcons(); // inside the user's tap, so the browser lets later earcons play
    setEarconsEnabled(!textOnly.current);
    clientLog("status", { status: "start", textOnly: textOnly.current, ua: navigator.userAgent });
    if (!textOnly.current) void recorder.start(plan.tripId);
    conv.startSession({
      agentId,
      connectionType: textOnly.current ? "websocket" : "webrtc",
      textOnly: textOnly.current,
      // The agent must allow the tts.voice_id override (scripts/configure-agent.ts) or the session is refused.
      overrides: { agent: { firstMessage: greeting }, ...(voiceId ? { tts: { voiceId } } : {}) },
      dynamicVariables: { greeting, trip_id: plan.tripId },
    });
  }

  function setPaused(on: boolean) {
    paused.current = on;
    onPausedChange(on);
  }
  function pause() {
    if (paused.current || ended.current) return;
    clientLog("pause", { on: true });
    setPaused(true);
    cancel();
    setCreep(null); // the ring holds; the re-read after Continue creeps on from here
    barged.current = true; // whatever the agent finishes saying now does not count as heard
    mutedBeforePause.current = conv.isMuted;
    try {
      conv.setVolume({ volume: 0 });
      conv.setMuted(true);
    } catch {}
    void post("interrupted");
    // A user turn cuts the agent off server-side; the prompt answers "pause" with "Holding." and waits.
    sendUser("pause");
    earcon.pause();
  }
  function resume() {
    if (!paused.current || ended.current) return;
    clientLog("pause", { on: false });
    setPaused(false);
    cancel();
    barged.current = true; // a late mode→listening from the silent tail must not double-send
    try {
      conv.setVolume({ volume: 1 });
      conv.setMuted(mutedBeforePause.current);
    } catch {}
    earcon.resume();
    // Mid-question, "continue" would be graded as an answer; "repeat" re-serves the question (explain again).
    sendUser(askingRef.current ? "repeat the question" : CONTINUE);
  }
  function toggleMute() {
    if (!live || paused.current || textOnly.current) return;
    const next = !conv.isMuted;
    try {
      conv.setMuted(next);
    } catch {
      return; // no mic to mute (text-only, or permission denied)
    }
    clientLog("mute", { muted: next });
    if (next) earcon.mute();
    else earcon.unmute();
  }

  const live = conv.status === "connected";
  const connecting = conv.status === "connecting";

  // ----- the screen is a pure function of the flow state -----
  const strip: StripState = !live && !connecting ? "off" : isPaused ? "off" : connecting || thinking ? "sweep" : tutorTalking ? "steady" : "dashed";
  const mic: MicState = !live || isPaused || textOnly.current ? "off" : conv.isMuted ? "muted" : asking ? "question" : tutorTalking ? "rest" : "listening";
  let word: React.ReactNode;
  if (conv.status === "error") word = "Something went wrong";
  else if (!live && !connecting) word = "Tap to start talking";
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
  else if (conv.isMuted) word = <Dotted>Mic off</Dotted>;
  else if (asking) word = <Bars>Answer out loud</Bars>;
  else if (thinking) word = "One sec";
  else if (tutorTalking) word = <Dotted>Speaking</Dotted>;
  else word = <Bars>Listening</Bars>;

  const dialSize = 260;

  return (
    <div className="flex flex-1 flex-col gap-6">
      <WhereBlock leg={leg} />

      {err && (
        <div role="status" className="rounded-xl bg-ink-raised px-4 py-3 text-[15px]">
          {err}
        </div>
      )}

      <div className="my-auto self-center">
        <Dial
          glyph={!live || isPaused ? "play" : "pause"}
          progress={legRing(leg)}
          creep={creep}
          sections={leg?.sectionCount}
          dimmed={connecting || thinking}
          disabled={connecting || conv.status === "error"}
          size={dialSize}
          label={!live ? "Start listening" : isPaused ? "Continue" : "Pause"}
          onTap={() => (!live ? start() : isPaused ? resume() : pause())}
        />
      </div>

      <div className="flex items-center justify-between gap-3 border-t-2 border-ink-track pt-4">
        <MicButton state={mic} onTap={toggleMute} />
        <div className="flex min-h-11 flex-1 items-center justify-center gap-2.5 text-center text-[18px] text-muted-on-ink" aria-live="polite">
          {word}
        </div>
        <HoldButton onHold={() => void finish()} onHoldingChange={setHolding} disabled={!live} />
      </div>


      {debugOn && live && (
        <p className="font-mono text-[11px] text-gold">
          in {debug.input.toFixed(3)} · floor {debug.floor.toFixed(3)} · ratio {debug.ratio.toFixed(2)} · out {debug.output.toFixed(3)} · {debug.phase.toUpperCase()}
        </p>
      )}
      {debugOn && (loc || ctx !== null) && (
        <p className="text-[11px] text-muted-on-ink">
          {loc}
          {ctx !== null ? ` · agent context ${ctx} tokens` : ""}
        </p>
      )}

      <VoiceStrip state={strip} />
    </div>
  );
}

/** State word with the gold dot: the tutor is speaking. */
function Dotted({ children }: { children: React.ReactNode }) {
  return (
    <>
      <span className="h-2.5 w-2.5 rounded-full bg-gold" aria-hidden="true" />
      {children}
    </>
  );
}

/** State word with four static bars: the mic is open. */
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

export function VoiceAgent(props: Props) {
  return (
    <ConversationProvider>
      <Inner {...props} />
    </ConversationProvider>
  );
}
