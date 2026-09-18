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

export interface GradeOptions {
  hintFirst?: boolean; // wrong MCQ pick: nudge towards the idea instead of naming the answer (study mode, first try)
}

export async function gradeAnswer(question: Question, answer: string, opts: GradeOptions = {}): Promise<GradeResponse> {
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
    if (correct) return { correct, feedback: "Correct." };
    if (opts.hintFirst) return { correct, feedback: `Not quite. ${await mcqHint(question, picked)}` };
    return { correct, feedback: `Not quite. The answer is: ${question.answer}.` };
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

const HINT_FALLBACK = "That is not the one. Have another look at the passage and pick again.";

const hintSchema = {
  type: "object",
  properties: { hint: { type: "string" } },
  required: ["hint"],
  additionalProperties: false,
} as const;

/** One nudge towards the right idea for a wrong MCQ pick, never naming the answer. Fixed line if Claude is unavailable. */
async function mcqHint(question: Question, picked: string): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) return HINT_FALLBACK;
  try {
    const res = await anthropic().messages.create({
      model: MODEL,
      max_tokens: 80,
      output_config: { effort: "low", format: { type: "json_schema", schema: hintSchema } },
      system:
        "A learner tapped a wrong option on a multiple-choice check in a short course. Write one hint sentence, max 20 words, that points them at the idea behind the right option. Never name, quote or paraphrase the correct option, and never say which option is right. You may say the picked one is not it. Plain spoken words, no 'rubric', no 'option'.",
      messages: [
        {
          role: "user",
          content: `QUESTION: ${question.prompt}
OPTIONS: ${(question.options ?? []).join(" | ")}
CORRECT OPTION: ${question.answer}
LEARNER PICKED: ${picked}
NOTES: ${question.rubric}`,
        },
      ],
    });
    const u = res.usage;
    const usd = (u.input_tokens * 2 + u.output_tokens * 10) / 1_000_000;
    console.log(`[hint] ${MODEL} in=${u.input_tokens} out=${u.output_tokens} ~$${usd.toFixed(4)}`);
    if (res.stop_reason !== "end_turn") return HINT_FALLBACK;
    const text = res.content.find((b) => b.type === "text")?.text ?? "{}";
    const hint = String((JSON.parse(text) as { hint?: string }).hint ?? "").trim();
    // cheap leak guard: a hint that contains the answer text is no hint
    if (!hint || norm(hint).includes(norm(question.answer))) return HINT_FALLBACK;
    return hint;
  } catch (e) {
    console.error(`[hint] ${(e as Error).message}`);
    return HINT_FALLBACK;
  }
}
