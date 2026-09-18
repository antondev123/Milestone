// OFFLINE ingestion: parsed section markdown → spoken lesson JSON, one section per Claude call.
// Usage:
//   node --env-file=.env.local scripts/ingest.ts pom --chapters 1-3 [--concurrency 6] [--force]
//   node --env-file=.env.local scripts/ingest.ts pom --section 1.2 --force
//   node --env-file=.env.local scripts/ingest.ts pom --all
//   node scripts/ingest.ts pom --chapters 1-3 --reshuffle   (reorder MCQ options in existing files, no Claude call)
// Idempotent: a section is skipped when sections/cNN-sMM.json exists with the same sourceHash.
// Writes per section, so a crashed run resumes where it stopped. Never called on the request path.
import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Chapter, ChapterQuiz, Course, Question, SectionLesson, SectionMeta, Segment } from "../src/types/lesson.ts";
import { orderMcqs } from "./mcq-order.ts";

// ---------- args ----------
const args = process.argv.slice(2);
const courseId = args.find((a) => !a.startsWith("--")) ?? "pom";
function arg(name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}
const force = args.includes("--force");
const reshuffle = args.includes("--reshuffle");
const all = args.includes("--all");
const concurrency = Number(arg("concurrency") ?? 6);
const onlySection = arg("section");
const chapterSel = parseRange(arg("chapters"));
const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5";
const MIN_WORDS = 150; // sections shorter than this have nothing to teach (chapter intros, summaries)

function parseRange(s?: string): Set<number> | null {
  if (!s) return null;
  const out = new Set<number>();
  for (const part of s.split(",")) {
    const m = part.match(/^(\d+)(?:-(\d+))?$/);
    if (!m) throw new Error(`bad --chapters ${s}`);
    for (let i = Number(m[1]); i <= Number(m[2] ?? m[1]); i++) out.add(i);
  }
  return out;
}
if (!all && !chapterSel && !onlySection) {
  console.error("pick a scope: --chapters 1-3 | --section 1.2 | --all");
  process.exit(1);
}

const dir = join(process.cwd(), "data", "courses", courseId);
const manifestPath = join(dir, "course.json");
const course = JSON.parse(readFileSync(manifestPath, "utf8")) as Course;
mkdirSync(join(dir, "sections"), { recursive: true });
mkdirSync(join(dir, "chapters"), { recursive: true });

const sha = (s: string) => createHash("sha1").update(s).digest("hex").slice(0, 12);
const pad = (n: number | string) => String(n).padStart(2, "0");
const wordsPerSec = 150 / 60;
const PRICE: Record<string, [number, number]> = { "claude-sonnet-5": [2, 10], "claude-haiku-4-5": [1, 5] };
const usd = (inTok: number, outTok: number) => {
  const [pi, po] = PRICE[model] ?? [3, 15];
  return (inTok * pi + outTok * po) / 1_000_000;
};
function logCost(id: string, kind: string, u: { input_tokens: number; output_tokens: number }, ms: number) {
  const row = { at: new Date().toISOString(), id, kind, model, in: u.input_tokens, out: u.output_tokens, usd: +usd(u.input_tokens, u.output_tokens).toFixed(4), ms };
  appendFileSync(join(dir, "ingest.log.jsonl"), JSON.stringify(row) + "\n");
  return row;
}

// ---------- source markdown ----------
interface Source {
  meta: SectionMeta;
  chapter: Chapter;
  md: string;
  objectives: string[];
  body: string;
  conceptChecks: { question: string; answer?: string }[];
  keyTerms: { term: string; definition: string }[];
}

function readSource(chapter: Chapter, meta: SectionMeta): Source {
  const md = readFileSync(join(dir, meta.sourceFile), "utf8");
  const sect = (name: string) => {
    const m = md.match(new RegExp(`\\n## ${name}\\n([\\s\\S]*?)(?=\\n## |$)`));
    return m ? m[1].trim() : "";
  };
  const objectives = sect("Learning Objectives").split("\n").map((l) => l.replace(/^\d+\.\s*/, "").trim()).filter(Boolean);
  const body = sect("Body")
    .split("\n")
    .filter((l) => !l.startsWith("> **")) // figure captions
    .join("\n")
    .trim();
  const cc: { question: string; answer?: string }[] = [];
  for (const line of sect("Concept Check").split("\n")) {
    const q = line.match(/^\d+\.\s+(.*)$/);
    const a = line.match(/^\s+> answer:\s*(.*)$/);
    if (q) cc.push({ question: q[1].trim() });
    else if (a && cc.length) cc[cc.length - 1].answer = a[1].trim();
  }
  // key terms live on the chapter's summary section
  const summary = chapter.sections.find((s) => s.kind === "summary");
  return { meta, chapter, md, objectives, body, conceptChecks: cc, keyTerms: summary?.keyTerms ?? [] };
}

// ---------- schemas ----------
const questionSchema = {
  type: "object",
  properties: {
    prompt: { type: "string" },
    type: { type: "string", enum: ["mcq", "open"] },
    options: { type: "array", items: { type: "string" } },
    answer: { type: "string" },
    rubric: { type: "string" },
    topic: { type: "string" },
    source: { type: "string", enum: ["book", "generated"] },
  },
  required: ["prompt", "type", "options", "answer", "rubric", "topic", "source"],
  additionalProperties: false,
};
const sectionSchema = {
  type: "object",
  properties: {
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
          example: { type: "string" },
          checkpoint: { type: "array", items: questionSchema },
        },
        required: ["title", "script", "keyPoints", "altExplanation", "deeper", "example", "checkpoint"],
        additionalProperties: false,
      },
    },
  },
  required: ["segments"],
  additionalProperties: false,
};
const quizSchema = {
  type: "object",
  properties: { questions: { type: "array", items: questionSchema } },
  required: ["questions"],
  additionalProperties: false,
};

const SYSTEM = `You transpose a management textbook into commute-sized audio lessons for South African commuters who are driving or riding a taxi. They cannot see a screen.
Rules:
- Produce EXACTLY the number of segments requested. Split the section at its natural subheadings so each segment teaches one coherent idea. Cover the whole section; do not drop content.
- Each segment "script" is 380–560 words of plain spoken prose: no markdown, no headings, no bullet characters, no "in this section", no "as shown in the exhibit", no citations or author-year references, no URLs. Second person, warm, concrete. Keep the textbook's terms and names (Mintzberg, Kotter, satisficing) because the checkpoints use them, but explain them with local, everyday examples (a spaza shop, a taxi association, Shoprite, Eskom, a stokvel, a Joburg clinic). Numbers as words where natural for speech.
- "title": 3–7 words, spoken at the start of the part.
- keyPoints: 2–4 short bullets a learner could repeat back.
- altExplanation: the same core idea explained with a different analogy, 80–150 words, spoken prose.
- deeper: 100–200 words of extra depth, accurate, spoken prose.
- example: one concrete worked example from South African working life, 60–120 words, spoken prose.
- checkpoint: 2–3 questions per segment. If BOOK QUESTIONS are given for this section, distribute them across the segments where the content is covered, with type "open", source "book", prompt verbatim, answer = the given answer (or write one from the text if none is given), and a rubric stating precisely what a correct paraphrase MUST include. Then add generated questions (source "generated") so each segment has at least 2: mix "mcq" (3–4 options, exactly one correct, answer = the exact option text, options ≤ 8 words each, no "all of the above"; every wrong option is a real concept from this or an earlier section that a learner could plausibly confuse, never a throwaway like "it has no effect", and options are similar in length so the longest is not a giveaway) and "open". For "open", options must be an empty array. Rubrics let a strict grader reject vague answers. topic is a short kebab-case tag; reuse tags across questions that test the same idea.
- Never invent facts not supported by the source except in "deeper" and "example".`;

const QUIZ_SYSTEM = `You turn a textbook chapter's review questions into a short spoken chapter quiz for a commuter.
Pick the 4–6 questions that best test understanding of the chapter (skip ones that ask about the learner personally, need an essay, or that the CHAPTER MATERIAL does not actually answer). Keep each prompt short and speakable, type "open", options [], source "book", answer = a model answer in 1–3 sentences drawn from the chapter material provided, rubric = what a correct paraphrase MUST include, topic = kebab-case tag.`;

// ---------- Claude ----------
const client = new Anthropic({ maxRetries: 2 });

async function callJson<T>(system: string, user: string, schema: Record<string, unknown>, maxTokens: number): Promise<{ out: T; usage: { input_tokens: number; output_tokens: number }; ms: number }> {
  const t0 = Date.now();
  const msg = await client.messages
    .stream({
      model,
      max_tokens: maxTokens,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium", format: { type: "json_schema", schema } },
      system,
      messages: [{ role: "user", content: user }],
    })
    .finalMessage();
  if (msg.stop_reason !== "end_turn") throw new Error(`stop_reason ${msg.stop_reason}`);
  const text = msg.content.find((b) => b.type === "text")?.text ?? "";
  return { out: JSON.parse(text) as T, usage: msg.usage, ms: Date.now() - t0 };
}

type RawSegment = Omit<Segment, "id" | "durationSec" | "sectionId" | "checkpoint"> & { checkpoint: Omit<Question, "id">[] };

function planSegmentCount(words: number): number {
  return Math.min(5, Math.max(1, Math.round(words / 700)));
}

function finishQuestion(id: string, q: Omit<Question, "id">): Question {
  return {
    id,
    prompt: q.prompt,
    type: q.type,
    ...(q.type === "mcq" ? { options: q.options } : {}),
    answer: q.answer,
    rubric: q.rubric,
    topic: q.topic.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
    source: q.source ?? "generated",
  };
}

async function ingestSection(src: Source): Promise<SectionLesson> {
  const n = planSegmentCount(src.meta.words);
  const user = `SECTION ${src.meta.number}: ${src.meta.title}  (chapter ${src.chapter.number}: ${src.chapter.title})
REQUIRED SEGMENTS: ${n}

LEARNING OBJECTIVES:
${src.objectives.map((o) => `- ${o}`).join("\n") || "(none)"}

KEY TERMS (from the chapter):
${src.keyTerms.map((k) => `- ${k.term}: ${k.definition}`).join("\n") || "(none)"}

BOOK QUESTIONS (use verbatim as open checkpoints):
${src.conceptChecks.map((c, i) => `${i + 1}. ${c.question}${c.answer ? `\n   answer: ${c.answer}` : ""}`).join("\n") || "(none)"}

SOURCE TEXT:
${src.body}`;

  const { out, usage, ms } = await callJson<{ segments: RawSegment[] }>(SYSTEM, user, sectionSchema, 24000);
  const row = logCost(src.meta.id, "section", usage, ms);
  const segments: Segment[] = out.segments.map((s, i) => {
    const id = `${src.meta.id}/g${i + 1}`;
    const words = s.script.trim().split(/\s+/).length;
    return {
      id,
      title: s.title,
      durationSec: Math.round(words / wordsPerSec),
      sectionId: src.meta.id,
      script: s.script,
      keyPoints: s.keyPoints,
      altExplanation: s.altExplanation,
      deeper: s.deeper,
      example: s.example,
      checkpoint: s.checkpoint.map((q, j) => finishQuestion(`${id}/q${j + 1}`, q)),
    };
  });
  orderMcqs(segments.flatMap((s) => s.checkpoint));
  // sanity
  for (const s of segments) {
    if (s.checkpoint.length === 0) throw new Error(`${s.id}: no checkpoint`);
    for (const q of s.checkpoint) {
      if (q.type === "mcq" && !(q.options ?? []).includes(q.answer)) throw new Error(`${q.id}: mcq answer not in options`);
    }
  }
  console.log(`  ${src.meta.number} ${src.meta.title}: ${segments.length}/${n} segments, ${segments.reduce((a, s) => a + s.checkpoint.length, 0)} q, in=${row.in} out=${row.out} $${row.usd} ${Math.round(ms / 1000)}s`);
  return { id: src.meta.id, title: src.meta.title, sourceHash: sha(src.md), model, segments };
}

async function ingestChapterQuiz(chapter: Chapter): Promise<ChapterQuiz | null> {
  if (!chapter.reviewFile) return null;
  const review = JSON.parse(readFileSync(join(dir, chapter.reviewFile), "utf8")) as { questions: string[] };
  const summary = chapter.sections.find((s) => s.kind === "summary");
  const keyTerms = summary?.keyTerms ?? [];
  // chapter material: objectives + key terms + the key points of ingested segments (compact, accurate)
  const points: string[] = [];
  for (const s of chapter.sections) {
    if (!s.lessonFile) continue;
    const lesson = JSON.parse(readFileSync(join(dir, s.lessonFile), "utf8")) as SectionLesson;
    for (const g of lesson.segments) points.push(`${s.number} ${g.title}: ${g.keyPoints.join("; ")}`);
  }
  const user = `CHAPTER ${chapter.number}: ${chapter.title}

REVIEW QUESTIONS FROM THE BOOK:
${review.questions.map((q, i) => `${i + 1}. ${q}`).join("\n")}

KEY TERMS:
${keyTerms.map((k) => `- ${k.term}: ${k.definition}`).join("\n") || "(none)"}

CHAPTER MATERIAL (key points per part):
${points.join("\n") || "(none)"}`;
  const { out, usage, ms } = await callJson<{ questions: Omit<Question, "id">[] }>(QUIZ_SYSTEM, user, quizSchema, 6000);
  logCost(chapter.id, "quiz", usage, ms);
  const quiz: ChapterQuiz = {
    id: `${chapter.id}/quiz`,
    chapterId: chapter.id,
    title: `Chapter ${chapter.number} review`,
    source: "book",
    questions: out.questions.map((q, i) => finishQuestion(`${chapter.id}/quiz/q${i + 1}`, q)),
  };
  const file = `chapters/c${pad(chapter.number)}-quiz.json`;
  writeFileSync(join(dir, file), JSON.stringify(quiz, null, 2) + "\n");
  chapter.quizFile = file;
  console.log(`  chapter ${chapter.number} quiz: ${quiz.questions.length} questions`);
  return quiz;
}

// ---------- run ----------
function saveManifest() {
  for (const ch of course.chapters) ch.segments = ch.sections.flatMap((s) => s.segments);
  course.estimatedMinutes = Math.round(course.chapters.flatMap((c) => c.segments).reduce((a, s) => a + s.durationSec + s.checkpoint.length * 45, 0) / 60);
  writeFileSync(manifestPath, JSON.stringify({ ...course, modules: undefined }, null, 2) + "\n");
}

const jobs: { chapter: Chapter; meta: SectionMeta }[] = [];
for (const ch of course.chapters) {
  if (chapterSel && !chapterSel.has(ch.number)) continue;
  for (const s of ch.sections) {
    if (onlySection && s.number !== onlySection) continue;
    if (s.words < MIN_WORDS || s.kind === "summary") continue;
    jobs.push({ chapter: ch, meta: s });
  }
}
if (reshuffle) {
  let n = 0;
  for (const job of jobs) {
    const path = join(dir, `sections/c${pad(job.chapter.number)}-s${pad(job.meta.number.split(".")[1])}.json`);
    if (!existsSync(path)) continue;
    const lesson = JSON.parse(readFileSync(path, "utf8")) as SectionLesson;
    const before = JSON.stringify(lesson);
    orderMcqs(lesson.segments.flatMap((g) => g.checkpoint));
    if (JSON.stringify(lesson) !== before) {
      writeFileSync(path, JSON.stringify(lesson, null, 2) + "\n");
      n++;
    }
  }
  console.log(`reshuffle: reordered MCQ options in ${n} section file(s), no Claude calls`);
  process.exit(0);
}
console.log(`ingest ${courseId} via ${model}: ${jobs.length} candidate sections, concurrency ${concurrency}`);

let done = 0;
let skipped = 0;
let failed = 0;
let totalUsd = 0;
const queue = [...jobs];
async function worker() {
  while (queue.length) {
    const job = queue.shift()!;
    const src = readSource(job.chapter, job.meta);
    const file = `sections/c${pad(job.chapter.number)}-s${pad(job.meta.number.split(".")[1])}.json`;
    const path = join(dir, file);
    if (!force && existsSync(path)) {
      const prev = JSON.parse(readFileSync(path, "utf8")) as SectionLesson;
      if (prev.sourceHash === sha(src.md)) {
        skipped++;
        continue;
      }
    }
    try {
      const lesson = await ingestSection(src);
      writeFileSync(path, JSON.stringify(lesson, null, 2) + "\n");
      job.meta.status = "ingested";
      job.meta.lessonFile = file;
      job.meta.sourceHash = lesson.sourceHash;
      job.meta.segments = lesson.segments.map((g) => ({
        id: g.id,
        title: g.title,
        durationSec: g.durationSec,
        sectionId: g.sectionId,
        checkpoint: g.checkpoint.map((q) => ({ id: q.id, type: q.type, topic: q.topic })),
      }));
      saveManifest();
      done++;
    } catch (e) {
      failed++;
      console.error(`  FAILED ${job.meta.number}: ${(e as Error).message}`);
    }
  }
}
await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, worker));

// chapter quizzes for chapters that are fully ingested and have review questions
for (const ch of course.chapters) {
  if (chapterSel && !chapterSel.has(ch.number)) continue;
  if (onlySection) continue;
  const teachable = ch.sections.filter((s) => s.words >= MIN_WORDS && s.kind !== "summary");
  if (!teachable.length || !teachable.every((s) => s.status === "ingested")) continue;
  if (ch.quizFile && !force && existsSync(join(dir, ch.quizFile))) continue;
  try {
    await ingestChapterQuiz(ch);
    saveManifest();
  } catch (e) {
    console.error(`  FAILED quiz ${ch.number}: ${(e as Error).message}`);
  }
}

try {
  for (const line of readFileSync(join(dir, "ingest.log.jsonl"), "utf8").trim().split("\n")) totalUsd += (JSON.parse(line) as { usd: number }).usd;
} catch {
  /* no log yet */
}
console.log(`done ${done}, skipped ${skipped}, failed ${failed}. Cumulative ingest spend in log: $${totalUsd.toFixed(2)}`);
if (failed) process.exit(1);
