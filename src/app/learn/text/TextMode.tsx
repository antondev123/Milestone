"use client";
// Text mode: a thin renderer over the same speech tools the voice agent uses (/api/tools/*).
// The server owns the position; this page just shows `say` and offers the same verbs as chips.
// Carry "Read quietly" styling: light, calm, text-first (docs/DESIGN.md §4.2).
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Plan, ToolReply } from "@/types/lesson";
import type { LegIndex } from "@/lib/view";
import { TripPicker } from "@/components/TripPicker";
import { BackLink, ModePill, PrimaryButton, Screen, SignalNotice, TopBar } from "@/components/carry/Chrome";
import { Feedback, stripVerdict } from "@/components/carry/Feedback";
import { persist, postJSON } from "@/components/carry/net";

type Bubble = { who: "tutor" | "you"; text: string; tone?: "ok" | "bad" | "aside"; offer?: ToolReply["offer"]; segmentId?: string };
type Manifest = { title: string; chapters: { id: string; number: number; shortTitle: string; sections: { id: string; number: string; title: string; status: string; segments: { id: string }[] }[] }[] };

export interface TextModeProps {
  legs: LegIndex;
  source: string; // "Principles of Management by OpenStax"
  carriedFromVoice: boolean;
}

export default function TextModePage(props: TextModeProps) {
  return (
    <Suspense fallback={<p className="p-6 text-muted">Loading…</p>}>
      <TextMode {...props} />
    </Suspense>
  );
}

function TextMode({ legs, source, carriedFromVoice }: TextModeProps) {
  const router = useRouter();
  const params = useSearchParams();
  const [course, setCourse] = useState<Manifest | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [last, setLast] = useState<ToolReply | null>(null);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");
  const [jump, setJump] = useState(false);
  const [trouble, setTrouble] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  async function tool(name: string, body: Record<string, unknown> = {}): Promise<ToolReply> {
    return persist(() => postJSON<ToolReply>(`/api/tools/${name}`, { ...body, mode: "text" }), setTrouble);
  }

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
    say({ who: "tutor", text: r.say, tone, offer: r.offer, segmentId: r.segmentId });
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
    const p: Plan = await persist(() => postJSON<Plan>("/api/session", { minutes, mode: "text" }), setTrouble);
    setPlan(p);
    say({ who: "tutor", text: p.greeting ?? `${p.segmentIds.length} parts fit in ${minutes} minutes.`, tone: "aside" });
    const target = params.get("goto");
    if (target) await step("goto", { target });
    await step("next");
  }

  // Arrived from Listen mid-trip (?carry=1): keep that trip instead of asking its length again.
  const carrying = params.get("carry") === "1";
  const [carryFailed, setCarryFailed] = useState(false);
  const carried = useRef(false); // Strict Mode runs effects twice; a second carry + next would skip a block
  useEffect(() => {
    if (!carrying || carried.current) return;
    carried.current = true;
    (async () => {
      setBusy(true);
      const p = await persist(() => postJSON<Plan | { error: string }>("/api/session", { carry: true, mode: "text" }), setTrouble);
      if (!("tripId" in p)) {
        setCarryFailed(true);
        setBusy(false);
        return;
      }
      setPlan(p);
      if (p.greeting) say({ who: "tutor", text: p.greeting, tone: "aside" });
      await step("next");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function finish() {
    setBusy(true);
    const r = await tool("end_trip");
    router.push(`/trip/${r.tripId}/summary`);
  }

  if (!course || (carrying && !plan && !carryFailed))
    return (
      <Screen>
        <p className="text-[17px] text-muted">Getting your place…</p>
      </Screen>
    );
  if (!plan)
    return (
      <Screen>
        <TopBar left={<BackLink href="/" />} title="Read quietly" right={<ModePill to="listen" onClick={() => router.push(plan ? "/learn/voice?carry=1" : "/learn/voice")} />} />
        <TripPicker label="Read quietly: short text, tap to answer" onStart={start} busy={busy} />
      </Screen>
    );

  const asking = last?.kind === "ask";
  const options = asking ? last?.options ?? [] : [];
  const canContinue = !asking && last?.kind !== "end";
  const leg = last?.segmentId ? legs[last.segmentId] : undefined;

  return (
    <Screen gap="gap-[22px]">
      <TopBar
        left={<BackLink href="/" />}
        title={leg ? `Leg ${leg.n} of ${leg.of}` : course.title}
        right={<ModePill to="listen" onClick={() => router.push(plan ? "/learn/voice?carry=1" : "/learn/voice")} />}
      />

      <div className="h-1 overflow-hidden rounded-sm bg-track" aria-hidden="true">
        <div className="h-1 bg-ink transition-[width] duration-300" style={{ width: `${leg ? (leg.n / leg.of) * 100 : 0}%` }} />
      </div>

      {carriedFromVoice && (
        <div className="flex items-center gap-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-gold ring-2 ring-ink" aria-hidden="true" />
          <span className="text-sm font-semibold">Picked up where you stopped listening</span>
        </div>
      )}

      <div className="flex flex-1 flex-col gap-4">
        {bubbles.map((b, i) => {
          const where = b.segmentId ? legs[b.segmentId] : undefined;
          return (
            <div key={i} className="flex flex-col gap-2">
              {b.who === "you" ? (
                <div className="max-w-[88%] self-end rounded-[14px] bg-panel px-4 py-2.5 text-[17px] leading-[1.35]">{b.text}</div>
              ) : b.tone === "ok" || b.tone === "bad" ? (
                <Feedback correct={b.tone === "ok"} text={stripVerdict(b.text)} source={`From ${source}${where ? `, section ${where.section}` : ""}`} />
              ) : b.tone === "aside" ? (
                <p className="text-[17px] leading-[1.6] text-muted">{b.text}</p>
              ) : (
                <p className="text-[19px] leading-[1.6] whitespace-pre-wrap">{b.text}</p>
              )}
              {b.offer && i === bubbles.length - 1 && (
                <div className="flex flex-wrap gap-2">
                  <button
                    disabled={busy}
                    onClick={() => step("goto", { target: b.offer!.sectionId.replace(/.*\/c(\d+)\/s(\d+)$/, "section $1.$2") }, "Go there now")}
                    className="min-h-11 rounded-[22px] bg-ink px-4 text-[15px] font-semibold text-ground disabled:opacity-60"
                  >
                    Go there now
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => step("next", {}, "Carry on")}
                    className="min-h-11 rounded-[22px] border-2 border-ink px-4 text-[15px] font-semibold disabled:opacity-60"
                  >
                    Carry on
                  </button>
                </div>
              )}
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <div className="sticky bottom-0 -mx-6 flex flex-col gap-3 border-t border-rule bg-ground px-6 pt-3 pb-2">
        <SignalNotice show={trouble} />

        {asking && options.length > 0 && (
          <div className="flex flex-col gap-2.5">
            {options.map((o, i) => (
              <button
                key={o}
                disabled={busy}
                onClick={() => step("answer", { text: o }, `${"ABCD"[i]}. ${o}`)}
                className="flex min-h-16 items-center gap-3 rounded-[14px] bg-panel px-[18px] py-3 text-left text-[17px] leading-[1.35] disabled:opacity-60"
              >
                <span className="font-semibold text-muted">{"ABCD"[i]}</span>
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
          className="flex gap-2"
        >
          <label htmlFor="say" className="sr-only">
            {asking && options.length === 0 ? "Your answer" : "Ask about this leg"}
          </label>
          <input
            id="say"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={asking && options.length === 0 ? "Type your answer" : "Ask anything about this"}
            className="min-h-12 flex-1 rounded-[14px] bg-panel px-4 text-[17px] outline-none placeholder:text-muted focus:ring-2 focus:ring-ink"
          />
          <button disabled={busy || !input.trim()} className="min-h-12 rounded-[14px] bg-ink px-4 text-[15px] font-bold text-ground disabled:opacity-50">
            {busy ? "…" : asking && options.length === 0 ? "Send" : "Ask"}
          </button>
        </form>

        {!(asking && options.length > 0) && (
          <PrimaryButton onClick={() => step("next")} disabled={busy || !canContinue}>
            {last ? "Continue" : "Start"}
          </PrimaryButton>
        )}

        <div className="-mx-6 flex gap-2 overflow-x-auto px-6 pb-1 [scrollbar-width:none]">
          {[
            ["Explain differently", "explain", { how: "simpler" }],
            ["Go deeper", "explain", { how: "deeper" }],
            ["Example", "explain", { how: "example" }],
            ["Repeat", "explain", { how: "again" }],
            ["Skip", "goto", { target: "skip" }],
            ["Where am I", "where_am_i", {}],
            ["Quiz me", "goto", { target: "quiz me" }],
          ].map(([label, name, body]) => (
            <button
              key={label as string}
              disabled={busy}
              onClick={() => step(name as string, body as Record<string, unknown>, label as string)}
              className="min-h-11 shrink-0 rounded-[22px] border-2 border-ink px-4 text-[15px] font-semibold whitespace-nowrap disabled:opacity-40"
            >
              {label as string}
            </button>
          ))}
          <button
            onClick={() => setJump((j) => !j)}
            aria-expanded={jump}
            className="min-h-11 shrink-0 rounded-[22px] border-2 border-ink px-4 text-[15px] font-semibold whitespace-nowrap"
          >
            Jump to…
          </button>
        </div>

        {jump && (
          <div className="max-h-56 overflow-y-auto rounded-[14px] bg-panel p-2">
            {course.chapters.map((ch) => (
              <div key={ch.id} className="mb-1">
                <p className="px-2 py-1.5 text-sm font-semibold text-muted">
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
                      className="block min-h-11 w-full rounded-lg px-2 text-left text-[15px] hover:bg-ground"
                    >
                      {s.number} {s.title}
                    </button>
                  ))}
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between text-sm text-muted">
          <span>Get off any time. Your place is saved.</span>
          <button onClick={finish} disabled={busy} className="min-h-11 font-semibold text-ink underline underline-offset-4">
            End trip
          </button>
        </div>
      </div>
    </Screen>
  );
}
