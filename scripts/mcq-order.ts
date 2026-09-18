// MCQ option order for offline course building. Models put the right answer first almost every time,
// so the answer's slot is set here: a hash-seeded start per section, then one slot on per MCQ, with the
// wrong options in hash order around it. Depends only on ids and option text, so it is stable across
// reruns and idempotent. Never called on the request path.
import { createHash } from "node:crypto";
import type { Question } from "../src/types/lesson.ts";

const hash = (s: string) => createHash("sha1").update(s).digest("hex");

/** Reorders the options of every MCQ in one section's questions (in lesson order), in place. */
export function orderMcqs(questions: Question[]): void {
  const mcqs = questions.filter((q) => q.type === "mcq" && q.options?.includes(q.answer));
  if (!mcqs.length) return;
  const start = parseInt(hash(mcqs[0].id).slice(0, 8), 16);
  mcqs.forEach((q, k) => {
    const wrong = q.options!.filter((o) => o !== q.answer).sort((a, b) => hash(`${q.id}\n${a}`).localeCompare(hash(`${q.id}\n${b}`)));
    wrong.splice((start + k) % q.options!.length, 0, q.answer);
    q.options = wrong;
  });
}
