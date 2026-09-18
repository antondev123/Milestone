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

function Inner({ plan, onTripEnd, onReply }: { plan: Plan; onTripEnd: (tripId: string) => void; onReply?: (r: ToolReply) => void }) {
  const [lines, setLines] = useState<Line[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [ctx, setCtx] = useState<number | null>(null);
  const [loc, setLoc] = useState<string>("");
  const [typed, setTyped] = useState("");
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
    const greeting = plan.greeting ?? "Ready when you are. Say go.";
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

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="rounded-2xl bg-slate-900 p-5 text-center">
        <div
          className={`mx-auto mb-3 h-24 w-24 rounded-full transition-all ${
            !live ? "bg-slate-700" : tutorTalking ? "scale-110 bg-emerald-400 shadow-[0_0_40px_10px_rgba(52,211,153,0.4)]" : "bg-emerald-700"
          }`}
        />
        <p className="text-sm text-slate-400">
          {conv.status === "disconnected" && "Ready"}
          {conv.status === "connecting" && "Connecting…"}
          {live && conv.isMuted && "Mic muted. Tutor keeps talking; unmute to answer."}
          {live && !conv.isMuted && (tutorTalking ? "Tutor speaking. Just talk to interrupt." : "Listening…")}
          {conv.status === "error" && "Error"}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Say: go · repeat · explain differently · go deeper · skip · where am I · go to chapter two · quiz me · any question · I&apos;m done
        </p>
        {debugOn && live && (
          <p className="mt-2 font-mono text-[11px] text-amber-300">
            in {debug.input.toFixed(3)} · floor {debug.floor.toFixed(3)} · ratio {debug.ratio.toFixed(2)} · out {debug.output.toFixed(3)} · {debug.phase.toUpperCase()}
          </p>
        )}
        {(loc || ctx !== null) && (
          <p className="mt-1 text-[10px] text-slate-600">
            {loc}
            {ctx !== null ? ` · agent context ${ctx} tokens` : ""}
          </p>
        )}
      </div>

      {err && <p className="rounded-xl bg-rose-900/50 px-4 py-2 text-sm text-rose-100">{err}</p>}

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
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="Type a command if the mic is bad (go, skip, quiz me…)"
            className="flex-1 rounded-xl bg-slate-800 px-3 py-2 text-sm outline-none"
          />
          <button className="rounded-xl bg-slate-700 px-3 py-2 text-sm">Send</button>
        </form>
      )}

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto">
        {lines.slice(-8).map((l, i) => (
          <div key={i} className={`max-w-[88%] rounded-2xl px-4 py-2 text-sm ${l.who === "you" ? "self-end bg-emerald-600" : "self-start bg-slate-800"}`}>
            {l.text}
          </div>
        ))}
      </div>

      {!live ? (
        <button onClick={start} className="rounded-xl bg-emerald-500 px-5 py-5 text-xl font-bold text-slate-950">
          🎙️ Start talking
        </button>
      ) : (
        <div className="flex gap-3">
          {/* Mic-only mute: the session stays open and the tutor's audio keeps streaming. */}
          <button
            onClick={() => conv.setMuted(!conv.isMuted)}
            aria-pressed={conv.isMuted}
            className={`flex-1 rounded-xl px-5 py-4 text-lg font-semibold ${conv.isMuted ? "bg-amber-500 text-slate-950" : "bg-slate-800"}`}
          >
            {conv.isMuted ? "🔇 Unmute" : "🎤 Mute"}
          </button>
          <button
            onClick={async () => {
              ended.current = true;
              cancel();
              conv.endSession();
              const s = await post("end_trip");
              onTripEnd(s.tripId ?? "");
            }}
            className="flex-1 rounded-xl bg-slate-800 px-5 py-4 text-lg font-semibold"
          >
            End trip
          </button>
        </div>
      )}
    </div>
  );
}

export function VoiceAgent({ plan, onTripEnd, onReply }: { plan: Plan; onTripEnd: (tripId: string) => void; onReply?: (r: ToolReply) => void }) {
  return (
    <ConversationProvider>
      <Inner plan={plan} onTripEnd={onTripEnd} onReply={onReply} />
    </ConversationProvider>
  );
}
