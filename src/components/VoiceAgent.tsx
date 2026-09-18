"use client";
// ElevenLabs Conversational AI wiring. The SERVER owns the learner's position (src/lib/cursor.ts);
// the agent LLM only ever sees `{ t: "<words to say>" }`. Tools run as CLIENT tools (in the browser)
// and call /api/tools/<name>, so no public URL is needed for local dev.
//
// Reading loop: the server returns one ~150-word block per `next` with `more: true`. When the agent
// finishes speaking (mode → listening) and nothing interrupted it, we send a text "continue" turn so
// the agent calls `next` again. Barge-in cancels the pending continue and tells the server, so the
// interrupted block is re-read after the driver's command. See docs/ELEVENLABS.md.
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
import { Dial, legRing } from "./carry/Dial";
import { MicButton, type MicState } from "./carry/MicButton";
import { HoldButton } from "./carry/HoldButton";
import { VoiceStrip, type StripState } from "./carry/VoiceStrip";
import { WhereBlock } from "./carry/WhereBlock";
import { CheckIcon } from "./carry/Icons";
import { earcon, primeEarcons, setEarconsEnabled } from "./earcons";

const CONTINUE = "continue";
const GRACE_MS = 700; // let a late barge-in win the race against auto-continue
const FLASH_MS = 3000; // "That's right" stays in the state line this long

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
};

function Inner({ plan, onTripEnd, onReply, legs, leg, paused: isPaused, onPausedChange }: Props) {
  const [err, setErr] = useState<string | null>(null);
  const [ctx, setCtx] = useState<number | null>(null);
  const [loc, setLoc] = useState<string>("");
  const [typed, setTyped] = useState("");
  const [asking, setAsking] = useState(false); // a question is waiting for the learner
  const [thinking, setThinking] = useState(false); // a tool call is in flight (grading, grounded ask)
  const [flash, setFlash] = useState<"correct" | null>(null);
  const [holding, setHolding] = useState(false);
  const agentId = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID;
  // ?debug=1 shows the mic/duck meter for calibrating thresholds in rehearsal
  const [debugOn] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).has("debug"));
  // The ducking hook needs `conv`, and `conv` needs these callbacks: bridge with a ref.
  const ducking = useRef<ReturnType<typeof useBargeInDucking> | null>(null);

  // flow state the LLM never sees
  const autoContinue = useRef(false); // server's `more`
  const barged = useRef(false);
  const timer = useRef<number | null>(null);
  const prefetch = useRef<Promise<ToolReply> | null>(null);
  const ended = useRef(false);
  const textOnly = useRef(false);
  const paused = useRef(false);
  const askingRef = useRef(false); // mirrors `asking` for the timers
  const mutedBeforePause = useRef(false);
  const flashTimer = useRef<number | null>(null);
  const prevLeg = useRef<Leg | undefined>(leg);
  const cancel = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };
  // The SDK throws "No active conversation" if a timer fires after endSession(). Swallow it.
  const sendUser = (text: string) => {
    try {
      if (!ended.current) conv.sendUserMessage(text);
    } catch {}
  };
  const sendContext = (text: string) => {
    try {
      if (!ended.current) conv.sendContextualUpdate(text);
    } catch {}
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
    earcon.end();
    try {
      await conv.endSession();
    } catch {}
    const id = tripId ?? (await post("end_trip")).tripId ?? "";
    onTripEnd(id);
  };

  const conv = useConversation({
    onMessage: (m) => {
      const msg = m as unknown as { message: string; source: "user" | "ai" | "agent" };
      if (msg.source === "user" && msg.message === CONTINUE) return; // synthetic
      if (msg.source === "user") {
        barged.current = true;
        cancel();
      }
      if (msg.source !== "user") ducking.current?.onAgentStarts();
      // never auto-"continue" into an open question: the agent would grade the word as the answer
      if (msg.source !== "user" && textOnly.current && autoContinue.current && !ended.current && !paused.current && !askingRef.current) {
        cancel();
        timer.current = window.setTimeout(() => sendUser(CONTINUE), 1500);
      }
    },
    onInterruption: () => {
      ducking.current?.onInterruption();
      barged.current = true;
      cancel();
      prefetch.current = null;
      void post("interrupted");
    },
    onModeChange: ({ mode }) => {
      if (mode === "speaking") {
        ducking.current?.onAgentStarts();
        barged.current = false;
        cancel();
        return;
      }
      // listening: the agent stopped talking, either naturally or because it was cut off
      if (!autoContinue.current || barged.current || ended.current || paused.current || askingRef.current) return;
      timer.current = window.setTimeout(() => {
        if (barged.current || paused.current) return;
        sendUser(CONTINUE);
      }, GRACE_MS);
    },
    onContextUsage: (u) => {
      const usage = u as unknown as { context_tokens?: number; context_limit_tokens?: number };
      if (usage.context_tokens) {
        setCtx(usage.context_tokens);
        console.log(`[ctx] ${usage.context_tokens}/${usage.context_limit_tokens ?? "?"}`);
      }
    },
    onError: (message) => setErr(String(message)),
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
    } else if (r.correct !== undefined || r.kind === "read") {
      askingRef.current = false;
      setAsking(false);
    }
    if (r.correct === true) {
      earcon.correct();
      setFlash("correct");
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = window.setTimeout(() => setFlash(null), FLASH_MS);
    }
    const next = r.segmentId ? legs?.[r.segmentId] : undefined;
    if (next && prevLeg.current && (next.chapter !== prevLeg.current.chapter || next.sectionIdx !== prevLeg.current.sectionIdx)) earcon.tick();
    if (next) prevLeg.current = next;
    onReply?.(r);
    return JSON.stringify({ t: r.say });
  };
  /** Every tool goes through here so the screen can show "One sec" while the server works. */
  const run = async (call: () => Promise<ToolReply>): Promise<string> => {
    setThinking(true);
    try {
      return absorb(await call());
    } finally {
      setThinking(false);
    }
  };

  useConversationClientTool("next", () =>
    run(async () => {
      const r = await post("next");
      if (r.more && r.kind === "read") void post("next", { peek: true }); // warm the next block (no commit)
      return r;
    }),
  );
  useConversationClientTool("explain", (p: { how?: string }) => run(() => post("explain", { how: p?.how ?? "simpler" })));
  useConversationClientTool("answer", (p: { text?: string }) => run(() => post("answer", { text: p?.text ?? "" })));
  useConversationClientTool("ask", (p: { question?: string }) => run(() => post("ask", { question: p?.question ?? "" })));
  useConversationClientTool("goto", (p: { target?: string }) => run(() => post("goto", { target: p?.target ?? "" })));
  useConversationClientTool("where_am_i", () => run(() => post("where_am_i")));
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

  // hard stop: a forgotten tab must not burn credits
  useEffect(() => {
    if (conv.status !== "connected") return;
    const nudge = window.setTimeout(
      () => sendContext("The trip is nearly over. Finish the current point, then call end_trip."),
      Math.max(30_000, (plan.estMinutes + 1) * 60_000),
    );
    const stop = window.setTimeout(() => void finish(), (plan.estMinutes + 3) * 60_000);
    return () => {
      clearTimeout(nudge);
      clearTimeout(stop);
    };
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
    conv.startSession({
      agentId,
      connectionType: textOnly.current ? "websocket" : "webrtc",
      textOnly: textOnly.current,
      overrides: { agent: { firstMessage: greeting } },
      dynamicVariables: { greeting, trip_id: plan.tripId },
    });
  }

  function setPaused(on: boolean) {
    paused.current = on;
    onPausedChange(on);
  }
  function pause() {
    if (paused.current || ended.current) return;
    setPaused(true);
    cancel();
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
  else if (flash === "correct")
    word = (
      <>
        <CheckIcon size={22} color="var(--color-gold)" />
        That&rsquo;s right
      </>
    );
  else if (conv.isMuted) word = <Dotted>Mic off</Dotted>;
  else if (asking) word = <Bars>Answer out loud</Bars>;
  else if (thinking) word = "One sec";
  else if (tutorTalking) word = <Dotted>Speaking</Dotted>;
  else word = <Bars>Listening</Bars>;

  const dialSize = textOnly.current && live ? 200 : 260;

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
          dimmed={connecting || thinking}
          disabled={connecting || conv.status === "error"}
          size={dialSize}
          label={!live ? "Start listening" : isPaused ? "Continue" : "Pause"}
          onTap={() => (!live ? start() : isPaused ? resume() : pause())}
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <MicButton state={mic} onTap={toggleMute} />
        <div className="flex min-h-11 flex-1 items-center justify-center gap-2.5 text-center text-[18px] text-muted-on-ink" aria-live="polite">
          {word}
        </div>
        <HoldButton onHold={() => void finish()} onHoldingChange={setHolding} disabled={!live} />
      </div>

      {/* ?text=1 only: the demo fallback and browsers without a mic. Never on a normal car session. */}
      {live && textOnly.current && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const t = typed.trim();
            if (!t) return;
            barged.current = true;
            cancel();
            sendUser(t);
            setTyped("");
          }}
          className="flex gap-2"
        >
          <label htmlFor="typed" className="sr-only">
            Type a command
          </label>
          <input
            id="typed"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="go, skip, quiz me…"
            className="min-h-14 flex-1 rounded-[14px] border-2 border-muted-on-ink bg-transparent px-4 text-[17px] text-ground outline-none placeholder:text-muted-on-ink focus:border-gold"
          />
          <button className="min-h-14 rounded-[14px] bg-gold px-5 text-[17px] font-bold text-ink">Send</button>
        </form>
      )}

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
