"use client";
// The leg's checkpoint with a tap/type UI. The server owns which question is open: `check` opens
// the checkpoint (or reports it done), `answer` grades and advances with the same retry rule the
// voice agent uses, and this component only mirrors what those replies say. Moving on lives in
// the page's leg footer (`LegNav`), which turns its "Next leg" gold once `onDone` fires.
import { useEffect, useRef, useState } from "react";
import { PrimaryButton } from "@/components/carry/Chrome";
import { Feedback, stripVerdict } from "@/components/carry/Feedback";
import { CheckIcon } from "@/components/carry/Icons";
import type { ToolReply } from "@/types/lesson";

export type StudyQuestion = { id: string; prompt: string; type: "mcq" | "open"; options?: string[] };

export function Checkpoint({
  segmentId,
  questions,
  source,
  section,
  legLabel,
  tool,
  onDone,
  inline = false,
}: {
  segmentId: string;
  questions: StudyQuestion[];
  source: string;
  section: string;
  legLabel: string; // "Leg 5"
  tool: (name: string, body?: Record<string, unknown>) => Promise<ToolReply>;
  onDone: () => void;
  inline?: boolean; // desktop column: smaller titles (the phone flow puts it under the passage with its own rule)
}) {
  const [qIdx, setQIdx] = useState<number | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [wrong, setWrong] = useState<string[]>([]); // options tapped and missed on this question
  const [typed, setTyped] = useState("");
  const [feedback, setFeedback] = useState<{ correct: boolean; text: string; advance: boolean } | null>(null);
  const top = useRef<HTMLElement>(null);
  const tail = useRef<HTMLDivElement>(null); // feedback + next button: scrolled clear of the pinned strip

  useEffect(() => {
    let live = true;
    setQIdx(null);
    setDone(false);
    setFeedback(null);
    setPicked(null);
    setWrong([]);
    setTyped("");
    tool("check", { segmentId }).then((r) => {
      if (!live) return;
      if (r.kind !== "ask") setDone(true);
      else setQIdx(r.qIdx ?? 0);
    });
    return () => {
      live = false;
    };
  }, [segmentId, tool]);

  useEffect(() => {
    if (!done) return;
    onDone();
    top.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [done, onDone]);

  useEffect(() => {
    if (feedback) tail.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [feedback]);

  async function submit(text: string) {
    if (busy || !text.trim()) return;
    setBusy(true);
    const r = await tool("answer", { text });
    setBusy(false);
    const say = r.say ?? "";
    const finished = /Part done\.\s*$/.test(say);
    const retry = /Try once more\.\s*$/.test(say);
    const stripped = stripVerdict(say.replace(/\s*(Try once more\.|Part done\.)\s*$/, "")).trim();
    const clean = stripped.charAt(0).toUpperCase() + stripped.slice(1);
    setFeedback({ correct: r.correct === true, text: clean, advance: !retry });
    if (retry) setWrong((w) => [...w, text]);
    if (finished) setDone(true);
  }

  function next() {
    setFeedback(null);
    setPicked(null);
    setWrong([]);
    setTyped("");
    setQIdx((q) => (q ?? 0) + 1);
    top.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  const src = `From ${source}, section ${section}`;
  const q = qIdx != null ? questions[qIdx] : undefined;

  return (
    <section ref={top} className="fade-up flex scroll-mt-[76px] flex-col gap-5" aria-label="Check your understanding">
      <h2 className={`font-display leading-[1.15] font-semibold ${inline ? "text-[24px]" : "text-[28px]"}`}>{done ? `${legLabel} done` : "Check your understanding"}</h2>

      {done ? (
        <div className="fade-up flex flex-col gap-5">
          {feedback && <Feedback correct={feedback.correct} text={feedback.text} source={src} />}
          <p className="text-[17px] leading-[1.6] text-muted">Your place is saved. Carry on whenever you like.</p>
        </div>
      ) : !q ? (
        <p className="text-[17px] text-muted" role="status">
          Loading the question…
        </p>
      ) : (
        <div key={qIdx} className="fade-up flex flex-col gap-5">
          <div className="text-[14px] font-semibold text-muted">
            Question {qIdx! + 1} of {questions.length}
          </div>
          <p className={`font-display leading-[1.2] font-semibold ${inline ? "text-[20px]" : "text-[24px]"}`}>{q.prompt}</p>

          {q.type === "mcq" && q.options ? (
            <div className="flex flex-col gap-2.5">
              {q.options.map((o) => {
                const missed = wrong.includes(o);
                const selected = picked === o && !missed;
                const isRight = selected && feedback?.correct;
                return (
                  <button
                    key={o}
                    type="button"
                    disabled={busy || missed || feedback?.advance === true}
                    aria-pressed={selected}
                    onClick={() => {
                      setPicked(o);
                      submit(o);
                    }}
                    className={`flex min-h-16 items-center justify-between gap-3 rounded-[14px] px-[18px] py-3 text-left text-[17px] leading-[1.35] ${
                      missed ? "bg-panel line-through opacity-50" : isRight ? "bg-ink font-semibold text-ground" : selected ? "bg-panel ring-2 ring-ink" : "bg-panel"
                    } ${missed ? "" : "disabled:opacity-80"}`}
                  >
                    {o}
                    {isRight && <CheckIcon size={22} color="#E0A419" />}
                  </button>
                );
              })}
            </div>
          ) : (
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                submit(typed);
              }}
            >
              <textarea
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                rows={4}
                placeholder="Type your answer"
                aria-label="Your answer"
                disabled={busy || feedback?.advance === true}
                className="w-full rounded-[14px] border-2 border-rule bg-transparent px-4 py-3 text-[17px] leading-[1.5] placeholder:text-muted disabled:opacity-80"
              />
              {!feedback?.advance && (
                <PrimaryButton onClick={() => submit(typed)} disabled={busy || !typed.trim()}>
                  {busy ? "Checking…" : "Check my answer"}
                </PrimaryButton>
              )}
            </form>
          )}

          {busy && q.type === "mcq" && (
            <div className="text-[15px] text-muted" role="status">
              Checking…
            </div>
          )}
          {feedback && (
            <div ref={tail} className="fade-up flex scroll-mb-[110px] flex-col gap-5">
              <Feedback correct={feedback.correct} text={feedback.text} source={src} />
              {feedback.advance && !done && <PrimaryButton onClick={next}>Next question</PrimaryButton>}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
