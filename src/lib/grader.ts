// Answer grading. MCQ is local string match. Open answers go to Claude with the rubric.
import Anthropic from "@anthropic-ai/sdk";
import type { GradeResponse, Question } from "@/types/lesson";

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5";

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

export async function gradeAnswer(question: Question, answer: string): Promise<GradeResponse> {
  const a = answer.trim();
  if (!a) return { correct: false, feedback: "I did not catch an answer. Try again." };

  if (question.type === "mcq") {
    const options = question.options ?? [];
    // accept exact option text, option index ("2"), or letter ("b")
    let picked = options.find((o) => norm(o) === norm(a));
    if (!picked) {
      const idx = /^[a-d]$/i.test(a) ? a.toLowerCase().charCodeAt(0) - 97 : /^[1-4]$/.test(a) ? Number(a) - 1 : -1;
      if (idx >= 0 && idx < options.length) picked = options[idx];
    }
    if (!picked) {
      // spoken answers rarely match exactly; fall through to the LLM judge
      return llmGrade(question, a);
    }
    const correct = norm(picked) === norm(question.answer);
    return {
      correct,
      feedback: correct ? "Correct." : `Not quite. The answer is: ${question.answer}.`,
    };
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    // dev fallback: keyword overlap with the model answer
    const keys = norm(question.answer).split(" ").filter((w) => w.length > 4);
    const hits = keys.filter((k) => norm(a).includes(k)).length;
    const correct = keys.length > 0 && hits / keys.length >= 0.3;
    return { correct, feedback: correct ? "Good, that covers it." : `Not quite. ${question.answer}` };
  }
  return llmGrade(question, a);
}

const schema = {
  type: "object",
  properties: {
    correct: { type: "boolean" },
    feedback: { type: "string" },
  },
  required: ["correct", "feedback"],
  additionalProperties: false,
} as const;

async function llmGrade(question: Question, answer: string): Promise<GradeResponse> {
  const res = await anthropic().messages.create({
    model: MODEL,
    max_tokens: 300,
    output_config: { effort: "low", format: { type: "json_schema", schema } },
    system:
      "You grade a spoken or typed answer from a commuter doing a short course. Accept paraphrase and informal wording. Reject vague, partial, or non-committal answers that do not meet the rubric. feedback is one spoken sentence, max 20 words: if correct, affirm briefly; if wrong, give the correct idea in plain words. Never say 'rubric'.",
    messages: [
      {
        role: "user",
        content: `QUESTION: ${question.prompt}
${question.type === "mcq" ? `OPTIONS: ${(question.options ?? []).join(" | ")}\n` : ""}MODEL ANSWER: ${question.answer}
RUBRIC: ${question.rubric}
LEARNER ANSWER: ${answer}`,
      },
    ],
  });
  const u = res.usage;
  const usd = (u.input_tokens * 2 + u.output_tokens * 10) / 1_000_000; // claude-sonnet-5 list price
  console.log(`[grade] ${MODEL} in=${u.input_tokens} out=${u.output_tokens} ~$${usd.toFixed(4)}`);
  if (res.stop_reason !== "end_turn") {
    return { correct: false, feedback: "I could not grade that. Let us try once more." };
  }
  const text = res.content.find((b) => b.type === "text")?.text ?? "{}";
  const parsed = JSON.parse(text) as GradeResponse;
  return { correct: !!parsed.correct, feedback: String(parsed.feedback ?? "") };
}
