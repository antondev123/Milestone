// OFFLINE, deterministic, no API: pdftotext layout dump → per-section Markdown + course manifest.
// Usage:
//   pdftotext -layout "Principles of Management.pdf" data/courses/pom/raw/pom.txt
//   node scripts/parse-book.ts --in data/courses/pom/raw/pom.txt --out data/courses/pom [--chapters 1-3]
// Re-running overwrites source/, course.json, chapters/*-review.json, toc.md, LICENSE.md, parse-report.json.
// It never touches sections/ (ingest output). Exits non-zero unless 18 chapters / 144 sections are found.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Chapter, Course, SectionMeta } from "../src/types/lesson.ts";

// ---------- args ----------
const args = process.argv.slice(2);
function arg(name: string, dflt?: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : dflt;
}
const inPath = arg("in", "data/courses/pom/raw/pom.txt")!;
const outDir = arg("out", "data/courses/pom")!;
const courseId = arg("id", "pom")!;
const chapterFilter = parseRange(arg("chapters"));
const dry = args.includes("--dry");

function parseRange(s?: string): Set<number> | null {
  if (!s) return null;
  const out = new Set<number>();
  for (const part of s.split(",")) {
    const m = part.match(/^(\d+)(?:-(\d+))?$/);
    if (!m) throw new Error(`bad --chapters ${s}`);
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    for (let i = a; i <= b; i++) out.add(i);
  }
  return out;
}

// ---------- 0. normalise ----------
const raw = readFileSync(inPath, "utf8").replace(/[\r\f]/g, "");
let lines = raw.split("\n");

// ---------- 1. TOC ----------
const tocStart = lines.findIndex((l) => /^\s*TABLE OF CONTENTS\s*$/.test(l));
const tocEnd = lines.findIndex((l, i) => i > tocStart && /^Index\s*$/.test(l));
if (tocStart < 0 || tocEnd < 0) throw new Error("TOC not found");
type TocChapter = { number: number; title: string; sections: { number: string; title: string }[] };
const toc: TocChapter[] = [];
for (const l of lines.slice(tocStart, tocEnd)) {
  const c = l.match(/^(\d{1,2}): (.+)$/);
  if (c) {
    toc.push({ number: Number(c[1]), title: c[2].trim(), sections: [] });
    continue;
  }
  const s = l.match(/^\s{2,}(\d{1,2})\.(\d{1,2}): (.+)$/);
  if (s && toc.length) toc[toc.length - 1].sections.push({ number: `${s[1]}.${s[2]}`, title: s[3].trim() });
}
const tocSections = toc.flatMap((c) => c.sections);
console.log(`toc: ${toc.length} chapters, ${tocSections.length} sections`);

// ---------- 2. hard stop before the two-column back matter ----------
const lastSection = tocSections[tocSections.length - 1].number;
let bodyEnd = -1;
for (let i = lines.length - 1; i >= 0; i--) {
  if (lines[i].startsWith(`This page titled ${lastSection}:`)) {
    bodyEnd = i + 2;
    break;
  }
}
if (bodyEnd < 0) throw new Error("could not find the last section's licence line");
lines = lines.slice(tocEnd, bodyEnd);

// ---------- 3. section starts ----------
const HEADER = /^(\d{1,2})\.(\d{1,2}): (\S.*)$/;
const isHeader = (l: string | undefined) => !!l && HEADER.test(l);
type RawSection = { number: string; chapter: number; title: string; start: number; end: number };
const starts: RawSection[] = [];
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(HEADER);
  if (!m) continue;
  // chapter front pages list all their sections; those lines are indented in the TOC but 18.1/18.2
  // appear at column 0. A real section header is never adjacent to another header.
  if (isHeader(lines[i - 1]) || isHeader(lines[i + 1])) continue;
  const number = `${m[1]}.${m[2]}`;
  if (starts.some((s) => s.number === number)) continue; // first occurrence wins
  starts.push({ number, chapter: Number(m[1]), title: m[3].trim(), start: i, end: -1 });
}
for (const s of starts) {
  const endIdx = lines.findIndex((l, i) => i > s.start && l.startsWith(`This page titled ${s.number}:`));
  s.end = endIdx > 0 ? endIdx : lines.length;
}
const missing = tocSections.filter((t) => !starts.some((s) => s.number === t.number));
const extra = starts.filter((s) => !tocSections.some((t) => t.number === s.number));
console.log(`body: ${starts.length} sections found, ${missing.length} missing, ${extra.length} extra`);
if (missing.length) console.log("  missing:", missing.map((m) => m.number).join(" "));

// ---------- helpers ----------
const FOOTER = /^\s*\d+(\s+\([\d.]+\))?\s*$/;
const ROMAN = /^\s*[ivxlc]+\s*$/;
const indent = (l: string) => l.length - l.trimStart().length;
const BOX_TITLES = new Set([
  "Learning Objectives",
  "Concept Check",
  "Key Terms",
  "Chapter Review Questions",
  "Critical Thinking Questions",
]);
const NUMBERED = /^\s*(\d{1,2})\.\s+(.*)$/;
const BULLET = /^\s*(�|•)\s+(.*)$/;

function fixMojibake(s: string): string {
  return s
    .replace(/(\d)�(\d)/g, "$1–$2")
    .replace(/(\w)�(\w)/g, "$1–$2")
    .replace(/^\s*�\s+/, "- ")
    .replace(/\s�\s/g, " – ")
    .replace(/--/g, " — ")
    .replace(/\s{2,}/g, " ");
}

/** Join wrapped lines into paragraphs. Blank line = paragraph break. Keeps compound hyphens. */
function joinParagraph(ls: string[]): string {
  let out = "";
  for (const l of ls) {
    const t = l.trim();
    if (!t) continue;
    if (!out) out = t;
    else if (/[a-z]-$/.test(out) && /^[a-z]/.test(t)) out += t;
    else out += " " + t;
  }
  return out;
}

/** Strip footnote digits glued to prose, only for numbers that are in this section's reference list. */
function stripFootnotes(text: string, refs: Set<number>): { text: string; count: number } {
  if (!refs.size) return { text, count: 0 };
  let count = 0;
  const out = text.replace(/([a-zA-Z"'’”\)\],.;:?!])(\d{1,3})(?![\d.,%\-A-Za-z])/g, (m, pre: string, num: string) => {
    if (refs.has(Number(num))) {
      count++;
      return pre;
    }
    return m;
  });
  return { text: out, count };
}

function wordCount(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

/**
 * Parse box items with wrapped continuation lines, tolerant of page footers in between. Items are
 * "N. text", or "� text" bullets, or (when a box has neither) one item per line at the box's base indent.
 */
function numberedItems(ls: string[]): string[] {
  const body = ls.filter((l) => l.trim() && !FOOTER.test(l));
  const marker = (l: string) => l.match(NUMBERED) ?? l.match(BULLET);
  const hasMarkers = body.some(marker);
  const base = Math.min(...body.map(indent));
  const items: string[] = [];
  for (const l of body) {
    const m = marker(l);
    if (m) items.push(m[2].trim());
    else if (!hasMarkers && indent(l) === base) items.push(l.trim());
    else if (items.length) items[items.length - 1] += " " + l.trim();
  }
  return items.map(fixMojibake);
}

// ---------- captions ----------
const CAPTION_LABEL = /^(Figure|Exhibit|Table)\s*(\d+(?:\.\d+)*)?\s*(:)?\s*/;
// "(Credit: …", "Credit (New America/ …", "Credit: ( public domain / …", "(Gabrielle Barni / flickr/ …"
const CREDIT_PAREN = /\((?:Credit|Attribution)\b|\bCredit:?\s*\(|\([^()]{1,60}\/\s*(?:flickr|Pixabay)\s*\//;
const CREDIT_TAIL = /\s*(?:\((?:Credit|Attribution)\b|\bCredit:?\s*\(|\([^()]{1,60}\/\s*(?:flickr|Pixabay)\s*\/|\bAttribution:).*$/;
// a whole "(Credit: X/ flickr/ Attribution 2.0 Generic (CC BY 2.0))", or its unclosed start; bounded so a
// missing ")" cannot swallow the prose after it
const CREDIT_SPAN = /\s*(?:\(\s*(?:Credit|Attribution)\b|\bCredit\s*\()(?:[^()]|\([^()]{0,30}\)?){0,160}\)?/g;
const CREDIT_FRAGMENT = /\b(Credit:|Attribution:|Attribution \d|\(CC BY|flickr|Copyright Rice University|Wikimedia Commons)/;
const CREDIT_LINE_END = /\bAttribution:.*\blicen[cs]e\.?$/;
const MAX_CAPTION_LINES = 10; // the longest real caption (P&G Tide Pods, 17.5) is 9 lines
const CAPTION_CREDIT_WINDOW = 6; // captions seen so far put their credit on line 5 at the latest

/** A line opening with a figure label is a caption unless it is prose that happens to start with a reference. */
function isCaptionStart(t: string, para: string[]): boolean {
  const m = t.match(CAPTION_LABEL);
  if (!m) return false;
  if (m[3]) return true; // "Figure : Title", "Table 6.1: Title"
  if (!m[2] && !/^Figure\s{2,}[A-Z]/.test(t)) return false; // "Figure  Howard Schultz …" lost its number
  const rest = t.slice(m[0].length);
  // "Exhibit 1.3). Executive…", "Exhibit 12.3, which…", "Exhibit 1.5 shows…", "Exhibit 4.4is…"
  if (/^[a-z),.;]/.test(rest)) return false;
  // mid-sentence: the paragraph so far ends "…(see" and this line carries on
  const prev = para[para.length - 1]?.trim();
  if (prev && !/[.!?:"”)]$/.test(prev)) return false;
  return true;
}

/**
 * Read a caption starting at `start`. It ends where its (Credit …)/(Attribution …) parenthesis closes,
 * at a blank line, or at a heading. pdftotext splits captions around the image and double-spaces them
 * in later chapters, so it crosses blank lines while the credit is still open, when the next line
 * continues an unfinished sentence in lowercase, or when the credit shows up within a few more
 * single-spaced caption lines. Text after the closing parenthesis is prose and is returned as `rest`.
 */
function readCaption(ls: string[], start: number): { lines: string[]; next: number; rest: string } {
  const lines: string[] = [];
  // a centred title ("      Exhibit 9.5 Some Questions That …") or a bare label ("Table 11.3") is one line long
  const titleOnly = indent(ls[start]) >= 2 || ls[start].trim().replace(CAPTION_LABEL, "") === "";
  let depth = -1; // -1 until a parenthesised credit opens
  let i = start;
  while (i < ls.length) {
    const t = ls[i].trim();
    let from = 0;
    if (depth < 0) {
      const m = t.match(CREDIT_PAREN);
      if (m) {
        depth = 0;
        from = m.index! + m[0].indexOf("(");
      }
    }
    if (depth >= 0) {
      for (let k = from; k < t.length; k++) {
        if (t[k] === "(") depth++;
        else if (t[k] === ")" && --depth === 0) {
          const rest = t.slice(k + 1).replace(/^[\s).,;]+/, "");
          lines.push(t.slice(0, k + 1));
          return { lines, next: i + 1, rest };
        }
      }
    }
    lines.push(t);
    // "…(Credit: U.S. Embasy Nairobi/ flickr/ Attribution 2.0 Generic (CC BY 2.0)" is one ")" short; prose follows
    if (depth > 0 && t.endsWith(")")) return { lines, next: i + 1, rest: "" };
    // "Exhibit 3.4 Gantt Chart Attribution: Copyright Rice University, OpenStax, under CC BY-NC-SA 4.0 license"
    if (depth < 0 && CREDIT_LINE_END.test(t)) return { lines, next: i + 1, rest: "" };
    // decide whether the next line still belongs to the caption
    let j = i + 1;
    while (j < ls.length && !ls[j].trim()) j++;
    if (j >= ls.length || lines.length >= MAX_CAPTION_LINES) return { lines, next: j, rest: "" };
    const nt = ls[j].trim();
    if (HEADER.test(ls[j]) || BOX_TITLES.has(nt)) return { lines, next: j, rest: "" };
    // such a title followed straight away by a column-0 sentence: that sentence is prose
    if (j === i + 1 && titleOnly && depth < 0 && indent(ls[j]) === 0 && /^[A-Z"“]/.test(nt)) return { lines, next: j, rest: "" };
    if (j > i + 1) {
      const crosses =
        depth > 0 ||
        /^(\((Credit|Attribution|\d{4})|Credit:?\s*\()/.test(nt) ||
        (j <= i + 3 && /^[a-z]/.test(nt) && !/[.!?]["”]?$/.test(t)) ||
        creditAhead(ls, j, CAPTION_CREDIT_WINDOW - lines.length);
      if (!crosses) return { lines, next: j, rest: "" };
    }
    i = j;
  }
  return { lines, next: i, rest: "" };
}

/** Does a parenthesised credit open within `budget` lines from `j`, with at most one blank between lines? */
function creditAhead(ls: string[], j: number, budget: number): boolean {
  for (let seen = 0; j < ls.length && seen < budget; seen++) {
    const t = ls[j].trim();
    if (HEADER.test(ls[j]) || BOX_TITLES.has(t) || CAPTION_LABEL.test(t)) return false;
    if (CREDIT_PAREN.test(t)) return true;
    j++;
    if (j < ls.length && !ls[j].trim()) j++;
    if (j < ls.length && !ls[j].trim()) return false; // two blanks: the caption is over
  }
  return false;
}

const creditWarnings: string[] = [];

// ---------- 4. parse one section ----------
interface ParsedSection {
  number: string;
  chapter: number;
  title: string;
  objectives: string[];
  paragraphs: string[]; // body markdown paragraphs (headings as ### / captions as blockquotes)
  conceptCheck: string[];
  words: number;
  footnotesStripped: number;
  mojibakeLeft: number;
  // summary-only fields
  keyTermNames: string[];
  keyTermDefs: string[];
  outcomes: { section: string; question: string; answer: string }[];
  reviewQuestions: string[];
}

function parseSection(s: RawSection): ParsedSection {
  const body = lines.slice(s.start + 1, s.end);
  // reference numbers
  const refIdx = body.findIndex((l) => /^References:?\s*$/.test(l));
  const refs = new Set<number>();
  if (refIdx >= 0) {
    for (const l of body.slice(refIdx + 1)) {
      const m = l.match(/^(\d{1,3})\.\s/);
      if (m) refs.add(Number(m[1]));
    }
  }
  const content = (refIdx >= 0 ? body.slice(0, refIdx) : body).filter((l) => !FOOTER.test(l) && !ROMAN.test(l));

  const out: ParsedSection = {
    number: s.number,
    chapter: s.chapter,
    title: s.title,
    objectives: [],
    paragraphs: [],
    conceptCheck: [],
    words: 0,
    footnotesStripped: 0,
    mojibakeLeft: 0,
    keyTermNames: [],
    keyTermDefs: [],
    outcomes: [],
    reviewQuestions: [],
  };

  // Walk blocks. A block = run of lines until a blank or an indentation-class change to a box title.
  let i = 0;
  let para: string[] = [];
  const flushPara = () => {
    if (!para.length) return;
    let text = fixMojibake(joinParagraph(para));
    const st = stripFootnotes(text, refs);
    text = st.text;
    out.footnotesStripped += st.count;
    para = [];
    if (!text) return;
    // photo credits: drop the credit, keep any prose around it (pdftotext glues the two together)
    const bare = text.replace(CREDIT_SPAN, " ").replace(/\s{2,}/g, " ").trim();
    if (bare !== text || CREDIT_FRAGMENT.test(text)) {
      if (wordCount(bare) < 4) return;
      if (wordCount(bare) < 60 && CREDIT_FRAGMENT.test(bare)) {
        creditWarnings.push(`${s.number}: dropped credit fragment: ${bare.slice(0, 100)}`);
        return;
      }
      if (bare !== text) creditWarnings.push(`${s.number}: credit inside prose, kept: ${bare.slice(0, 100)}`);
      text = bare;
    }
    // Short Title-Case line without terminal punctuation → subheading
    if (wordCount(text) <= 9 && /^[A-Z][^.!?:]*$/.test(text) && !/^(Figure|Exhibit|Table)\b/.test(text)) {
      out.paragraphs.push(`### ${text}`);
      return;
    }
    out.paragraphs.push(text);
  };

  const takeBoxBody = (): string[] => {
    // boxed content: following lines with indent >= 3 (or blank), until a col-0/col-1 line
    const ls: string[] = [];
    while (i < content.length) {
      const l = content[i];
      if (l.trim() === "") {
        ls.push(l);
        i++;
        continue;
      }
      if (indent(l) < 3) break;
      ls.push(l);
      i++;
    }
    return ls;
  };

  // detect summary-section structures first (they are col-0 headed and span many lines)
  const isSummary = /^Summary$/i.test(s.title);

  while (i < content.length) {
    const l = content[i];
    const t = l.trim();
    const ind = indent(l);

    if (!t) {
      flushPara();
      i++;
      continue;
    }

    // box title at col 1 (also tolerate col 0 for Key Terms definition blocks in summaries)
    if (ind <= 2 && BOX_TITLES.has(t)) {
      flushPara();
      i++;
      const boxLines = takeBoxBody();
      if (t === "Learning Objectives") out.objectives.push(...numberedItems(boxLines));
      else if (t === "Concept Check" || t === "Critical Thinking Questions") out.conceptCheck.push(...numberedItems(boxLines));
      else if (t === "Chapter Review Questions") out.reviewQuestions.push(...numberedItems(boxLines));
      else if (t === "Key Terms") {
        if (ind === 0) {
          const def = fixMojibake(joinParagraph(boxLines));
          if (def) out.keyTermDefs.push(def);
        } else {
          for (const bl of boxLines) {
            const bt = bl.trim();
            if (!bt) continue;
            const m = bt.match(/^(.+?) available at the end of this section\.$/);
            out.keyTermNames.push(m ? m[1].trim() : bt);
          }
        }
      }
      continue;
    }

    // figure / exhibit / table captions (any indent). Only the caption text leaves the prose: the
    // caption ends where its credit closes, prose glued after that stays prose, and lines that merely
    // start with a reference ("Exhibit 1.3). Executive…", "Exhibit 1.5 shows…") are prose.
    if (isCaptionStart(t, para)) {
      flushPara();
      const cap = readCaption(content, i);
      i = cap.next;
      const text = fixMojibake(joinParagraph(cap.lines));
      const label = text.match(CAPTION_LABEL)!;
      const body = text.slice(label[0].length).replace(CREDIT_TAIL, "").trim();
      out.paragraphs.push(`> **${label[1]}${label[2] ? " " + label[2] : ""}**${body ? " " + body : ""} *(figure not included)*`);
      if (cap.rest) para.push(cap.rest);
      continue;
    }

    // named aside box (col-1 short title + col-3 body), e.g. "Managerial Leadership"
    if (
      ind === 1 &&
      wordCount(t) <= 8 &&
      /^[A-Z]/.test(t) &&
      !/[.!?]$/.test(t) &&
      i + 1 < content.length &&
      (indent(content[i + 1]) >= 3 || content[i + 1].trim() === "")
    ) {
      flushPara();
      const title = fixMojibake(t);
      i++;
      const boxLines = takeBoxBody();
      const paras: string[] = [];
      let cur: string[] = [];
      for (const bl of boxLines) {
        if (!bl.trim()) {
          if (cur.length) paras.push(fixMojibake(joinParagraph(cur)));
          cur = [];
        } else cur.push(bl);
      }
      if (cur.length) paras.push(fixMojibake(joinParagraph(cur)));
      if (paras.length) out.paragraphs.push(`#### ${title}`, ...paras);
      continue;
    }

    // summary-only: "Summary of Learning Outcomes" block at col 0
    if (isSummary && (/^Summary of Learning Outcomes$/.test(t) || (ind === 0 && /^\d{1,2}\.\d{1,2} [A-Z]/.test(t)))) {
      flushPara();
      if (/^Summary of Learning Outcomes$/.test(t)) i++;
      let curSection = "";
      let curQ = "";
      let curA: string[] = [];
      const flushQA = () => {
        if (curSection && curQ) out.outcomes.push({ section: curSection, question: curQ, answer: fixMojibake(joinParagraph(curA)) });
        curQ = "";
        curA = [];
      };
      while (i < content.length) {
        const sl = content[i];
        const st = sl.trim();
        if (indent(sl) === 1 && BOX_TITLES.has(st)) break; // next box (Chapter Review Questions)
        if (/^(Management Skills Application Exercises|Managerial Decision Exercises|Critical Thinking Case|Answers)$/.test(st)) break;
        const sec = st.match(/^(\d{1,2}\.\d{1,2}) (.+)$/);
        const q = st.match(/^(\d{1,2})\. (.+)$/);
        if (sec) {
          flushQA();
          curSection = sec[1];
        } else if (q) {
          flushQA();
          curQ = fixMojibake(q[2]);
        } else if (st) curA.push(st);
        i++;
      }
      flushQA();
      continue;
    }

    // summary-only: everything from the exercises onward is not course material
    if (isSummary && /^(Management Skills Application Exercises|Managerial Decision Exercises|Critical Thinking Case)$/.test(t)) {
      flushPara();
      i++;
      // skip until a Key Terms definition block or the end
      while (i < content.length && !(content[i].trim() === "Key Terms" && indent(content[i]) === 0)) i++;
      continue;
    }
    if (isSummary && t === "Answers") {
      i++;
      continue;
    }

    // body prose (col 0) or stray indented prose: accumulate
    para.push(l);
    i++;
  }
  flushPara();

  // post-pass: strip inline credits, then re-join paragraphs split by a page break
  const merged: string[] = [];
  for (let p of out.paragraphs) {
    if (!p.startsWith("> ")) p = p.replace(/\s*\((Credit|Attribution)[^)]*\)\)?/g, "").trim();
    if (!p) continue;
    const prev = merged[merged.length - 1];
    if (
      prev &&
      !prev.startsWith("#") &&
      !prev.startsWith("> ") &&
      !p.startsWith("#") &&
      !p.startsWith("> ") &&
      !/[.!?:"”)]$/.test(prev) &&
      /^[a-z]/.test(p)
    ) {
      merged[merged.length - 1] = prev + " " + p;
    } else merged.push(p);
  }
  out.paragraphs = merged;

  out.words =out.paragraphs.filter((p) => !p.startsWith("> ")).reduce((a, p) => a + wordCount(p.replace(/^#+\s*/, "")), 0);
  out.mojibakeLeft = out.paragraphs.join("\n").split("�").length - 1;
  return out;
}

// ---------- 5. run ----------
const parsed = starts.filter((s) => !chapterFilter || chapterFilter.has(s.chapter)).map(parseSection);
const byNumber = new Map(parsed.map((p) => [p.number, p]));

// Concept-check answers: from the chapter's summary section outcomes, matched by section number, in order.
const answersFor = new Map<string, string[]>();
for (const p of parsed) {
  for (const o of p.outcomes) {
    const arr = answersFor.get(o.section) ?? [];
    arr.push(o.answer);
    answersFor.set(o.section, arr);
  }
}

// Key terms: zip names with defs inside each summary section.
const keyTermsByChapter = new Map<number, { term: string; definition: string }[]>();
const report: Record<string, unknown> = { generatedAt: new Date().toISOString(), warnings: [] as string[], sections: {} as Record<string, unknown> };
const warn = (m: string) => (report.warnings as string[]).push(m);
creditWarnings.forEach(warn);
for (const p of parsed) {
  if (!p.keyTermNames.length) continue;
  if (p.keyTermNames.length === p.keyTermDefs.length) {
    keyTermsByChapter.set(
      p.chapter,
      p.keyTermNames.map((term, k) => ({ term, definition: p.keyTermDefs[k] })),
    );
  } else {
    warn(`chapter ${p.chapter}: key terms ${p.keyTermNames.length} names vs ${p.keyTermDefs.length} definitions; skipped`);
  }
}

// ---------- 6. emit ----------
const pad = (n: number | string) => String(n).padStart(2, "0");
const secFile = (num: string) => {
  const [c, s] = num.split(".");
  return `source/c${pad(c)}/c${pad(c)}-s${pad(s)}.md`;
};
const secId = (num: string) => {
  const [c, s] = num.split(".");
  return `${courseId}/c${c}/s${s}`;
};

if (!dry) mkdirSync(join(outDir, "chapters"), { recursive: true });
const chapters: Chapter[] = [];
let totalWords = 0;
let totalConcept = 0;
let totalFootnotes = 0;
let totalMojibake = 0;
let answered = 0;

for (const tc of toc) {
  if (chapterFilter && !chapterFilter.has(tc.number)) continue;
  const chapterId = `${courseId}/c${tc.number}`;
  const sections: SectionMeta[] = [];
  const keyTerms = keyTermsByChapter.get(tc.number) ?? [];
  let chapterObjectives: string[] = [];
  let reviewQuestions: string[] = [];

  for (const ts of tc.sections) {
    const p = byNumber.get(ts.number);
    if (!p) {
      warn(`section ${ts.number} in TOC but not in body`);
      continue;
    }
    const isSummary = /^Summary$/i.test(ts.title);
    const isIntro = /^Introduction/i.test(ts.title) && p.words < 80;
    if (p.reviewQuestions.length) reviewQuestions = p.reviewQuestions;
    if (isIntro && !chapterObjectives.length) chapterObjectives = p.objectives;
    const answers = answersFor.get(ts.number) ?? [];
    const qa = p.conceptCheck.map((q, k) => ({ question: q, answer: answers[k] }));
    answered += qa.filter((x) => x.answer).length;

    // Markdown source
    const fm = [
      "---",
      `id: ${secId(ts.number)}`,
      `number: "${ts.number}"`,
      `chapter: ${tc.number}`,
      `title: ${ts.title}`,
      `words: ${p.words}`,
      `kind: ${isSummary ? "summary" : isIntro ? "intro" : "content"}`,
      "license: CC BY 4.0",
      "source: OpenStax Principles of Management via LibreTexts",
      "---",
      "",
    ];
    const md: string[] = [...fm, `# ${ts.number} ${ts.title}`, ""];
    if (p.objectives.length) md.push("## Learning Objectives", "", ...p.objectives.map((o, k) => `${k + 1}. ${o}`), "");
    if (p.paragraphs.length) md.push("## Body", "", ...p.paragraphs.flatMap((x) => [x, ""]));
    if (qa.length) {
      md.push("## Concept Check", "");
      qa.forEach((x, k) => {
        md.push(`${k + 1}. ${x.question}`);
        if (x.answer) md.push(`   > answer: ${x.answer}`);
        md.push("");
      });
    }
    if (isSummary && keyTerms.length) md.push("## Key Terms", "", ...keyTerms.map((k) => `- **${k.term}**: ${k.definition}`), "");
    if (isSummary && p.reviewQuestions.length) md.push("## Chapter Review Questions", "", ...p.reviewQuestions.map((q, k) => `${k + 1}. ${q}`), "");

    const rel = secFile(ts.number);
    if (!dry) {
      mkdirSync(join(outDir, rel, ".."), { recursive: true });
      writeFileSync(join(outDir, rel), md.join("\n"));
    }

    sections.push({
      id: secId(ts.number),
      number: ts.number,
      title: ts.title,
      kind: isSummary ? "summary" : isIntro ? "intro" : "content",
      words: p.words,
      status: "source",
      sourceFile: rel,
      objectives: p.objectives,
      keyTerms: [],
      segments: [],
    });
    (report.sections as Record<string, unknown>)[ts.number] = {
      words: p.words,
      conceptChecks: qa.length,
      answered: qa.filter((x) => x.answer).length,
      footnotesStripped: p.footnotesStripped,
      mojibakeLeft: p.mojibakeLeft,
      plannedSegments: p.words ? Math.min(5, Math.max(1, Math.round(p.words / 700))) : 0,
    };
    totalWords += p.words;
    totalConcept += qa.length;
    totalFootnotes += p.footnotesStripped;
    totalMojibake += p.mojibakeLeft;
  }

  // Attach chapter key terms to the manifest on the summary section (single home, small)
  const summarySec = sections.find((s) => s.kind === "summary");
  if (summarySec) summarySec.keyTerms = keyTerms;

  const shortTitle = tc.title.split(/ - | – |: /)[0].replace(/^(The |An |A )/, "").trim();
  const chapter: Chapter = {
    id: chapterId,
    number: tc.number,
    title: tc.title,
    shortTitle: shortTitle.length > 40 ? shortTitle.slice(0, 40).replace(/\s+\S*$/, "") : shortTitle,
    objectives: chapterObjectives,
    sections,
    segments: [],
  };
  if (reviewQuestions.length && !dry) {
    const reviewFile = `chapters/c${pad(tc.number)}-review.json`;
    writeFileSync(join(outDir, reviewFile), JSON.stringify({ chapterId, questions: reviewQuestions }, null, 2) + "\n");
    chapter.reviewFile = reviewFile;
  }
  // Chapter front-page markdown
  if (!dry) {
    const cmd = [
      `# Chapter ${tc.number}: ${tc.title}`,
      "",
      ...(chapterObjectives.length ? ["## Learning Objectives", "", ...chapterObjectives.map((o, k) => `${k + 1}. ${o}`), ""] : []),
      "## Sections",
      "",
      ...sections.map((s) => `- ${s.number} ${s.title} (${s.words} words)`),
      "",
    ];
    writeFileSync(join(outDir, `source/c${pad(tc.number)}/c${pad(tc.number)}.md`), cmd.join("\n"));
  }
  chapters.push(chapter);
}

// Manifest. Preserve ingested state from an existing manifest so re-parsing never loses lessons.
const manifestPath = join(outDir, "course.json");
let prev: Course | null = null;
if (existsSync(manifestPath)) {
  try {
    prev = JSON.parse(readFileSync(manifestPath, "utf8")) as Course;
  } catch {
    prev = null;
  }
}
if (prev) {
  for (const ch of chapters) {
    const pc = prev.chapters?.find((c) => c.id === ch.id);
    if (!pc) continue;
    if (pc.quizFile) ch.quizFile = pc.quizFile;
    for (const s of ch.sections) {
      const ps = pc.sections.find((x) => x.id === s.id);
      if (ps && ps.status === "ingested") {
        s.status = "ingested";
        s.lessonFile = ps.lessonFile;
        s.segments = ps.segments;
        s.sourceHash = ps.sourceHash;
      }
    }
    ch.segments = ch.sections.flatMap((s) => s.segments);
  }
  // keep chapters outside the filter untouched
  if (chapterFilter) {
    for (const pc of prev.chapters ?? []) if (!chapters.some((c) => c.id === pc.id)) chapters.push(pc);
    chapters.sort((a, b) => a.number - b.number);
  }
}

const course: Course = {
  id: courseId,
  title: "Principles of Management",
  description: "The OpenStax Principles of Management textbook, transposed into commute-sized audio lessons with checkpoints.",
  estimatedMinutes: chapters.reduce((a, c) => a + c.segments.reduce((x, s) => x + s.durationSec + s.checkpoint.length * 45, 0), 0) / 60 | 0,
  license: {
    name: "CC BY 4.0",
    url: "https://creativecommons.org/licenses/by/4.0/",
    attribution: "Principles of Management by OpenStax, via LibreTexts. Licensed CC BY 4.0. Adapted into spoken lessons.",
  },
  chapters,
  modules: chapters,
};

const tocMd = chapters
  .flatMap((c) => [`${c.number} ${c.title}`, ...c.sections.map((s) => ` ${s.number} ${s.title}`)])
  .join("\n");

const licenseMd = `# Licence

This course is derived from *Principles of Management* by OpenStax (Rice University), as exported by LibreTexts,
licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

Changes: the text was parsed into per-section Markdown (\`source/\`), figures and references were removed,
and each section was rewritten into short spoken lessons with checkpoint questions (\`sections/\`) using Claude.
The spoken lessons are derivative works and carry the same CC BY 4.0 licence.

Attribution: "Principles of Management" by OpenStax, https://openstax.org/details/books/principles-management
`;

if (!dry) {
  writeFileSync(manifestPath, JSON.stringify({ ...course, modules: undefined }, null, 2) + "\n");
  writeFileSync(join(outDir, "toc.md"), tocMd + "\n");
  writeFileSync(join(outDir, "LICENSE.md"), licenseMd);
  const reportPath = join(outDir, "parse-report.json");
  if (chapterFilter && existsSync(reportPath)) {
    // like the manifest: keep the report rows of chapters outside the filter
    const prevSections = (JSON.parse(readFileSync(reportPath, "utf8")) as { sections?: Record<string, unknown> }).sections ?? {};
    const sections = report.sections as Record<string, unknown>;
    for (const [num, row] of Object.entries(prevSections)) if (!chapterFilter.has(Number(num.split(".")[0]))) sections[num] ??= row;
    report.sections = Object.fromEntries(
      Object.entries(sections).sort(([a], [b]) => {
        const [ac, as] = a.split(".").map(Number);
        const [bc, bs] = b.split(".").map(Number);
        return ac - bc || as - bs;
      }),
    );
  }
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
}

console.log(
  `chapters ${chapters.length}/${toc.length}  sections ${parsed.length}/${chapterFilter ? tocSections.filter((s) => chapterFilter.has(Number(s.number.split(".")[0]))).length : tocSections.length}  missing ${missing.length}  extra ${extra.length}`,
);
console.log(`prose words ${totalWords}  concept checks ${totalConcept} (answered ${answered})  footnotes stripped ${totalFootnotes}  mojibake left ${totalMojibake}`);
console.log(`key terms: ${[...keyTermsByChapter.keys()].length} chapters, ${(report.warnings as string[]).length} warnings`);
for (const w of report.warnings as string[]) console.log("  warn:", w);
if (!chapterFilter && (toc.length !== 18 || starts.length !== 144)) {
  console.error("ASSERTION FAILED: expected 18 chapters and 144 sections");
  process.exit(1);
}
