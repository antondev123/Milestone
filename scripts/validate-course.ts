// Validate a course on disk: manifest ↔ files, ids, question shapes, script hygiene, progress pointers.
// Usage: node scripts/validate-course.ts pom   (exit 1 on any failure)
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Course, Progress, SectionLesson, ChapterQuiz } from "../src/types/lesson.ts";

const courseId = process.argv[2] ?? "pom";
const dir = join(process.cwd(), "data", "courses", courseId);
const course = JSON.parse(readFileSync(join(dir, "course.json"), "utf8")) as Course;
const errors: string[] = [];
const warnings: string[] = [];
const err = (m: string) => errors.push(m);
const warn = (m: string) => warnings.push(m);

const ID = new RegExp(`^${courseId}/c\\d+/s\\d+/g\\d+(/q\\d+)?$`);
const QUIZ_ID = new RegExp(`^${courseId}/c\\d+/quiz/q\\d+$`);
const ids = new Set<string>();
const uniq = (id: string) => {
  if (ids.has(id)) err(`duplicate id ${id}`);
  ids.add(id);
};

let segments = 0;
let questions = 0;
let ingested = 0;
const referenced = new Set<string>();

for (const ch of course.chapters) {
  if (!ch.shortTitle || ch.shortTitle.length > 40) warn(`${ch.id}: shortTitle missing or long`);
  for (const s of ch.sections) {
    if (!existsSync(join(dir, s.sourceFile))) err(`${s.id}: sourceFile missing ${s.sourceFile}`);
    if (s.status !== "ingested") {
      if (s.segments.length) err(`${s.id}: status source but has segments`);
      continue;
    }
    ingested++;
    if (!s.lessonFile || !existsSync(join(dir, s.lessonFile))) {
      err(`${s.id}: lessonFile missing`);
      continue;
    }
    referenced.add(s.lessonFile);
    const lesson = JSON.parse(readFileSync(join(dir, s.lessonFile), "utf8")) as SectionLesson;
    if (lesson.segments.length !== s.segments.length) err(`${s.id}: manifest has ${s.segments.length} segments, lesson has ${lesson.segments.length}`);
    if (!lesson.segments.length) err(`${s.id}: no segments`);
    lesson.segments.forEach((g, i) => {
      segments++;
      uniq(g.id);
      if (!ID.test(g.id)) err(`${g.id}: bad id`);
      if (g.sectionId !== s.id) err(`${g.id}: sectionId ${g.sectionId} != ${s.id}`);
      if (s.segments[i]?.id !== g.id) err(`${g.id}: manifest order mismatch`);
      if (g.durationSec < 60 || g.durationSec > 400) warn(`${g.id}: durationSec ${g.durationSec}`);
      if (/[#*_`]|\bExhibit\b|\bFigure \d|�/.test(g.script)) err(`${g.id}: script has markdown/exhibit/mojibake`);
      if (/[a-z][.,;]\d{1,3}\b/.test(g.script)) warn(`${g.id}: possible glued footnote digit`);
      if (g.keyPoints.length < 2 || g.keyPoints.length > 4) warn(`${g.id}: keyPoints ${g.keyPoints.length}`);
      if (!g.checkpoint.length) err(`${g.id}: no checkpoint`);
      g.checkpoint.forEach((q) => {
        questions++;
        uniq(q.id);
        if (!ID.test(q.id) || !q.id.startsWith(g.id + "/")) err(`${q.id}: bad question id`);
        if (q.type === "mcq") {
          if (!q.options || q.options.length < 3 || q.options.length > 4) err(`${q.id}: mcq needs 3–4 options`);
          if (!(q.options ?? []).includes(q.answer)) err(`${q.id}: mcq answer not in options`);
          if ((q.options ?? []).some((o) => o.split(/\s+/).length > 10)) warn(`${q.id}: long mcq option`);
        } else if (!q.rubric) err(`${q.id}: open question without rubric`);
        if (!q.topic) err(`${q.id}: no topic`);
      });
    });
    // answer-position giveaways: models put the right option first, and make it the longest
    const mcqs = lesson.segments.flatMap((g) => g.checkpoint).filter((q) => q.type === "mcq" && q.options?.includes(q.answer));
    if (mcqs.length >= 2) {
      const at = new Set(mcqs.map((q) => q.options!.indexOf(q.answer)));
      if (at.size === 1) warn(`${s.id}: every mcq answer is option ${String.fromCharCode(65 + [...at][0])}`);
    }
    for (const q of mcqs) {
      if (q.options!.every((o) => o === q.answer || o.length + 10 <= q.answer.length)) warn(`${q.id}: answer is much longer than every other option`);
    }
  }
  if (ch.quizFile) {
    if (!existsSync(join(dir, ch.quizFile))) err(`${ch.id}: quizFile missing`);
    else {
      const quiz = JSON.parse(readFileSync(join(dir, ch.quizFile), "utf8")) as ChapterQuiz;
      if (quiz.chapterId !== ch.id) err(`${ch.id}: quiz chapterId mismatch`);
      for (const q of quiz.questions) {
        uniq(q.id);
        if (!QUIZ_ID.test(q.id)) err(`${q.id}: bad quiz id`);
        if (!q.rubric || !q.answer) err(`${q.id}: quiz question needs answer + rubric`);
      }
    }
  }
}

// orphan lesson files
const secDir = join(dir, "sections");
if (existsSync(secDir)) {
  for (const f of readdirSync(secDir)) if (f.endsWith(".json") && !referenced.has(`sections/${f}`)) warn(`orphan lesson file sections/${f}`);
}

// resume pointers in existing progress files must resolve
const progDir = join(process.cwd(), "data", "progress");
if (existsSync(progDir)) {
  for (const f of readdirSync(progDir)) {
    if (!f.endsWith(".json")) continue;
    const p = JSON.parse(readFileSync(join(progDir, f), "utf8")) as Progress;
    if (p.courseId !== courseId) continue;
    if (p.resume.segmentId && !ids.has(p.resume.segmentId)) err(`progress ${f}: resume pointer ${p.resume.segmentId} does not resolve (run npm run demo:reset)`);
  }
}

console.log(`${courseId}: ${course.chapters.length} chapters, ${course.chapters.reduce((a, c) => a + c.sections.length, 0)} sections (${ingested} ingested), ${segments} segments, ${questions} questions, ~${course.estimatedMinutes} min`);
for (const w of warnings) console.log("  warn:", w);
for (const e of errors) console.log("  ERROR:", e);
if (errors.length) {
  console.error(`${errors.length} error(s)`);
  process.exit(1);
}
console.log(`ok (${warnings.length} warnings)`);
