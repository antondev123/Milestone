"use client";
// Text mode: a thin renderer over the same speech tools the voice agent uses (/api/tools/*).
// The server owns the position; this page just shows `say` and offers the same verbs as chips.
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Plan, ToolReply } from "@/types/lesson";
import { TripPicker } from "@/components/TripPicker";
import { ProgressBar } from "@/components/ProgressBar";

type Bubble = { who: "tutor" | "you"; text: string; tone?: "ok" | "bad" | "aside"; offer?: ToolReply["offer"] };
type Manifest = { title: string; chapters: { id: string; number: number; shortTitle: string; sections: { id: string; number: string; title: string; status: string; segments: { id: string }[] }[] }[] };

async function tool(name: string, body: Record<string, unknown> = {}): Promise<ToolReply> {
  const r = await fetch(`/api/tools/${name}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, mode: "text" }) });
  return r.json() as Promise<ToolReply>;
}

export default function TextModePage() {
  return (
    <Suspense fallback={<p className="text-slate-400">Loading…</p>}>
      <TextMode />
    </Suspense>
  );
}

function TextMode() {
  const router = useRouter();
  const params = useSearchParams();
  const [course, setCourse] = useState<Manifest | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [last, setLast] = useState<ToolReply | null>(null);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");
  const [jump, setJump] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/course").then((r) => r.json()).then(setCourse);
  }, []);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [bubbles]);

  const say = (b: Bubble) => setBubbles((prev) => [...prev, b]);

  function show(r: ToolReply) {
    setLast(r);
    const tone = r.correct === undefined ? undefined : r.correct ? "ok" : "bad";
    say({ who: "tutor", text: r.say, tone, offer: r.offer });
    if (r.kind === "end" && r.tripId) router.push(`/trip/${r.tripId}/summary`);
  }

  async function step(name: string, body: Record<string, unknown> = {}, echo?: string) {
    if (echo) say({ who: "you", text: echo });
    setBusy(true);
    try {
      show(await tool(name, body));
    } finally {
      setBusy(false);
    }
  }

  async function start(minutes: number) {
    setBusy(true);
    const p: Plan = await fetch("/api/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ minutes, mode: "text" }) }).then((r) => r.json());
    setPlan(p);
    say({ who: "tutor", text: p.greeting ?? `${p.segmentIds.length} parts fit in ${minutes} minutes.`, tone: "aside" });
    const target = params.get("goto");
    if (target) await step("goto", { target });
    await step("next");
  }

  async function finish() {
    setBusy(true);
    const r = await tool("end_trip");
    router.push(`/trip/${r.tripId}/summary`);
  }

  if (!course) return <p className="text-slate-400">Loading course…</p>;
  if (!plan) return <TripPicker label="Taxi / bus" onStart={start} busy={busy} />;

  const asking = last?.kind === "ask";
  const options = asking ? last?.options ?? [] : [];
  const canContinue = !asking && last?.kind !== "end";

  return (
    <div className="flex flex-1 flex-col gap-3">
      <div className="sticky top-0 -mx-4 bg-slate-950/95 px-4 pb-2 pt-1 backdrop-blur">
        <ProgressBar value={chapterPctFromLoc(last?.loc, course, last?.segmentId)} label={`${course.title} · ${last?.loc ?? ""}`} />
      </div>

      <div className="flex flex-1 flex-col gap-2 pb-72">
        {bubbles.map((b, i) => (
          <div key={i} className="flex flex-col gap-1">
            <div
              className={`max-w-[88%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-[15px] leading-relaxed ${
                b.who === "you"
                  ? "self-end bg-emerald-600 text-white"
                  : b.tone === "ok"
                    ? "self-start bg-emerald-900/60 text-emerald-100"
                    : b.tone === "bad"
                      ? "self-start bg-rose-900/50 text-rose-100"
                      : b.tone === "aside"
                        ? "self-start bg-slate-900 text-slate-300 italic"
                        : "self-start bg-slate-800"
              }`}
            >
              {b.text}
            </div>
            {b.offer && i === bubbles.length - 1 && (
              <div className="flex gap-2">
                <button disabled={busy} onClick={() => step("goto", { target: b.offer!.sectionId.replace(/.*\/c(\d+)\/s(\d+)$/, "section $1.$2") }, "Go there now")} className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs">
                  Go there now
                </button>
                <button disabled={busy} onClick={() => step("next", {}, "Carry on")} className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs">
                  Carry on
                </button>
              </div>
            )}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <div className="fixed inset-x-0 bottom-0 mx-auto w-full max-w-md bg-slate-950 px-4 pb-5 pt-2">
        {asking && options.length > 0 && (
          <div className="mb-2 grid grid-cols-1 gap-2">
            {options.map((o, i) => (
              <button key={o} disabled={busy} onClick={() => step("answer", { text: o }, `${"ABCD"[i]}. ${o}`)} className="rounded-xl bg-slate-800 px-4 py-3 text-left text-[15px] active:bg-slate-700 disabled:opacity-50">
                <span className="mr-2 text-slate-500">{"ABCD"[i]}</span>
                {o}
              </button>
            ))}
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const t = input.trim();
            if (!t) return;
            setInput("");
            // an open question is waiting → this is the answer; otherwise it is a curiosity question
            void step(asking && options.length === 0 ? "answer" : "ask", asking && options.length === 0 ? { text: t } : { question: t }, t);
          }}
          className="mb-2 flex gap-2"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={asking && options.length === 0 ? "Type your answer" : "Ask anything about this…"}
            className="flex-1 rounded-xl bg-slate-800 px-4 py-3 text-[15px] outline-none"
          />
          <button disabled={busy || !input.trim()} className="rounded-xl bg-emerald-500 px-4 py-3 font-bold text-slate-950 disabled:opacity-50">
            {busy ? "…" : asking && options.length === 0 ? "Send" : "Ask"}
          </button>
        </form>
        <div className="flex gap-2">
          <button disabled={busy || !canContinue} onClick={() => step("next")} className="flex-1 rounded-xl bg-emerald-500 px-4 py-3 text-lg font-bold text-slate-950 disabled:opacity-40">
            {last?.kind === "say" && last.more ? "Continue" : last ? "Continue" : "Start"}
          </button>
          <button onClick={finish} disabled={busy} className="rounded-xl bg-slate-800 px-4 py-3 text-sm">
            End trip
          </button>
        </div>
        <div className="mt-2 flex gap-2 overflow-x-auto text-xs">
          {[
            ["Explain differently", "explain", { how: "simpler" }],
            ["Go deeper", "explain", { how: "deeper" }],
            ["Example", "explain", { how: "example" }],
            ["Repeat", "explain", { how: "again" }],
            ["Skip", "goto", { target: "skip" }],
            ["Where am I", "where_am_i", {}],
            ["Quiz me", "goto", { target: "quiz me" }],
          ].map(([label, name, body]) => (
            <button key={label as string} disabled={busy} onClick={() => step(name as string, body as Record<string, unknown>, label as string)} className="shrink-0 rounded-full bg-slate-800 px-3 py-1.5 disabled:opacity-40">
              {label as string}
            </button>
          ))}
          <button onClick={() => setJump((j) => !j)} className="shrink-0 rounded-full bg-slate-800 px-3 py-1.5">
            Jump to…
          </button>
        </div>
        {jump && (
          <div className="mt-2 max-h-48 overflow-y-auto rounded-xl bg-slate-900 p-2 text-xs">
            {course.chapters.map((ch) => (
              <div key={ch.id} className="mb-1">
                <p className="px-1 py-1 font-semibold text-slate-400">
                  {ch.number}. {ch.shortTitle}
                </p>
                {ch.sections
                  .filter((s) => s.segments.length > 0)
                  .map((s) => (
                    <button
                      key={s.id}
                      disabled={busy}
                      onClick={() => {
                        setJump(false);
                        void step("goto", { target: `section ${s.number}` }, `Go to ${s.number} ${s.title}`);
                      }}
                      className="block w-full rounded px-2 py-1 text-left hover:bg-slate-800"
                    >
                      {s.number} {s.title}
                    </button>
                  ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function chapterPctFromLoc(loc: string | undefined, course: Manifest, segmentId?: string): number {
  if (!segmentId) return 0;
  const ch = course.chapters.find((c) => segmentId.startsWith(c.id + "/"));
  if (!ch) return 0;
  const all = ch.sections.flatMap((s) => s.segments.map((g) => g.id));
  const i = all.indexOf(segmentId);
  return i < 0 ? 0 : (i / Math.max(1, all.length)) * 100;
}
