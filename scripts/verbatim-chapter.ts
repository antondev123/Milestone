// OFFLINE: serve a chapter as the book's own words instead of an ingested adaptation.
// Leg text is sliced from the PDF text layer (verbatim/cNN.txt) when that file exists, otherwise from the
// section's parsed markdown (source/cNN/cNN-sMM.md), and cleaned of layout noise; nothing is paraphrased.
// Titles, key points and check questions are authored in verbatim/cNN.json. One spec per chapter; build
// runs every spec it finds. Writes sections/cNN-sMM.json in the same shape as scripts/ingest.ts and
// updates course.json.
//
//   node scripts/verbatim-chapter.ts extract "<path to Principles of Management.pdf>"   (chapter 1 → verbatim/c01.txt)
//   node scripts/verbatim-chapter.ts build                                               (npm run course:verbatim)
//
// Why not source/cNN/*.md for chapter 1: parse-book.ts treats every "> **" line as a figure caption, which
// drops real prose in 1.3 (most of Decisional Roles) and 1.4 (the levels of management). The raw text layer
// keeps it. Sections whose markdown parsed cleanly (2.5) are cut from the markdown instead, so no PDF is
// needed to rebuild them. Sections written here get ingest's sourceHash, so `npm run ingest` skips them
// unless --force. Never called on the request path.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Course, Question, SectionLesson, Segment } from "../src/types/lesson.ts";
import { orderMcqs } from "./mcq-order.ts";

const DIR = join("data", "courses", "pom");
const pad = (n: number | string) => String(n).padStart(2, "0");
const rawPath = (chapter: number) => join(DIR, "verbatim", `c${pad(chapter)}.txt`);
const WORDS_PER_MIN = 150;
const sha = (s: string) => createHash("sha1").update(s).digest("hex").slice(0, 12); // same as scripts/ingest.ts

interface LegSpec {
  title: string;
  section: string; // "1.3"
  start: string; // exact text where the leg begins in the raw text
  end: string; // exact text where the next part begins (not included)
  drop?: (string | [string, string])[]; // regex, or [regex, replacement]: captions, headings, exhibit references
  keyPoints: string[];
  altExplanation: string;
  deeper: string;
  checkpoint: (Omit<Question, "id" | "source"> & { source?: Question["source"] })[]; // source "book" = the book's own concept check
}

function extract(pdf: string) {
  const text = execFileSync("pdftotext", ["-layout", "-enc", "UTF-8", pdf, "-"], { encoding: "utf8", maxBuffer: 64 << 20 }).replace(/\r\n/g, "\n");
  const start = text.indexOf("1.1: Introduction\n\n(Credit");
  const end = text.indexOf(" 2: MANAGERIAL DECISION-MAKING", start);
  if (start < 0 || end < 0) throw new Error("chapter 1 markers not found; has the PDF changed?");
  writeFileSync(rawPath(1), text.slice(start, end));
  console.log(`extract: wrote ${rawPath(1)} (${end - start} chars)`);
}

/** Layout noise → plain spoken prose. */
function clean(slice: string, drop: LegSpec["drop"] = []): string {
  let s = slice
    .split("\n")
    .filter((l) => !/^\s*\d+ \(\d+\.[\d.]+\)\s*$/.test(l)) // page footers "7 (1.3.2)"
    .filter((l) => !/^\s*\(Credit:/.test(l))
    .join("\n");
  for (const d of drop) s = typeof d === "string" ? s.replace(new RegExp(d, "g"), " ") : s.replace(new RegExp(d[0], "g"), d[1]);
  return s
    .replace(/-\n\s*/g, "-") // words hyphenated across lines keep their hyphen: "three-\nquarters"
    .replace(/\s*\n\s*/g, " ")
    .replace(/--/g, ", ")
    .replace(/([.,;:?!"'”’)])\d{1,2}(?=\s|$)/g, "$1") // footnote markers: `do."1`, `minutes.4`
    .replace(/^\s*\d+\.\s+|(?<=[.:])\s+\d+\.\s+(?=[A-Z])/g, " ") // numbered-list markers
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// straight quotes: simpler markers, and speech engines read them the same
const straight = (s: string) => s.replace(/\r\n/g, "\n").replace(/[‘’]/g, "'").replace(/[“”]/g, '"');

/** Without the PDF text layer: the section's parsed markdown body, headings and blockquotes out, concept checks off. */
function sectionMarkdown(sourceFile: string): string {
  const md = straight(readFileSync(join(DIR, sourceFile), "utf8"));
  const body = md.split(/^## Body\s*$/m)[1] ?? md;
  return body
    .split(/^## Concept Check\s*$/m)[0]
    .replace(/^#{1,6} .*$/gm, "\n")
    .replace(/^> .*$/gm, "\n")
    .replace(/ — /g, ", ") // em dashes read as a pause
    .replace(/ \. \. \. /g, "... ");
}

function build() {
  const manifestPath = join(DIR, "course.json");
  const course = JSON.parse(readFileSync(manifestPath, "utf8")) as Course;
  const specs = readdirSync(join(DIR, "verbatim"))
    .filter((f) => /^c\d\d\.json$/.test(f))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(DIR, "verbatim", f), "utf8")) as { chapter: number; legs: LegSpec[] });
  for (const spec of specs) buildChapter(course, spec.chapter, spec.legs);

  // same manifest bookkeeping as scripts/ingest.ts saveManifest()
  for (const ch of course.chapters) ch.segments = ch.sections.flatMap((s) => s.segments);
  course.estimatedMinutes = Math.round(course.chapters.flatMap((c) => c.segments).reduce((a, s) => a + s.durationSec + s.checkpoint.length * 45, 0) / 60);
  writeFileSync(manifestPath, JSON.stringify({ ...course, modules: undefined }, null, 2) + "\n");
}

function buildChapter(course: Course, CHAPTER: number, legsSpec: LegSpec[]) {
  const chapter = course.chapters.find((c) => c.number === CHAPTER);
  if (!chapter) throw new Error(`chapter ${CHAPTER} not in manifest`);
  const pdfLayer = existsSync(rawPath(CHAPTER)) ? straight(readFileSync(rawPath(CHAPTER), "utf8")) : null;

  for (const section of chapter.sections) {
    const legs = legsSpec.filter((l) => l.section === section.number);
    if (!legs.length) continue;
    const raw = pdfLayer ?? sectionMarkdown(section.sourceFile);
    const segments: Segment[] = legs.map((leg, i) => {
      const a = raw.indexOf(leg.start);
      const b = raw.indexOf(leg.end, a + leg.start.length);
      if (a < 0 || b < 0) throw new Error(`${section.number} leg ${i + 1}: marker not found (${a < 0 ? leg.start : leg.end})`);
      const script = clean(raw.slice(a, b), leg.drop);
      const words = script.split(/\s+/).length;
      const id = `${section.id}/g${i + 1}`;
      console.log(`${id} "${leg.title}": ${words} words, ~${Math.round((words / WORDS_PER_MIN) * 60)} s`);
      return {
        id,
        title: leg.title,
        durationSec: Math.round((words / WORDS_PER_MIN) * 60),
        sectionId: section.id,
        script,
        keyPoints: leg.keyPoints,
        altExplanation: leg.altExplanation,
        deeper: leg.deeper,
        checkpoint: leg.checkpoint.map((q, j) => ({ id: `${id}/q${j + 1}`, ...q, source: q.source ?? ("generated" as const) })),
      };
    });
    orderMcqs(segments.flatMap((g) => g.checkpoint));
    const file = `sections/c${pad(CHAPTER)}-s${pad(section.number.split(".")[1])}.json`;
    const lesson: SectionLesson = {
      id: section.id,
      title: section.title,
      sourceHash: sha(readFileSync(join(DIR, section.sourceFile), "utf8")),
      model: "verbatim",
      segments,
    };
    writeFileSync(join(DIR, file), JSON.stringify(lesson, null, 2) + "\n");
    section.status = "ingested";
    section.lessonFile = file;
    section.sourceHash = lesson.sourceHash;
    section.segments = segments.map((g) => ({
      id: g.id,
      title: g.title,
      durationSec: g.durationSec,
      sectionId: g.sectionId,
      checkpoint: g.checkpoint.map((q) => ({ id: q.id, type: q.type, topic: q.topic })),
    }));
  }
  console.log(`build: chapter ${CHAPTER} (${pdfLayer ? "PDF text layer" : "section markdown"}) → ${chapter.sections.flatMap((s) => s.segments).length} legs`);
}

const [cmd, arg] = process.argv.slice(2);
if (cmd === "extract" && arg) extract(arg);
else if (cmd === "build") build();
else {
  console.error('usage: node scripts/verbatim-chapter.ts extract "<pdf>" | build');
  process.exit(1);
}
