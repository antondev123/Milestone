"use client";
// Text mode: the same lesson JSON rendered as a lightweight chat. Low data: one
// course fetch, then small JSON calls per answer.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Course, GradeResponse, Plan, Question, Segment } from "@/types/lesson";
import { TripPicker } from "@/components/TripPicker";
import { ProgressBar } from "@/components/ProgressBar";

type Bubble = { who: "tutor" | "you"; text: string; tone?: "ok" | "bad" };

type Phase =
  | { kind: "pick" }
  | { kind: "read"; segIdx: number; paraIdx: number }
  | { kind: "ask"; segIdx: number; qIdx: number }
  | { kind: "ending" };

function paragraphs(script: string): string[] {
  // split spoken prose into ~2–3 sentence chunks so it reads like chat
  const sentences = script.match(/[^.!?]+[.!?]+/g) ?? [script];
  const out: string[] = [];
  for (let i = 0; i < sentences.length; i += 3) out.push(sentences.slice(i, i + 3).join(" ").trim());
  return out;
}

export default function TextMode() {
  const router = useRouter();
  const [course, setCourse] = useState<Course | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [segs, setSegs] = useState<Segment[]>([]); // full segments for this trip, fetched lazily
  const [phase, setPhase] = useState<Phase>({ kind: "pick" });
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/course").then((r) => r.json()).then(setCourse);
  }, []);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [bubbles, phase]);

  const say = (b: Bubble) => setBubbles((prev) => [...prev, b]);

  const seg = phase.kind === "read" || phase.kind === "ask" ? segs[phase.segIdx] : null;
  const paras = seg ? paragraphs(seg.script) : [];

  async function start(minutes: number) {
    setBusy(true);
    const p: Plan = await fetch("/api/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ minutes, mode: "text" }),
    }).then((r) => r.json());
    // the course manifest has no prose; fetch this trip's segments (a few KB each)
    const full = await Promise.all(
      p.segmentIds.map((id) =>
        fetch(`/api/segment?id=${encodeURIComponent(id)}`)
          .then((r) => r.json() as Promise<{ segment: Segment }>)
          .then((r) => r.segment),
      ),
    );
    setSegs(full);
    setPlan(p);
    setBusy(false);
    const first = full[0];
    say({ who: "tutor", text: `${p.segmentIds.length} segment${p.segmentIds.length > 1 ? "s" : ""} fit in ${minutes} minutes. Picking up at "${first?.title}".` });
    if (p.startAt.position === "checkpoint") {
      say({ who: "tutor", text: "You already heard this one. Straight to the checkpoint." });
      setPhase({ kind: "ask", segIdx: 0, qIdx: 0 });
    } else {
      say({ who: "tutor", text: `**${first?.title}**` });
      setPhase({ kind: "read", segIdx: 0, paraIdx: 0 });
    }
  }

  function next() {
    if (phase.kind !== "read" || !seg) return;
    say({ who: "tutor", text: paras[phase.paraIdx] });
    if (phase.paraIdx + 1 < paras.length) setPhase({ ...phase, paraIdx: phase.paraIdx + 1 });
    else {
      say({ who: "tutor", text: "Quick check." });
      setPhase({ kind: "ask", segIdx: phase.segIdx, qIdx: 0 });
    }
  }

  async function answer(q: Question, text: string) {
    if (phase.kind !== "ask" || !seg) return;
    say({ who: "you", text });
    setBusy(true);
    setOpen("");
    const r: GradeResponse = await fetch("/api/grade", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ questionId: q.id, answer: text, mode: "text" }),
    }).then((r) => r.json());
    say({ who: "tutor", text: r.feedback, tone: r.correct ? "ok" : "bad" });
    if (phase.qIdx + 1 < seg.checkpoint.length) {
      setPhase({ ...phase, qIdx: phase.qIdx + 1 });
      setBusy(false);
      return;
    }
    // segment done
    const c = await fetch("/api/segment", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ segmentId: seg.id }),
    }).then((r) => r.json() as Promise<{ nextSegmentId: string | null; tripDone: boolean }>);
    setBusy(false);
    if (!c.tripDone && phase.segIdx + 1 < segs.length) {
      const n = segs[phase.segIdx + 1];
      say({ who: "tutor", text: `Segment done. Next: **${n.title}**` });
      setPhase({ kind: "read", segIdx: phase.segIdx + 1, paraIdx: 0 });
    } else {
      await finish();
    }
  }

  async function finish() {
    setPhase({ kind: "ending" });
    setBusy(true);
    const s = await fetch("/api/trip/end", { method: "POST" }).then((r) => r.json());
    router.push(`/trip/${s.tripId}/summary`);
  }

  if (!course) return <p className="text-slate-400">Loading course…</p>;
  if (phase.kind === "pick") return <TripPicker label="Taxi / bus" onStart={start} busy={busy} />;

  const q = phase.kind === "ask" && seg ? seg.checkpoint[phase.qIdx] : null;
  const segDone = phase.kind === "read" || phase.kind === "ask" ? phase.segIdx : segs.length;

  return (
    <div className="flex flex-1 flex-col gap-3">
      <div className="sticky top-0 -mx-4 bg-slate-950/95 px-4 pb-2 pt-1 backdrop-blur">
        <ProgressBar value={(segDone / Math.max(1, segs.length)) * 100} label={`${course.title} · ${seg?.title ?? ""}`} />
      </div>
      <div className={`flex flex-1 flex-col gap-2 ${phase.kind === "ask" ? "pb-80" : "pb-32"}`}>
        {bubbles.map((b, i) => (
          <div
            key={i}
            className={`max-w-[88%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-[15px] leading-relaxed ${
              b.who === "you"
                ? "self-end bg-emerald-600 text-white"
                : b.tone === "ok"
                  ? "self-start bg-emerald-900/60 text-emerald-100"
                  : b.tone === "bad"
                    ? "self-start bg-rose-900/50 text-rose-100"
                    : "self-start bg-slate-800"
            }`}
          >
            {b.text.replace(/\*\*/g, "")}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <div className="fixed inset-x-0 bottom-0 mx-auto w-full max-w-md bg-slate-950 px-4 pb-6 pt-3">
        {phase.kind === "read" && (
          <div className="flex gap-2">
            <button onClick={next} className="flex-1 rounded-xl bg-emerald-500 px-4 py-4 text-lg font-bold text-slate-950">
              {phase.paraIdx === 0 ? "Start" : "Continue"}
            </button>
            <button onClick={finish} className="rounded-xl bg-slate-800 px-4 py-4 text-sm">
              End trip
            </button>
          </div>
        )}
        {phase.kind === "ask" && q && (
          <div className="flex flex-col gap-2">
            <p className="text-[15px] font-medium">{q.prompt}</p>
            {q.type === "mcq" ? (
              <div className="grid grid-cols-1 gap-2">
                {q.options?.map((o) => (
                  <button
                    key={o}
                    disabled={busy}
                    onClick={() => answer(q, o)}
                    className="rounded-xl bg-slate-800 px-4 py-3 text-left text-[15px] active:bg-slate-700 disabled:opacity-50"
                  >
                    {o}
                  </button>
                ))}
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (open.trim()) answer(q, open.trim());
                }}
                className="flex gap-2"
              >
                <input
                  value={open}
                  onChange={(e) => setOpen(e.target.value)}
                  placeholder="Type your answer"
                  className="flex-1 rounded-xl bg-slate-800 px-4 py-3 text-[15px] outline-none"
                  autoFocus
                />
                <button disabled={busy || !open.trim()} className="rounded-xl bg-emerald-500 px-4 py-3 font-bold text-slate-950 disabled:opacity-50">
                  {busy ? "…" : "Send"}
                </button>
              </form>
            )}
          </div>
        )}
        {phase.kind === "ending" && <p className="text-center text-slate-400">Wrapping up your trip…</p>}
      </div>
    </div>
  );
}
