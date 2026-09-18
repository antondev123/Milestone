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
  const out = text.replace(/([a-zA-Z"'’”\)\],.;:?!])(\d{1,3})(?![\d.,%\-])/g, (m, pre: string, num: string) => {
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

/** Parse "N. text" items with wrapped continuation lines, tolerant of page footers in between. */
function numberedItems(ls: string[]): string[] {
  const items: string[] = [];
  for (const l of ls) {
    if (FOOTER.test(l) || !l.trim()) continue;
    const m = l.match(NUMBERED);
    if (m) items.push(m[2].trim());
    else if (items.length) items[items.length - 1] += " " + l.trim();
  }
  return items.map(fixMojibake);
}

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
    // photo credits and licence tails of captions
    if (wordCount(text) < 60 && /\b(Credit:|Attribution:|Attribution \d|\(CC BY|flickr|Copyright Rice University|Wikimedia Commons)/.test(text)) return;
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

    // figure / exhibit / table captions at col 1
    if (ind <= 1 && /^(Figure|Exhibit|Table)\s*[:\d]/.test(t)) {
      flushPara();
      const cap: string[] = [l];
      i++;
      while (i < content.length && content[i].trim() && !HEADER.test(content[i]) && !BOX_TITLES.has(content[i].trim())) {
        cap.push(content[i]);
        i++;
        // captions end with a credit in parentheses; stop there so prose on the next line stays prose
        if (/\((Credit|Attribution)[^)]*\)\)?\s*$/.test(cap[cap.length - 1])) break;
      }
      const text = fixMojibake(joinParagraph(cap));
      const label = text.match(/^(Exhibit|Figure|Table)\s*:?\s*([\d.]+)?/);
      const body = text
        .replace(/^(Exhibit|Figure|Table)\s*:?\s*[\d.]*\s*/, "")
        .replace(/\s*\((Credit|Attribution)[^)]*\)?\s*$/, "");
      out.paragraphs.push(`> **${label ? label[0].replace(/[:\s]+$/, "") : "Figure"}** ${body} *(figure not included)*`);
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
  writeFileSync(join(outDir, "parse-report.json"), JSON.stringify(report, null, 2) + "\n");
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
