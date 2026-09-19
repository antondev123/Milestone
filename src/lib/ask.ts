// Off-script chat, server-side, on Claude Sonnet 5 with prompt caching. The learner stepped out of the
// reading loop; this is the model they talk to until they say continue. It sees the chapter, the part
// read so far, the checkpoint questions and what the learner answered, plus the chat so far.
// Three cached blocks, stable → volatile: persona (1h) · table of contents (1h) · lesson so far (5m).
import Anthropic from "@anthropic-ai/sdk";
import type { CheckpointResult, Course, Question, Segment } from "@/types/lesson";
import { tocForPrompt } from "./course";
import type { Place } from "./say";
import { logLlm } from "./log/log";
import { unquote, usdFor } from "./grader";

const MODEL = process.env.ANTHROPIC_ASK_MODEL ?? "claude-sonnet-5";
const TIMEOUT_MS = 10000;

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!client) client = new Anthropic({ maxRetries: 1, timeout: TIMEOUT_MS });
  return client;
}

// Byte-frozen: any interpolation here would silently kill the cache.
const ASK_SYSTEM = `You are a tutor talking with a commuter who paused a spoken management course to chat. You can see the table of contents, the part of the course they are on, what has been read so far, the checkpoint questions and the answers they gave. Treat that as shared memory: you were there.

Answer what they actually said. Use the lesson material first. When they go beyond the book (a real-world example, an opinion, how this applies to their job, something adjacent, what they got wrong and why) answer from your own knowledge and the lesson history, and tie it back to the topic when that is natural. If they ask about something the table of contents covers later, say so briefly and set jumpTo to that section id. Never refuse a question because it is not in the text.

Style: spoken English for someone driving, at most about eighty words, usually less. Plain words, one concrete example if it helps, South African where natural. No lists, no markdown, no headings, no "as the text states", no "great question". Never end by offering the lesson back, asking whether to carry on, or asking what they want next, with or without a question mark: the course says that after you. Stop after the answer. Never mention CONTEXT, ids, or that you are an AI. Also return "topic": two to five words naming what this turn was about, for a progress card, and "meta": true when the turn was about you, the app or small talk rather than the course (a greeting, your name, how you are, a complaint about the app), else false.

If they report the app misbehaving (it went quiet, lagged, repeated itself, a question never came, something did not register), say it is noted for the developers, then stop. Do not guess at causes and do not blame their connection or their phone: you cannot see either. The course reads one block at a time and pauses after each; after the last block of a part it asks the checkpoint listed in CONTEXT. If CONTEXT says a checkpoint is coming up and they say it never came, that was a glitch, not the design.`;

const schema = {
  type: "object",
  properties: {
    answer: { type: "string" },
    topic: { type: "string" },
    meta: { type: "boolean" },
    jumpTo: { type: "string" },
  },
  required: ["answer", "topic", "meta"],
  additionalProperties: false,
} as const;

export interface AskResult {
  answer: string;
  topic: string;
  meta: boolean; // about the tutor, the app or small talk, not the course: kept off the summary
  jumpTo?: string;
  cached: number;
  ms: number;
}

export type ChatTurn = { q: string; a: string };

/** What the learner has heard and done in this part: the volatile context block. */
export interface LessonSoFar {
  readSoFar: string; // the blocks of the current part already read aloud
  unread: string; // the rest of the part (still useful for "what comes next" answers)
  questions: Question[]; // checkpoint or quiz questions the learner has been asked here
  attempts: CheckpointResult[]; // their answers to those, oldest first
  pending: Question[]; // the checkpoint due next (the last block has been read, the question not yet asked)
}

function lessonBlock(course: Course, segment: Segment, place: Place | null, sofar: LessonSoFar): string {
  const kt = place?.chapter.sections.flatMap((s) => s.keyTerms) ?? [];
  const neighbours = place ? place.section.segments.map((g) => `- ${g.title}`).join("\n") : "";
  const byId = new Map(sofar.questions.map((q) => [q.id, q]));
  const attempts = sofar.attempts
    .map((a) => {
      const q = byId.get(a.questionId);
      return `- Q: ${q?.prompt ?? a.questionId}${q?.options?.length ? ` (options: ${q.options.join(" / ")})` : ""}\n  Learner answered: "${a.answer}" → ${a.correct ? "correct" : "wrong"}. Feedback given: ${a.feedback}${q ? `\n  Correct answer: ${q.answer}` : ""}`;
    })
    .join("\n");
  const asked = sofar.questions.filter((q) => !sofar.attempts.some((a) => a.questionId === q.id)).map((q) => `- ${q.prompt}${q.options?.length ? ` (options: ${q.options.join(" / ")})` : ""} (not answered yet)`).join("\n");
  return `CONTEXT
Chapter ${place?.chapter.number ?? "?"}: ${place?.chapter.title ?? ""}
Section ${place?.section.number ?? "?"}: ${place?.section.title ?? ""} (section id ${place?.section.id ?? ""})
Learning objectives:
${(place?.section.objectives ?? []).map((o) => `- ${o}`).join("\n") || "(none)"}
Parts of this section:
${neighbours}

Current part: ${segment.title}
Read aloud so far in this part:
${sofar.readSoFar || "(nothing yet)"}
${sofar.unread ? `\nNot read yet in this part:\n${sofar.unread}\n` : ""}
Key points: ${segment.keyPoints.join(" ")}
Deeper: ${segment.deeper}

Checkpoint questions and the learner's answers in this part:
${[attempts, asked].filter(Boolean).join("\n") || "(none asked yet)"}
${sofar.pending.length ? `\nComing up next, as soon as the lesson resumes (the whole part has been read):\n${sofar.pending.map((q) => `- ${q.prompt}`).join("\n")}\n` : ""}
Key terms for this chapter:
${kt.map((k) => `- ${k.term}: ${k.definition}`).join("\n") || "(none)"}`;
}

export async function askBook(
  course: Course,
  segment: Segment,
  place: Place | null,
  sofar: LessonSoFar,
  question: string,
  history: ChatTurn[] = [],
): Promise<AskResult> {
  const t0 = Date.now();
  const res = await anthropic().messages.create({
    model: MODEL,
    max_tokens: 350,
    output_config: { effort: "low", format: { type: "json_schema", schema } }, // a short spoken turn; low keeps Sonnet near Haiku latency
    system: [
      { type: "text", text: ASK_SYSTEM, cache_control: { type: "ephemeral", ttl: "1h" } },
      { type: "text", text: `TABLE OF CONTENTS (${course.title})\n${tocForPrompt(course.id)}`, cache_control: { type: "ephemeral", ttl: "1h" } },
      { type: "text", text: lessonBlock(course, segment, place, sofar), cache_control: { type: "ephemeral" } },
    ],
    messages: [
      ...history.slice(-6).flatMap((r) => [
        { role: "user" as const, content: r.q },
        { role: "assistant" as const, content: JSON.stringify({ answer: r.a, topic: "", meta: false }) },
      ]),
      { role: "user", content: question },
    ],
  });
  const ms = Date.now() - t0;
  const u = res.usage;
  const cached = u.cache_read_input_tokens ?? 0;
  const usd = usdFor(MODEL, u);
  console.log(`[ask] ${MODEL} in=${u.input_tokens} cached=${cached} write=${u.cache_creation_input_tokens ?? 0} out=${u.output_tokens} ${ms}ms ~$${usd.toFixed(4)}`);
  logLlm({ provider: "anthropic", purpose: "ask", model: res.model, in: u.input_tokens, cacheRead: cached, cacheWrite: u.cache_creation_input_tokens ?? 0, out: u.output_tokens, ms, usd, requestId: res.id, meta: { question, turns: history.length + 1, stop: res.stop_reason } });
  const text = res.content.find((b) => b.type === "text")?.text ?? "{}";
  const parsed = JSON.parse(text) as { answer?: string; topic?: string; meta?: boolean; jumpTo?: string };
  return { answer: unquote(String(parsed.answer ?? "")) || "I am not sure about that one.", topic: String(parsed.topic ?? "a question"), meta: parsed.meta === true, jumpTo: parsed.jumpTo || undefined, cached, ms };
}
