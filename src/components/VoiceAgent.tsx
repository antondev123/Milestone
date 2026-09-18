"use client";
// ElevenLabs Conversational AI wiring. Tools run as CLIENT tools (in the browser)
// and call our own API routes, so no public URL is needed for local dev.
// The same tools also exist as server webhooks at /api/tools/<name> if you prefer
// to configure them in the dashboard as webhooks. See docs/ELEVENLABS.md.
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { useState } from "react";
import type { Plan } from "@/types/lesson";

type Line = { who: "you" | "agent"; text: string };

async function api<T>(path: string, body?: unknown, method = "POST"): Promise<T> {
  const r = await fetch(path, {
    method,
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return r.json() as Promise<T>;
}

/** Build the client tools the agent can call. Return values are JSON strings the LLM reads. */
function makeClientTools(onTripEnd: (tripId: string) => void) {
  return {
    get_segment: async (p: { segmentId?: string }) => {
      const r = await api<{ error?: string } & Record<string, unknown>>(`/api/tools/get_segment`, { segmentId: p?.segmentId });
      return JSON.stringify(r);
    },
    grade_answer: async (p: { questionId: string; answer: string }) => {
      const r = await api(`/api/tools/grade_answer`, p);
      return JSON.stringify(r);
    },
    complete_segment: async (p: { segmentId: string }) => {
      const r = await api(`/api/tools/complete_segment`, p);
      return JSON.stringify(r);
    },
    end_trip: async () => {
      const r = await api<{ tripId: string; spoken: string }>(`/api/tools/end_trip`, {});
      setTimeout(() => onTripEnd(r.tripId), 4000); // let the agent say the closing line
      return JSON.stringify(r);
    },
  };
}

function Inner({ plan, onTripEnd }: { plan: Plan; onTripEnd: (tripId: string) => void }) {
  const [lines, setLines] = useState<Line[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const agentId = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID;

  const conv = useConversation({
    onMessage: (m) => {
      const msg = m as unknown as { message: string; source: "user" | "ai" | "agent" };
      setLines((prev) => [...prev, { who: msg.source === "user" ? "you" : "agent", text: msg.message }]);
    },
    onError: (message) => setErr(message),
  });

  function start() {
    if (!agentId) {
      setErr("NEXT_PUBLIC_ELEVENLABS_AGENT_ID is not set");
      return;
    }
    setErr(null);
    conv.startSession({
      agentId,
      connectionType: "webrtc",
      dynamicVariables: {
        trip_minutes: plan.estMinutes,
        trip_segments: plan.segmentIds.length,
        first_segment_id: plan.segmentIds[0],
        resume_position: plan.startAt.position,
      },
    });
  }

  const live = conv.status === "connected";

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="rounded-2xl bg-slate-900 p-5 text-center">
        <div
          className={`mx-auto mb-3 h-24 w-24 rounded-full transition-all ${
            !live ? "bg-slate-700" : conv.isSpeaking ? "scale-110 bg-emerald-400 shadow-[0_0_40px_10px_rgba(52,211,153,0.4)]" : "bg-emerald-700"
          }`}
        />
        <p className="text-sm text-slate-400">
          {conv.status === "disconnected" && "Ready"}
          {conv.status === "connecting" && "Connecting…"}
          {live && conv.isMuted && "Mic muted. Tutor keeps talking; unmute to answer."}
          {live && !conv.isMuted && (conv.isSpeaking ? "Tutor speaking. Just talk to interrupt." : "Listening…")}
          {conv.status === "error" && "Error"}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Say: repeat · explain differently · skip · go deeper · I&apos;m done
        </p>
      </div>

      {err && <p className="rounded-xl bg-rose-900/50 px-4 py-2 text-sm text-rose-100">{err}</p>}

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto">
        {lines.slice(-8).map((l, i) => (
          <div
            key={i}
            className={`max-w-[88%] rounded-2xl px-4 py-2 text-sm ${l.who === "you" ? "self-end bg-emerald-600" : "self-start bg-slate-800"}`}
          >
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
            className={`flex-1 rounded-xl px-5 py-4 text-lg font-semibold ${
              conv.isMuted ? "bg-amber-500 text-slate-950" : "bg-slate-800"
            }`}
          >
            {conv.isMuted ? "🔇 Unmute" : "🎤 Mute"}
          </button>
          <button
            onClick={async () => {
              conv.endSession();
              const s = await api<{ tripId: string }>(`/api/tools/end_trip`, {});
              onTripEnd(s.tripId);
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

export function VoiceAgent({ plan, onTripEnd }: { plan: Plan; onTripEnd: (tripId: string) => void }) {
  const [tools] = useState(() => makeClientTools(onTripEnd));
  return (
    <ConversationProvider clientTools={tools}>
      <Inner plan={plan} onTripEnd={onTripEnd} />
    </ConversationProvider>
  );
}
