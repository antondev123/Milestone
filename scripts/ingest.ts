// OFFLINE ingestion: raw course material → structured lesson JSON.
// Usage: node --env-file=.env.local scripts/ingest.ts data/courses/sample
// Never called on the request path.
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import type { Course, Segment, Question } from "../src/types/lesson.ts";

const dir = process.argv[2];
if (!dir) {
  console.error("usage: node scripts/ingest.ts <course-dir>");
  process.exit(1);
}
const rawDir = join(dir, "raw");
const transcriptPath = join(rawDir, "transcript.md");
const quizPath = join(rawDir, "quiz.md");
if (!existsSync(transcriptPath)) {
  console.error(`missing ${transcriptPath}`);
  process.exit(1);
}
const transcript = readFileSync(transcriptPath, "utf8");
const quiz = existsSync(quizPath) ? readFileSync(quizPath, "utf8") : "(no existing quiz)";
const courseId = basename(dir);
const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5";

const questionSchema = {
  type: "object",
  properties: {
    prompt: { type: "string" },
    type: { type: "string", enum: ["mcq", "open"] },
    options: { type: "array", items: { type: "string" } },
    answer: { type: "string" },
    rubric: { type: "string" },
    topic: { type: "string" },
  },
  required: ["prompt", "type", "options", "answer", "rubric", "topic"],
  additionalProperties: false,
};
const schema = {
  type: "object",
  properties: {
    title: { type: "string" },
    description: { type: "string" },
    moduleTitle: { type: "string" },
    segments: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          script: { type: "string" },
          keyPoints: { type: "array", items: { type: "string" } },
          altExplanation: { type: "string" },
          deeper: { type: "string" },
          checkpoint: { type: "array", items: questionSchema },
        },
        required: ["title", "script", "keyPoints", "altExplanation", "deeper", "checkpoint"],
        additionalProperties: false,
      },
    },
  },
  required: ["title", "description", "moduleTitle", "segments"],
  additionalProperties: false,
};

const system = `You transpose course material into commute-sized audio lessons for South African commuters.
Rules:
- One segment per major section of the transcript. Each segment's "script" is 350–550 words of plain spoken prose: no markdown, no headings, no bullet characters, no "in this section". It will be read aloud verbatim by a voice agent and shown as text in a chat UI. Second person, warm, concrete, local examples (rand, taxis, SARS, Shoprite).
- keyPoints: 2–4 short bullets that a learner could repeat back.
- altExplanation: the same core idea explained with a different analogy, 80–150 words.
- deeper: 100–200 words of extra depth beyond the transcript, accurate for South Africa.
- checkpoint: 2–3 questions per segment. Reuse the existing quiz where it fits. Mix "mcq" (3–4 options, exactly one correct, answer = the exact option text) and "open". For "open", options must be an empty array, answer is a model answer, and rubric states precisely what a correct paraphrase MUST include so a grader can reject vague answers. For "mcq", rubric may be a one-line explanation. topic is a short kebab-case tag; reuse tags across questions when they test the same idea.
- Never invent facts not supported by the transcript except in "deeper".`;

const user = `COURSE ID: ${courseId}

TRANSCRIPT:
${transcript}

EXISTING QUIZ:
${quiz}`;

const client = new Anthropic();
console.log(`ingest: ${courseId} via ${model} …`);

const stream = client.messages.stream({
  model,
  max_tokens: 32000,
  thinking: { type: "adaptive" },
  output_config: {
    effort: "medium",
    format: { type: "json_schema", schema },
  },
  system,
  messages: [{ role: "user", content: user }],
});
stream.on("text", () => process.stdout.write("."));
const msg = await stream.finalMessage();
process.stdout.write("\n");

if (msg.stop_reason !== "end_turn") {
  console.error(`unexpected stop_reason: ${msg.stop_reason}`);
  process.exit(1);
}
const text = msg.content.find((b) => b.type === "text")?.text ?? "";
const out = JSON.parse(text) as {
  title: string;
  description: string;
  moduleTitle: string;
  segments: Array<Omit<Segment, "id" | "durationSec" | "checkpoint"> & { checkpoint: Omit<Question, "id">[] }>;
};

const wordsPerSec = 150 / 60;
const moduleId = `${courseId}/m1`;
const segments: Segment[] = out.segments.map((s, i) => {
  const id = `${moduleId}/s${i + 1}`;
  const words = s.script.trim().split(/\s+/).length;
  return {
    id,
    title: s.title,
    durationSec: Math.round(words / wordsPerSec),
    script: s.script,
    keyPoints: s.keyPoints,
    altExplanation: s.altExplanation,
    deeper: s.deeper,
    checkpoint: s.checkpoint.map((q, j) => ({
      id: `${id}/q${j + 1}`,
      prompt: q.prompt,
      type: q.type,
      ...(q.type === "mcq" ? { options: q.options } : {}),
      answer: q.answer,
      rubric: q.rubric,
      topic: q.topic,
    })),
  };
});

// sanity checks
for (const s of segments) {
  if (s.checkpoint.length === 0) throw new Error(`${s.id} has no checkpoint`);
  for (const q of s.checkpoint) {
    if (q.type === "mcq" && !(q.options ?? []).includes(q.answer))
      throw new Error(`${q.id}: mcq answer not in options`);
  }
}

const estimatedMinutes = Math.round(
  segments.reduce((acc, s) => acc + s.durationSec + s.checkpoint.length * 45, 0) / 60,
);
const course: Course = {
  id: courseId,
  title: out.title,
  description: out.description,
  estimatedMinutes,
  modules: [{ id: moduleId, title: out.moduleTitle, segments }],
};

const outPath = join(dir, "lesson.json");
writeFileSync(outPath, JSON.stringify(course, null, 2) + "\n");
console.log(
  `wrote ${outPath}: ${segments.length} segments, ${segments.reduce((a, s) => a + s.checkpoint.length, 0)} questions, ~${estimatedMinutes} min`,
);
console.log(`usage: in=${msg.usage.input_tokens} out=${msg.usage.output_tokens}`);
