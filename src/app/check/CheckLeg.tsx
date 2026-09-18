"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { GradeResponse } from "@/types/lesson";
import { BackLink, PrimaryButton, Screen, SignalNotice, TopBar } from "@/components/carry/Chrome";
import { CheckIcon } from "@/components/carry/Icons";
import { Feedback, explain, type CheckQuestion } from "@/components/carry/Feedback";
import { persist, postJSON } from "@/components/carry/usePlace";

type Result = { correct: boolean; text: string; picked: string };

export function CheckLeg(props: {
  segmentId: string;
  legNumber: number;
  questions: CheckQuestion[];
  start: number;
  source: string;
  from: "read" | "listen";
}) {
  const { questions, legNumber } = props;
  const router = useRouter();
  const [idx, setIdx] = useState(props.start);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState<string | null>(null); // the answer being graded
  const [result, setResult] = useState<Result | null>(null);
  const [trouble, setTrouble] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const q = questions[idx];
  const lastQ = idx === questions.length - 1;

  async function grade(answer: string) {
    if (busy || !answer.trim()) return;
    setBusy(answer);
    try {
      const r = await persist(
        () => postJSON<GradeResponse>("/api/grade", { questionId: q.id, answer, mode: "text" }, 30_000),
        setTrouble,
        5,
      );
      setResult({ correct: r.correct, text: explain(q, r.correct, r.feedback), picked: answer });
    } catch {
      // grading gave up; leave the question open to try again
    } finally {
      setBusy(null);
    }
  }

  function next() {
    setResult(null);
    setTyped("");
    setIdx((i) => i + 1);
    window.scrollTo({ top: 0 });
  }

  async function finish() {
    setFinishing(true);
    try {
      await persist(() => postJSON("/api/segment", { segmentId: props.segmentId }), setTrouble);
      router.push(`/progress?finished=${legNumber}`);
    } catch {
      setFinishing(false);
    }
  }

  return (
    <Screen gap="gap-6">
      <TopBar
        left={<BackLink href={props.from === "listen" ? "/listen" : "/read"} label="Back to the lesson" />}
        title={`End of leg ${legNumber}`}
      />

      <SignalNotice show={trouble} />

      <div className="flex flex-col gap-2">
        {questions.length > 1 && (
          <div className="text-[15px] text-muted">
            Question {idx + 1} of {questions.length}
          </div>
        )}
        <h1 className="font-display text-[28px] leading-[1.2] font-semibold tracking-[-0.01em]">{q.prompt}</h1>
      </div>

      {q.type === "mcq" ? (
        <div className="flex flex-col gap-3">
          {q.options.map((o) => {
            const picked = result?.picked === o;
            const isAnswer = !!result && o === q.answer;
            const filled = isAnswer; // the right answer is always shown filled once graded
            return (
              <button
                key={o}
                type="button"
                disabled={!!result || !!busy}
                aria-pressed={picked}
                onClick={() => grade(o)}
                className={`flex min-h-16 items-center justify-between gap-3 rounded-[14px] px-[18px] py-3.5 text-left text-[17px] leading-[1.35] ${
                  filled
                    ? "bg-ink font-semibold text-ground"
                    : picked
                      ? "bg-panel ring-2 ring-ink ring-inset"
                      : busy === o
                        ? "bg-panel ring-2 ring-ink ring-inset"
                        : "bg-panel"
                }`}
              >
                <span>{o}</span>
                {filled && <CheckIcon color="var(--color-gold)" />}
                {busy === o && <span className="text-sm font-medium text-muted">Checking…</span>}
              </button>
            );
          })}
        </div>
      ) : (
        !result && (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              grade(typed);
            }}
          >
            <label htmlFor="answer" className="text-[15px] font-semibold">
              Your answer, in your own words
            </label>
            <textarea
              id="answer"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              rows={3}
              className="min-h-24 resize-none rounded-[14px] bg-panel px-[18px] py-3.5 text-[17px] leading-[1.45] outline-none focus:ring-2 focus:ring-ink"
            />
          </form>
        )
      )}

      {result && q.type === "open" && (
        <div className="rounded-[14px] bg-panel px-[18px] py-3.5 text-[17px] leading-[1.45]">
          <span className="text-sm text-muted">You wrote</span>
          <p>{result.picked}</p>
        </div>
      )}

      {result && <Feedback correct={result.correct} text={result.text} source={props.source} />}

      <div className="mt-auto flex flex-col gap-2">
        {!result && q.type === "open" && (
          <PrimaryButton onClick={() => grade(typed)} disabled={!!busy || !typed.trim()}>
            {busy ? "Checking your answer…" : "Check my answer"}
          </PrimaryButton>
        )}
        {result && !result.correct && q.type === "open" && (
          <button
            type="button"
            onClick={() => setResult(null)}
            className="min-h-11 text-[15px] font-semibold underline underline-offset-4"
          >
            Try again
          </button>
        )}
        {result &&
          (lastQ ? (
            <PrimaryButton onClick={finish} disabled={finishing}>
              Finish leg {legNumber}
            </PrimaryButton>
          ) : (
            <PrimaryButton onClick={next}>Next question</PrimaryButton>
          ))}
      </div>
    </Screen>
  );
}
