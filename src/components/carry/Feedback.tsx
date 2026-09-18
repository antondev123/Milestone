// Feedback box: verdict, one sentence, and the source line. The source line is required.
export function Feedback({
  correct,
  text,
  source,
  dark = false,
}: {
  correct: boolean;
  text: string;
  source: string;
  dark?: boolean;
}) {
  return (
    <div
      role="status"
      className={`flex flex-col gap-2 rounded-2xl border-2 p-[18px] ${dark ? "border-muted-on-ink" : "border-ink"}`}
    >
      <div className="font-display text-[22px] font-semibold">{correct ? "That's right." : "Not quite."}</div>
      {text && <p className="text-[17px] leading-normal">{text}</p>}
      <div className={`text-sm ${dark ? "text-muted-on-ink" : "text-muted"}`}>{source}</div>
    </div>
  );
}

export interface CheckQuestion {
  id: string;
  prompt: string;
  type: "mcq" | "open";
  options: string[];
  answer: string | null;
  why: string | null;
}

/** The explanation line for a graded answer. MCQ explains from the course; open answers use the grader. */
export function explain(q: CheckQuestion, correct: boolean, graderFeedback: string): string {
  if (q.type === "mcq" && q.why) return correct ? q.why : `The answer is "${q.answer}". ${q.why}`;
  // the box already shows the verdict, so drop one the grader leads with
  return graderFeedback.replace(/^\s*(not quite|correct|that'?s right|right|yes|no)\s*[.!,:]\s*/i, "");
}
