// Free-form questions answered from the book, server-side, on Claude Haiku with prompt caching.
// Three cached blocks, stable → volatile: persona (1h) · table of contents (1h) · current section (5m).
import Anthropic from "@anthropic-ai/sdk";
import type { Course, Segment } from "@/types/lesson";
import { tocForPrompt } from "./course";
import type { Place } from "./say";

const MODEL = process.env.ANTHROPIC_ASK_MODEL ?? "claude-haiku-4-5";
const TIMEOUT_MS = 8000;

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!client) client = new Anthropic({ maxRetries: 1, timeout: TIMEOUT_MS });
  return client;
}

// Byte-frozen: any interpolation here would silently kill the cache.
const ASK_SYSTEM = `You answer a commuter's spoken question about a management textbook while they are on the road, mid-lesson. You can see the table of contents and the part of the course they are on right now.

Answer ONLY from CONTEXT. If CONTEXT does not contain the answer but the table of contents shows a section that would, say so in one sentence and set jumpTo to that section id. If neither, say you are not sure and name the closest section.

Style: spoken English, at most three short sentences, roughly sixty words. Plain words, one concrete South African example if it helps. No lists, no markdown, no headings, no "as the text states", no "great question". Do not end with a question unless offering the jump. Never mention CONTEXT, ids, or that you are an AI. Also return "topic": two to five words naming what the question was about, for a progress card.`;

const schema = {
  type: "object",
  properties: {
    answer: { type: "string" },
    topic: { type: "string" },
    jumpTo: { type: "string" },
  },
  required: ["answer", "topic"],
  additionalProperties: false,
} as const;

export interface AskResult {
  answer: string;
  topic: string;
  jumpTo?: string;
  cached: number;
  ms: number;
}

function sectionBlock(course: Course, segment: Segment, place: Place | null): string {
  const kt = place?.chapter.sections.flatMap((s) => s.keyTerms) ?? [];
  const neighbours = place ? place.section.segments.map((g) => `- ${g.title}`).join("\n") : "";
  return `CONTEXT
Chapter ${place?.chapter.number ?? "?"}: ${place?.chapter.title ?? ""}
Section ${place?.section.number ?? "?"}: ${place?.section.title ?? ""} (section id ${place?.section.id ?? ""})
Learning objectives:
${(place?.section.objectives ?? []).map((o) => `- ${o}`).join("\n") || "(none)"}
Parts of this section:
${neighbours}

Current part: ${segment.title}
${segment.script}

Key points: ${segment.keyPoints.join(" ")}
Deeper: ${segment.deeper}

Key terms for this chapter:
${kt.map((k) => `- ${k.term}: ${k.definition}`).join("\n") || "(none)"}`;
}

export async function askBook(
  course: Course,
  segment: Segment,
  place: Place | null,
  question: string,
  recent: { q: string; a: string }[] = [],
): Promise<AskResult> {
  const t0 = Date.now();
  const res = await anthropic().messages.create({
    model: MODEL,
    max_tokens: 260,
    output_config: { format: { type: "json_schema", schema } },
    system: [
      { type: "text", text: ASK_SYSTEM, cache_control: { type: "ephemeral", ttl: "1h" } },
      { type: "text", text: `TABLE OF CONTENTS (${course.title})\n${tocForPrompt(course.id)}`, cache_control: { type: "ephemeral", ttl: "1h" } },
      { type: "text", text: sectionBlock(course, segment, place), cache_control: { type: "ephemeral" } },
    ],
    messages: [
      ...recent.slice(-2).flatMap((r) => [
        { role: "user" as const, content: r.q },
        { role: "assistant" as const, content: JSON.stringify({ answer: r.a, topic: "" }) },
      ]),
      { role: "user", content: question },
    ],
  });
  const ms = Date.now() - t0;
  const u = res.usage;
  const cached = u.cache_read_input_tokens ?? 0;
  const usd = ((u.input_tokens ?? 0) * 1 + cached * 0.1 + (u.cache_creation_input_tokens ?? 0) * 1.25 + u.output_tokens * 5) / 1_000_000;
  console.log(`[ask] ${MODEL} in=${u.input_tokens} cached=${cached} write=${u.cache_creation_input_tokens ?? 0} out=${u.output_tokens} ${ms}ms ~$${usd.toFixed(4)}`);
  const text = res.content.find((b) => b.type === "text")?.text ?? "{}";
  const parsed = JSON.parse(text) as { answer?: string; topic?: string; jumpTo?: string };
  return { answer: String(parsed.answer ?? "I am not sure about that one."), topic: String(parsed.topic ?? "a question"), jumpTo: parsed.jumpTo || undefined, cached, ms };
}
