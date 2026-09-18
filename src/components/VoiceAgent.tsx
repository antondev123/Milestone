"use client";
// ElevenLabs Conversational AI wiring. The SERVER owns the learner's position (src/lib/cursor.ts);
// the agent LLM only ever sees `{ t: "<words to say>" }`. Tools run as CLIENT tools (in the browser)
// and call /api/tools/<name>, so no public URL is needed for local dev.
//
// Reading loop: the server returns one ~150-word block per `next` with `more: true`. When the agent
// finishes speaking (mode → listening) and nothing interrupted it, we send a text "continue" turn so
// the agent calls `next` again. Barge-in cancels the pending continue and tells the server, so the
// interrupted block is re-read after the driver's command. See docs/ELEVENLABS.md.
import { ConversationProvider, useConversation, useConversationClientTool } from "@elevenlabs/react";
import { useEffect, useRef, useState } from "react";
import type { Plan, ToolReply } from "@/types/lesson";
import { useBargeInDucking } from "./useBargeInDucking";
import type { LegIndex } from "@/lib/view";
import { Feedback, stripVerdict } from "./carry/Feedback";
import { MicIcon, PlayGlyph } from "./carry/Icons";

type Line = { who: "you" | "agent"; text: string };

const CONTINUE = "continue";
const GRACE_MS = 700; // let a late barge-in win the race against auto-continue

async function post(tool: string, body: Record<string, unknown> = {}): Promise<ToolReply> {
  const r = await fetch(`/api/tools/${tool}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...body, mode: "voice" }),
  });
  return r.json() as Promise<ToolReply>;
}

function Inner({
  plan,
  onTripEnd,
  onReply,
  source,
  legs,
}: {
  plan: Plan;
  onTripEnd: (tripId: string) => void;
  onReply?: (r: ToolReply) => void;
  source?: string;
  legs?: LegIndex;
}) {
  const [lines, setLines] = useState<Line[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [ctx, setCtx] = useState<number | null>(null);
  const [loc, setLoc] = useState<string>("");
  const [typed, setTyped] = useState("");
  const [graded, setGraded] = useState<ToolReply | null>(null); // last graded answer, shown in the feedback box
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
  const cancel = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  const conv = useConversation({
    onMessage: (m) => {
      const msg = m as unknown as { message: string; source: "user" | "ai" | "agent" };
      if (msg.source === "user" && msg.message === CONTINUE) return; // synthetic, keep the transcript clean
      if (msg.source === "user") {
        barged.current = true;
        cancel();
      }
      setLines((prev) => [...prev, { who: msg.source === "user" ? "you" : "agent", text: msg.message }]);
      if (msg.source !== "user") ducking.current?.onAgentStarts();
      if (msg.source !== "user" && textOnly.current && autoContinue.current && !ended.current) {
        cancel();
        timer.current = window.setTimeout(() => {
          if (ended.current) return;
          conv.sendUserMessage(CONTINUE);
        }, 1500);
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
      if (!autoContinue.current || barged.current || ended.current) return;
      timer.current = window.setTimeout(() => {
        if (barged.current || ended.current) return;
        conv.sendUserMessage(CONTINUE);
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

  ducking.current = useBargeInDucking(conv, debugOn);
  const { ducked, debug } = ducking.current;
  // `ducked` flips the orb the instant we hear the driver; isSpeaking lags by a few hundred ms
  const tutorTalking = conv.isSpeaking && !ducked;

  /** Keep everything except the words away from the LLM. */
  const absorb = (r: ToolReply): string => {
    autoContinue.current = r.more === true && !ended.current;
    if (r.loc) setLoc(r.loc);
    if (r.correct !== undefined) setGraded(r);
    else if (r.kind === "read" || r.kind === "ask") setGraded(null);
    onReply?.(r);
    if (r.kind === "end" && r.tripId) {
      ended.current = true;
      autoContinue.current = false;
      const id = r.tripId;
      setTimeout(() => onTripEnd(id), 4000); // let the agent say the closing line
    }
    return JSON.stringify({ t: r.say });
  };

  useConversationClientTool("next", async () => {
    const r = await post("next");
    if (r.more && r.kind === "read") void post("next", { peek: true }); // warm the next block (no commit)
    return absorb(r);
  });
  useConversationClientTool("explain", async (p: { how?: string }) => absorb(await post("explain", { how: p?.how ?? "simpler" })));
  useConversationClientTool("answer", async (p: { text?: string }) => absorb(await post("answer", { text: p?.text ?? "" })));
  useConversationClientTool("ask", async (p: { question?: string }) => absorb(await post("ask", { question: p?.question ?? "" })));
  useConversationClientTool("goto", async (p: { target?: string }) => absorb(await post("goto", { target: p?.target ?? "" })));
  useConversationClientTool("where_am_i", async () => absorb(await post("where_am_i")));
  useConversationClientTool("end_trip", async () => absorb(await post("end_trip")));

  // hard stop: a forgotten tab must not burn credits
  useEffect(() => {
    if (conv.status !== "connected") return;
    const nudge = window.setTimeout(
      () => conv.sendContextualUpdate("The trip is nearly over. Finish the current point, then call end_trip."),
      Math.max(30_000, (plan.estMinutes + 1) * 60_000),
    );
    const stop = window.setTimeout(async () => {
      if (ended.current) return;
      ended.current = true;
      conv.endSession();
      const s = await post("end_trip");
      onTripEnd(s.tripId ?? "");
    }, (plan.estMinutes + 3) * 60_000);
    return () => {
      clearTimeout(nudge);
      clearTimeout(stop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conv.status]);

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
    conv.startSession({
      agentId,
      connectionType: textOnly.current ? "websocket" : "webrtc",
      textOnly: textOnly.current,
      overrides: { agent: { firstMessage: greeting } },
      dynamicVariables: { greeting, trip_id: plan.tripId },
    });
  }

  const live = conv.status === "connected";
  const caption = lines.filter((l) => l.who === "agent").at(-1)?.text;
  const heard = lines.at(-1)?.who === "you" ? lines.at(-1)?.text : undefined;
  const where = graded?.segmentId ? legs?.[graded.segmentId] : undefined;

  let label = "Ready when you are";
  if (conv.status === "connecting") label = "Connecting";
  else if (conv.status === "error") label = "Something went wrong";
  else if (live) label = conv.isMuted ? "Mic muted" : tutorTalking ? "Now playing" : "Listening";

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex flex-1 flex-col justify-center gap-3.5" aria-live="polite">
        <div className="text-[15px] text-muted-on-ink">{label}</div>
        <p className="font-display text-[30px] leading-[1.3]">
          {caption ?? (live ? "…" : "Tap play and the tutor picks up where you are. Talk any time to answer or interrupt.")}
        </p>
        {heard && (
          <div className="flex flex-col gap-1">
            <span className="text-sm text-muted-on-ink">Heard</span>
            <p className="font-display text-[22px] italic">&ldquo;{heard}&rdquo;</p>
          </div>
        )}
        {graded && <Feedback correct={graded.correct === true} text={stripVerdict(graded.say)} source={`From ${source ?? "the course"}${where ? `, section ${where.section}` : ""}`} dark />}
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
      </div>

      {err && (
        <div role="status" className="rounded-xl bg-ink-raised px-4 py-3 text-[15px]">
          {err}
        </div>
      )}

      <div className="flex flex-col items-center gap-3">
        {/* Not live: play starts the session. Live: mic-only mute; the session stays open and the tutor's audio keeps streaming. */}
        <button
          type="button"
          onClick={() => (live ? conv.setMuted(!conv.isMuted) : start())}
          disabled={conv.status === "connecting"}
          aria-label={!live ? "Start listening" : conv.isMuted ? "Unmute the mic" : "Mute the mic"}
          aria-pressed={live ? conv.isMuted : undefined}
          className={`flex h-[92px] w-[92px] items-center justify-center rounded-full disabled:opacity-60 ${
            live && conv.isMuted ? "border-2 border-gold text-gold" : "bg-gold text-ink"
          } ${tutorTalking ? "ring-4 ring-gold/30" : ""}`}
        >
          {!live ? <PlayGlyph /> : <MicIcon size={34} />}
        </button>
        <p className="text-center text-sm text-muted-on-ink">
          {!live ? "Play" : conv.isMuted ? "Mic muted. The tutor keeps talking; tap to answer." : "Mic on. Just talk to answer or interrupt."}
        </p>
      </div>

      {live && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const t = typed.trim();
            if (!t) return;
            barged.current = true;
            cancel();
            conv.sendUserMessage(t);
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
            placeholder="Mic trouble? Type: go, skip, quiz me"
            className="min-h-12 flex-1 rounded-[14px] bg-ink-raised px-4 text-[15px] text-ground outline-none placeholder:text-muted-on-ink focus:ring-2 focus:ring-gold"
          />
          <button className="min-h-12 rounded-[14px] bg-ground px-4 text-[15px] font-bold text-ink">Send</button>
        </form>
      )}

      <p className="text-center text-sm text-muted-on-ink">Say: go, repeat, explain differently, go deeper, skip, where am I, quiz me, or ask anything.</p>

      {live && (
        <button
          type="button"
          onClick={async () => {
            ended.current = true;
            cancel();
            conv.endSession();
            const s = await post("end_trip");
            onTripEnd(s.tripId ?? "");
          }}
          className="min-h-11 self-center text-[15px] font-semibold underline underline-offset-4"
        >
          End trip
        </button>
      )}
    </div>
  );
}

export function VoiceAgent({
  plan,
  onTripEnd,
  onReply,
  source,
  legs,
}: {
  plan: Plan;
  onTripEnd: (tripId: string) => void;
  onReply?: (r: ToolReply) => void;
  source?: string;
  legs?: LegIndex;
}) {
  return (
    <ConversationProvider>
      <Inner plan={plan} onTripEnd={onTripEnd} onReply={onReply} source={source} legs={legs} />
    </ConversationProvider>
  );
}
