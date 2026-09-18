"use client";
// The leg's checkpoint with a tap/type UI. The server owns which question is open: `check` opens
// the checkpoint (or reports it done), `answer` grades and advances with the same retry rule the
// voice agent uses, and this component only mirrors what those replies say.
import { useEffect, useState } from "react";
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
  onNextLeg,
  hasNextLeg,
}: {
  segmentId: string;
  questions: StudyQuestion[];
  source: string;
  section: string;
  legLabel: string; // "Leg 5"
  tool: (name: string, body?: Record<string, unknown>) => Promise<ToolReply>;
  onNextLeg: () => void;
  hasNextLeg: boolean;
}) {
  const [qIdx, setQIdx] = useState<number | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [feedback, setFeedback] = useState<{ correct: boolean; text: string; advance: boolean } | null>(null);

  useEffect(() => {
    let live = true;
    setQIdx(null);
    setDone(false);
    setFeedback(null);
    setPicked(null);
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
    if (finished) setDone(true);
  }

  function next() {
    setFeedback(null);
    setPicked(null);
    setTyped("");
    setQIdx((q) => (q ?? 0) + 1);
  }

  const src = `From ${source}, section ${section}`;
  const q = qIdx != null ? questions[qIdx] : undefined;

  return (
    <section className="mt-10 flex flex-col gap-5 border-t border-rule pt-8" aria-label="Check your understanding">
      <h2 className="font-display text-[28px] leading-[1.15] font-semibold">{done ? `${legLabel} done` : "Check your understanding"}</h2>

      {done ? (
        <>
          {feedback && <Feedback correct={feedback.correct} text={feedback.text} source={src} />}
          <p className="text-[17px] leading-[1.6] text-muted">{hasNextLeg ? "Your place is saved. Carry on whenever you like." : "That was the last leg. Your place is saved."}</p>
          {hasNextLeg && <PrimaryButton onClick={onNextLeg}>Next leg</PrimaryButton>}
        </>
      ) : !q ? (
        <p className="text-[17px] text-muted" role="status">
          Loading the question…
        </p>
      ) : (
        <>
          <div className="text-[14px] font-semibold text-muted">
            Question {qIdx! + 1} of {questions.length}
          </div>
          <p className="font-display text-[24px] leading-[1.2] font-semibold">{q.prompt}</p>

          {q.type === "mcq" && q.options ? (
            <div className="flex flex-col gap-2.5">
              {q.options.map((o) => {
                const selected = picked === o;
                const isRight = selected && feedback?.correct;
                return (
                  <button
                    key={o}
                    type="button"
                    disabled={busy || feedback?.advance === true}
                    aria-pressed={selected}
                    onClick={() => {
                      setPicked(o);
                      submit(o);
                    }}
                    className={`flex min-h-16 items-center justify-between gap-3 rounded-[14px] px-[18px] py-3 text-left text-[17px] leading-[1.35] disabled:opacity-80 ${
                      isRight ? "bg-ink font-semibold text-ground" : selected ? "bg-panel ring-2 ring-ink" : "bg-panel"
                    }`}
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
          {feedback && <Feedback correct={feedback.correct} text={feedback.text} source={src} />}
          {feedback?.advance && !done && <PrimaryButton onClick={next}>Next question</PrimaryButton>}
        </>
      )}
    </section>
  );
}
