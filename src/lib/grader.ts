// Answer grading. MCQ is local string match. Everything else goes to Claude, which first decides what
// the learner meant (answer / question / command / give-up) and only grades an answer. A wrong first
// try gets a hint; the answer is revealed on the second try (`reveal`). Keyword overlap when Claude is unavailable.
import Anthropic from "@anthropic-ai/sdk";
import type { AnswerIntent, GradeResponse, Question } from "@/types/lesson";
import { isShortPick } from "./intent";
import { logLlm } from "./log/log";

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5";

/** List price per million tokens [input, output]; cache reads/writes are derived from input. */
const PRICE: Record<string, [number, number]> = { "claude-sonnet-5": [2, 10], "claude-haiku-4-5": [1, 5], "claude-opus-5": [5, 25] };
export function usdFor(model: string, u: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null }): number {
  const [pin, pout] = PRICE[Object.keys(PRICE).find((k) => model.startsWith(k)) ?? "claude-sonnet-5"];
  return (u.input_tokens * pin + (u.cache_read_input_tokens ?? 0) * pin * 0.1 + (u.cache_creation_input_tokens ?? 0) * pin * 1.25 + u.output_tokens * pout) / 1_000_000;
}

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

/** Sonnet sometimes wraps a spoken line in quotes, or leaves one dangling ("…is a key reason.'", trip-mu83gskk). */
export function unquote(s: string): string {
  return s.trim().replace(/^["'“”‘’]+|["'“”‘’]+$/g, "").trim();
}

export interface GradeOptions {
  reveal?: boolean; // second try (or give-up): a wrong answer gets the correct idea. First try: a hint that never names it.
  chatting?: boolean; // an off-script chat is open: remarks and follow-ups are chat, only a clear attempt is graded
}

export async function gradeAnswer(question: Question, answer: string, opts: GradeOptions = {}): Promise<GradeResponse> {
  const a = answer.trim();
  if (!a) return { correct: false, feedback: "I did not catch an answer. Try again." };

  if (question.type === "mcq" && isShortPick(a)) {
    const options = question.options ?? [];
    // accept exact option text, option index ("2"), or letter ("b")
    let picked = options.find((o) => norm(o) === norm(a));
    if (!picked) {
      const idx = /^[a-d]$/i.test(a) ? a.toLowerCase().charCodeAt(0) - 97 : /^[1-4]$/.test(a) ? Number(a) - 1 : -1;
      if (idx >= 0 && idx < options.length) picked = options[idx];
    }
    // spoken: "I think it's escalation of commitment" names exactly one option
    if (!picked) picked = spokenOption(options, a);
    if (picked) {
      const correct = norm(picked) === norm(question.answer);
      if (correct) return { correct, feedback: "Correct." };
      if (!opts.reveal) return { correct, feedback: `Not quite. ${await mcqHint(question, picked)}` };
      return { correct, feedback: `Not quite. The answer is: ${question.answer}.` };
    }
  }

  return llmGrade(question, a, opts);
}

/** The one option whose words all appear in a spoken answer; undefined if none or several do. */
function spokenOption(options: string[], answer: string): string | undefined {
  const said = ` ${norm(answer)} `;
  const hits = options.filter((o) => said.includes(` ${norm(o)} `));
  return hits.length === 1 ? hits[0] : undefined;
}

// too common to count as evidence in the keyword fallback
const STOP = new Set("about after their there these those which where while would could should other being because rather people managers manager".split(" "));

/** No key, or the API failed: keyword overlap with the model answer. Lenient on purpose so a right answer on stage is not rejected. */
function keywordGrade(question: Question, answer: string, opts: GradeOptions): GradeResponse {
  if (question.type === "mcq") {
    return { correct: false, feedback: `I did not catch which one. Say the letter, A to ${String.fromCharCode(64 + (question.options?.length ?? 4))}.` };
  }
  // five-letter word stems, so "believe" counts for "beliefs" but "interpersonal" does not count for "personal"
  const stems = (s: string) => new Set(norm(s).split(" ").filter((w) => w.length > 4 && !STOP.has(w)).map((w) => w.slice(0, 5)));
  const keys = [...stems(question.answer)];
  const said = stems(answer);
  const hits = keys.filter((k) => said.has(k)).length;
  const correct = keys.length > 0 && (hits >= 3 || hits / keys.length >= 0.3);
  if (correct) return { correct, feedback: "Good, that covers it." };
  return { correct, feedback: opts.reveal ? `Not quite. ${firstSentence(question.answer)}` : "Not quite. Have another go, and think about what the passage said." };
}

/** First sentence of a model answer, cut at a clause break within ~25 words, so spoken feedback stays short. */
export function firstSentence(text: string): string {
  const s = text.split(/(?<=[.!?])\s/)[0];
  const w = s.split(/\s+/);
  if (w.length <= 25) return s;
  const head = w.slice(0, 25).join(" ");
  const cut = Math.max(head.lastIndexOf(","), head.lastIndexOf(";"));
  return `${cut > 40 ? head.slice(0, cut) : head}.`;
}

/** The line for a learner who gave up: the answer, then move on. */
export function revealLine(question: Question): string {
  if (question.type === "mcq") {
    const i = (question.options ?? []).findIndex((o) => norm(o) === norm(question.answer));
    const letter = i >= 0 ? `${"ABCD"[i]}, ` : "";
    return `No problem. The answer is ${letter}${question.answer}.`;
  }
  return `No problem. ${firstSentence(question.answer)}`;
}

const schema = {
  type: "object",
  properties: {
    intent: { type: "string", enum: ["answer", "question", "command", "giveup"] },
    correct: { type: "boolean" },
    feedback: { type: "string" },
  },
  required: ["intent", "correct", "feedback"],
  additionalProperties: false,
} as const;

async function llmGrade(question: Question, answer: string, opts: GradeOptions): Promise<GradeResponse> {
  if (!process.env.ANTHROPIC_API_KEY) return keywordGrade(question, answer, opts);
  try {
    return await claudeGrade(question, answer, opts);
  } catch (e) {
    console.error(`[grade] ${(e as Error).message}; keyword fallback`);
    return keywordGrade(question, answer, opts);
  }
}

const SYSTEM_HINT = `You handle what a commuter said, out loud or typed, right after a short course asked them a checkpoint question.

First decide intent:
- "answer": any attempt at the question, however hesitant, partial, informal, hedged or wrong ("um, bounded rationality?", "hold on, is it C?", "I think it's when you keep spending"). If an attempt is in there anywhere, it is an answer.
- "question": they are asking about the material or for clarification instead of answering ("what does X mean?", "is it the same as sunk cost?", "what was option B?"), or making a remark, reaction or opinion about it rather than an attempt ("that seems a bit useless", "interesting", "my boss does exactly that").
- "command": only navigation or control with no attempt in it ("go to chapter one", "skip", "hold on", "repeat").
- "giveup": they say they do not know or ask to be told.

Only an "answer" is graded. Accept paraphrase and informal wording. If their words contain any one point the RUBRIC lists as sufficient, in their own words, it is correct, even when they add a weaker or wrong reason alongside it ("they don't have full information and there's biases" meets a rubric that accepts "information is incomplete"). Reject answers that meet none of the rubric points or are too vague to tell. feedback is one spoken sentence, max 20 words. If correct, affirm briefly. If wrong, do NOT state, name, quote or paraphrase the correct answer or option; say what is missing or point at the idea to think about, so they can try once more. For question, command or giveup, feedback is an empty string and correct is false. Never say "rubric".`;

const SYSTEM_REVEAL = SYSTEM_HINT.replace(
  "If wrong, do NOT state, name, quote or paraphrase the correct answer or option; say what is missing or point at the idea to think about, so they can try once more.",
  "If wrong, give the correct idea in plain words.",
);

async function claudeGrade(question: Question, answer: string, opts: GradeOptions): Promise<GradeResponse> {
  const t0 = Date.now();
  const res = await anthropic().messages.create({
    model: MODEL,
    max_tokens: 300,
    output_config: { effort: "low", format: { type: "json_schema", schema } },
    system: opts.reveal ? SYSTEM_REVEAL : SYSTEM_HINT,
    messages: [
      {
        role: "user",
        content: `QUESTION: ${question.prompt}
${question.type === "mcq" ? `OPTIONS: ${(question.options ?? []).join(" | ")}\n` : ""}MODEL ANSWER: ${question.answer}
RUBRIC: ${question.rubric}
${opts.chatting ? 'NOTE: the learner was chatting off-script just before this and was offered to keep chatting or return to the question. A follow-up, remark or reaction is a "question"; only a clear attempt at the question is an "answer".\n' : ""}LEARNER SAID: ${answer}`,
      },
    ],
  });
  const u = res.usage;
  const usd = usdFor(MODEL, u);
  console.log(`[grade] ${MODEL} in=${u.input_tokens} out=${u.output_tokens} ~$${usd.toFixed(4)}`);
  logLlm({ provider: "anthropic", purpose: "grade", model: res.model, in: u.input_tokens, out: u.output_tokens, ms: Date.now() - t0, usd, requestId: res.id, meta: { questionId: question.id, answer, stop: res.stop_reason, reveal: !!opts.reveal } });
  if (res.stop_reason !== "end_turn") {
    return { correct: false, feedback: "I could not grade that. Let us try once more." };
  }
  const text = res.content.find((b) => b.type === "text")?.text ?? "{}";
  const parsed = JSON.parse(text) as { intent?: AnswerIntent; correct?: boolean; feedback?: string };
  const intent: AnswerIntent = parsed.intent === "question" || parsed.intent === "command" || parsed.intent === "giveup" ? parsed.intent : "answer";
  if (intent !== "answer") return { correct: false, feedback: "", intent };
  let feedback = unquote(String(parsed.feedback ?? ""));
  // hint-first leak guard: a wrong-answer hint that names the answer is no hint
  if (!parsed.correct && !opts.reveal && question.type === "mcq" && norm(feedback).includes(norm(question.answer))) feedback = HINT_FALLBACK;
  return { correct: !!parsed.correct, feedback, intent };
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
  const t0 = Date.now();
  try {
    const res = await anthropic().messages.create({
      model: MODEL,
      max_tokens: 80,
      output_config: { effort: "low", format: { type: "json_schema", schema: hintSchema } },
      system:
        "A learner picked a wrong option on a multiple-choice check in a short course. Write one hint sentence, max 20 words, that points them at the idea behind the right option. Never name, quote or paraphrase the correct option, and never say which option is right. You may say the picked one is not it. Plain spoken words, no 'rubric', no 'option'.",
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
    const usd = usdFor(MODEL, u);
    console.log(`[hint] ${MODEL} in=${u.input_tokens} out=${u.output_tokens} ~$${usd.toFixed(4)}`);
    logLlm({ provider: "anthropic", purpose: "hint", model: res.model, in: u.input_tokens, out: u.output_tokens, ms: Date.now() - t0, usd, requestId: res.id, meta: { questionId: question.id, picked } });
    if (res.stop_reason !== "end_turn") return HINT_FALLBACK;
    const text = res.content.find((b) => b.type === "text")?.text ?? "{}";
    const hint = unquote(String((JSON.parse(text) as { hint?: string }).hint ?? ""));
    // cheap leak guard: a hint that contains the answer text is no hint
    if (!hint || norm(hint).includes(norm(question.answer))) return HINT_FALLBACK;
    return hint;
  } catch (e) {
    console.error(`[hint] ${(e as Error).message}`);
    return HINT_FALLBACK;
  }
}
