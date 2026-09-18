// OFFLINE: build a course from a PDF's text layer. The lesson text is the source's own
// words, cleaned of layout noise; nothing is paraphrased. Titles, key points and check
// questions are authored separately in raw/legs.json and grounded in the same text.
//
//   node scripts/pdf-course.ts extract "<path to Principles of Management.pdf>"
//       pdftotext (Poppler, ships with Git for Windows) → raw/chapter1.txt  (committed)
//   node scripts/pdf-course.ts build
//       raw/chapter1.txt + raw/legs.json → lesson.json
//
// Never called on the request path.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Course, Question, Segment } from "../src/types/lesson.ts";

const COURSE_DIR = join("data", "courses", "management");
const RAW = join(COURSE_DIR, "raw", "chapter1.txt");
const LEGS = join(COURSE_DIR, "raw", "legs.json");
const WORDS_PER_MIN = 150;

interface LegSpec {
  title: string;
  section: string; // source section, e.g. "1.3"
  start: string; // exact text where the leg begins in chapter1.txt
  end: string; // exact text where the next part begins (not included)
  drop?: (string | [string, string])[]; // regex, or [regex, replacement]: figure captions, headings, exhibit references
  keyPoints: string[];
  altExplanation: string;
  deeper: string;
  checkpoint: Omit<Question, "id">[];
}

interface LegsFile {
  id: string;
  title: string;
  description: string;
  source: string;
  moduleTitle: string;
  legs: LegSpec[];
}

function extract(pdf: string) {
  const text = execFileSync("pdftotext", ["-layout", "-enc", "UTF-8", pdf, "-"], { encoding: "utf8", maxBuffer: 64 << 20 }).replace(/\r\n/g, "\n");
  // Chapter 1 body: from the first section heading after the table of contents to chapter 2's heading.
  const start = text.indexOf("1.1: Introduction\n\n(Credit");
  const end = text.indexOf(" 2: MANAGERIAL DECISION-MAKING", start);
  if (start < 0 || end < 0) throw new Error("chapter 1 markers not found; has the PDF changed?");
  writeFileSync(RAW, text.slice(start, end));
  console.log(`extract: wrote ${RAW} (${end - start} chars)`);
}

/** Layout noise → plain spoken prose. */
function clean(slice: string, drop: LegSpec["drop"] = []): string {
  let s = slice
    .split("\n")
    .filter((l) => !/^\s*\d+ \(1\.[\d.]+\)\s*$/.test(l)) // page footers "7 (1.3.2)"
    .filter((l) => !/^\s*\(Credit:/.test(l))
    .join("\n");
  for (const d of drop) s = typeof d === "string" ? s.replace(new RegExp(d, "g"), " ") : s.replace(new RegExp(d[0], "g"), d[1]);
  s = s
    .replace(/-\n\s*/g, "-") // words hyphenated across lines keep their hyphen: "three-\nquarters"
    .replace(/\s*\n\s*/g, " ")
    .replace(/--/g, ", ")
    .replace(/([.,;:?!"'”’)])\d{1,2}(?=\s|$)/g, "$1") // footnote markers: `do."1`, `minutes.4`
    .replace(/^\s*\d+\.\s+|(?<=[.:])\s+\d+\.\s+(?=[A-Z])/g, " ") // numbered-list markers
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
  return s;
}

function build() {
  // straight quotes: simpler markers, and speech engines read them the same
  const raw = readFileSync(RAW, "utf8").replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
  const spec = JSON.parse(readFileSync(LEGS, "utf8")) as LegsFile;
  const moduleId = `${spec.id}/m1`;
  const segments: Segment[] = spec.legs.map((leg, i) => {
    const a = raw.indexOf(leg.start);
    const b = raw.indexOf(leg.end, a + leg.start.length);
    if (a < 0 || b < 0) throw new Error(`leg ${i + 1}: marker not found (${a < 0 ? leg.start : leg.end})`);
    const script = clean(raw.slice(a, b), leg.drop);
    const words = script.split(/\s+/).length;
    const id = `${moduleId}/s${i + 1}`;
    console.log(`leg ${i + 1} ${leg.section} "${leg.title}": ${words} words, ~${Math.round((words / WORDS_PER_MIN) * 60)} s`);
    return {
      id,
      title: leg.title,
      durationSec: Math.round((words / WORDS_PER_MIN) * 60),
      script,
      keyPoints: leg.keyPoints,
      altExplanation: leg.altExplanation,
      deeper: leg.deeper,
      checkpoint: leg.checkpoint.map((q, j) => ({ id: `${id}/q${j + 1}`, ...q })),
      sourceSection: leg.section,
    };
  });
  const course: Course = {
    id: spec.id,
    title: spec.title,
    description: spec.description,
    source: spec.source,
    estimatedMinutes: Math.round(segments.reduce((a, s) => a + s.durationSec + s.checkpoint.length * 30, 0) / 60),
    modules: [{ id: moduleId, title: spec.moduleTitle, segments }],
  };
  writeFileSync(join(COURSE_DIR, "lesson.json"), JSON.stringify(course, null, 2) + "\n");
  console.log(`build: ${segments.length} legs, ~${course.estimatedMinutes} min → ${join(COURSE_DIR, "lesson.json")}`);
}

const [cmd, arg] = process.argv.slice(2);
if (cmd === "extract" && arg) extract(arg);
else if (cmd === "build") build();
else {
  console.error('usage: node scripts/pdf-course.ts extract "<pdf>" | build');
  process.exit(1);
}
