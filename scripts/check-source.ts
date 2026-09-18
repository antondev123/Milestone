// OFFLINE check: does source/cNN/cNN-sMM.md still hold all the prose that pdftotext found for that section?
// Independent of parse-book.ts's caption logic on purpose: it counts every word between a section heading
// and its References/licence line in the raw dump, and compares with every word in the section's Markdown.
// Usage:
//   node scripts/check-source.ts [--raw data/courses/pom/raw/pom.txt] [--course data/courses/pom]
//                                [--chapters 2-3] [--threshold 0.03] [--lines]
// --lines also prints raw prose lines whose words do not appear in the Markdown (lost or mangled prose),
// and captions over 100 words: ingest drops "> **Figure**" lines, so prose swallowed by a caption is lost
// to the lessons even though its words are still in the Markdown. Those are listed, not failed on.
// Summary sections are skipped: the parser drops their exercises on purpose.
// Exits 1 if any section is flagged.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Course } from "../src/types/lesson.ts";

const args = process.argv.slice(2);
const arg = (name: string, dflt: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : dflt;
};
const rawPath = arg("raw", "data/courses/pom/raw/pom.txt");
const courseDir = arg("course", "data/courses/pom");
const threshold = Number(arg("threshold", "0.03"));
const showLines = args.includes("--lines");
const range = arg("chapters", "");
const chapters = new Set<number>();
for (const part of range ? range.split(",") : []) {
  const [a, b = a] = part.split("-").map(Number);
  for (let c = a; c <= b; c++) chapters.add(c);
}

const lines = readFileSync(rawPath, "utf8").replace(/[\r\f]/g, "").split("\n");
const course = JSON.parse(readFileSync(join(courseDir, "course.json"), "utf8")) as Course;

const FOOTER = /^\s*(\d+(\s+\([\d.]+\))?|[ivxlc]+)\s*$/;
const BOX = /^\s*(Learning Objectives|Concept Check|Key Terms|Critical Thinking Questions)\s*$/;
// a photo/figure credit, bounded so an unclosed "(Credit: …" cannot swallow the prose after it
const CREDIT =
  /(?:\(\s*(?:Credit|Attribution)\b|\bCredit:?\s*\()(?:[^()]|\([^()]{0,30}\)?){0,160}\)?|\bAttribution:[^()\n]{0,120}\blicen[cs]e/g;
// lines that are only (the tail of) a credit, licence or table source, and box preambles the parser drops on purpose
const NOT_PROSE = /\/ ?flickr\s?\/|Attribution \d\.\d Generic|\(CC BY|OpenStax, under CC|^\s*Sources?:|^\s*After (reading )?this chapter/;

/** Words as comparable tokens: lowercase alphanumerics, footnote digits glued to words removed. */
function tokens(s: string): string[] {
  return s
    .replace(/([A-Za-z.,;:"”’)])\d{1,3}\b/g, "$1")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** The raw span of a section: its heading (first occurrence after the TOC, not in a list of headings) to References/licence. */
function rawSpan(number: string): string[] {
  const head = new RegExp(`^${number.replace(".", "\\.")}: \\S`);
  const isHead = (l?: string) => !!l && /^\d{1,2}\.\d{1,2}: \S/.test(l);
  const tocEnd = lines.findIndex((l) => /^Index\s*$/.test(l));
  const start = lines.findIndex((l, i) => i > tocEnd && head.test(l) && !isHead(lines[i - 1]) && !isHead(lines[i + 1]));
  if (start < 0) return [];
  let end = lines.findIndex((l, i) => i > start && l.startsWith(`This page titled ${number}:`));
  if (end < 0) end = lines.length;
  const refs = lines.findIndex((l, i) => i > start && i < end && /^References:?\s*$/.test(l));
  return lines.slice(start + 1, refs > 0 ? refs : end).filter((l) => !FOOTER.test(l) && !BOX.test(l));
}

/** The Markdown's words, minus front matter, the title, section headings, concept-check answers and figure markers. */
function sourceText(md: string): string {
  return md
    .replace(/^---\n[\s\S]*?\n---\n/, "")
    .split("\n")
    .filter((l) => !/^# |^## |^\s*> answer:/.test(l))
    .join("\n")
    .replace(/\*\(figure not included\)\*/g, "");
}

const LONG_CAPTION = 100;
type Row = { number: string; raw: number; src: number; diff: number; lost: string[]; longCaptions: string[] };
const rows: Row[] = [];
for (const ch of course.chapters) {
  if (chapters.size && !chapters.has(ch.number)) continue;
  for (const s of ch.sections) {
    if (s.kind === "summary") continue;
    const span = rawSpan(s.number);
    if (!span.length) {
      rows.push({ number: s.number, raw: 0, src: 0, diff: 1, lost: ["(section heading not found in raw text)"], longCaptions: [] });
      continue;
    }
    const md = readFileSync(join(courseDir, s.sourceFile ?? ""), "utf8").replace(/\r/g, "");
    const srcTokens = tokens(sourceText(md));
    const rawTokens = tokens(span.join("\n").replace(CREDIT, " "));
    const srcJoined = ` ${srcTokens.join(" ")} `;
    // a raw line is lost when its inner words (first/last may be hyphen-joined across lines) are not in the source
    const lost: string[] = [];
    for (const l of span) {
      if (NOT_PROSE.test(l)) continue;
      const inner = tokens(l.replace(CREDIT, " ")).slice(1, -1);
      if (inner.length >= 5 && !srcJoined.includes(` ${inner.join(" ")} `)) lost.push(l.trim());
    }
    rows.push({
      number: s.number,
      raw: rawTokens.length,
      src: srcTokens.length,
      diff: (srcTokens.length - rawTokens.length) / Math.max(1, rawTokens.length),
      lost,
      longCaptions: md.split("\n").filter((l) => l.startsWith("> **") && tokens(l).length > LONG_CAPTION),
    });
  }
}

const flagged = rows.filter((r) => Math.abs(r.diff) > threshold || r.lost.length > 0);
console.log(`checked ${rows.length} sections (summaries skipped), flagged ${flagged.length} (|words diff| > ${threshold * 100}% or lost lines)`);
for (const r of rows) {
  const flag = flagged.includes(r) ? "!!" : "  ";
  console.log(
    `${flag} ${r.number.padEnd(5)} raw ${String(r.raw).padStart(5)}  source ${String(r.src).padStart(5)}  ${(r.diff * 100).toFixed(1).padStart(6)}%  lost lines ${r.lost.length}`,
  );
  if (!showLines) continue;
  for (const l of r.lost) console.log(`        - ${l.slice(0, 150)}`);
  for (const c of r.longCaptions) console.log(`        ? caption of ${tokens(c).length} words: ${c.slice(0, 120)}`);
}
if (flagged.length) process.exit(1);
