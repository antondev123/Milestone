// Every spoken phrasing in one place, as pure functions. Kept short (≤ ~15 words) and speech-safe.
import {
  allSegments,
  chapterOf,
  sectionOf,
  type Chapter,
  type Course,
  type Progress,
  type SectionMeta,
  type SegmentMeta,
} from "@/types/lesson";

const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];
export function num(n: number): string {
  return n >= 0 && n <= 20 ? WORDS[n] : String(n);
}

/** "2.5" → "two point five" */
export function sectionNumber(number: string): string {
  const [c, s] = number.split(".");
  return `${num(Number(c))} point ${num(Number(s))}`;
}

export interface Place {
  chapter: Chapter;
  section: SectionMeta;
  segment: SegmentMeta;
  partIndex: number; // 1-based within section
  partCount: number;
  sectionIndex: number; // 1-based, teachable sections only
  sectionCount: number;
  chapterPct: number;
}

export function place(course: Course, segmentId: string): Place | null {
  const segment = allSegments(course).find((s) => s.id === segmentId);
  if (!segment) return null;
  const chapter = chapterOf(course, segmentId);
  const section = sectionOf(course, segmentId);
  if (!chapter || !section) return null;
  const teachable = chapter.sections.filter((s) => s.segments.length > 0);
  return {
    chapter,
    section,
    segment,
    partIndex: section.segments.findIndex((s) => s.id === segmentId) + 1,
    partCount: section.segments.length,
    sectionIndex: teachable.findIndex((s) => s.id === section.id) + 1,
    sectionCount: teachable.length,
    chapterPct: 0,
  };
}

export function chapterPct(progress: Progress, chapter: Chapter): number {
  const done = progress.segmentsCompleted.filter((id) => id.startsWith(chapter.id + "/")).length;
  return Math.round((done / Math.max(1, chapter.segments.length)) * 100);
}

/** Median trip minutes so far, default 20. */
export function typicalTripMinutes(progress: Progress): number {
  const m = progress.trips.map((t) => t.minutes).filter((x) => x > 0).sort((a, b) => a - b);
  return m.length ? m[Math.floor(m.length / 2)] : 20;
}

export function legsRemaining(course: Course, progress: Progress, chapter: Chapter): number {
  const done = new Set(progress.segmentsCompleted);
  const secs = chapter.segments.filter((s) => !done.has(s.id)).reduce((a, s) => a + s.durationSec + s.checkpoint.length * 45, 0);
  return Math.max(1, Math.ceil(secs / 60 / typicalTripMinutes(progress)));
}

// ---------- lines ----------

export function partIntro(p: Place): string {
  const part = p.partCount > 1 ? `Part ${num(p.partIndex)} of ${num(p.partCount)}. ` : "";
  return `${part}${p.segment.title}.`;
}

export function sectionIntro(p: Place): string {
  return `Section ${sectionNumber(p.section.number)}, ${p.section.title}. ${partIntro(p)}`;
}

export function chapterIntro(p: Place): string {
  return `Chapter ${num(p.chapter.number)}, ${p.chapter.shortTitle}. ${sectionIntro(p)}`;
}

/** Boundary line when moving from `from` to `to`. Speaks only the level that changed. */
export function boundary(from: Place | null, to: Place): string {
  if (!from || from.chapter.id !== to.chapter.id) {
    const done = from ? `Chapter ${num(from.chapter.number)} done. ` : "";
    return `${done}${chapterIntro(to)}`;
  }
  if (from.section.id !== to.section.id) return `Section done. Next, ${sectionIntro(to)}`;
  return partIntro(to);
}

export function chapterDone(chapter: Chapter, hasQuiz: boolean): string {
  return `Chapter ${num(chapter.number)} done. ${hasQuiz ? "Its quiz is waiting whenever you say quiz me. " : ""}`;
}

export function greeting(course: Course, progress: Progress, minutes: number, planSegments: number, firstSegmentId: string): string {
  const p = place(course, firstSegmentId);
  if (!p) return `Ready when you are. Say go.`;
  const fits = planSegments === 1 ? "One part fits" : `${num(planSegments)} parts fit`;
  const cur = progress.cursor;
  const fresh = progress.segmentsCompleted.length === 0 && !cur;
  if (fresh) return `${course.title}. ${num(minutes)} minutes. Chapter ${num(p.chapter.number)}, ${p.chapter.shortTitle}. ${fits}. Say go.`;
  if (cur && cur.segmentId === firstSegmentId && cur.phase === "ask") {
    return `Back in chapter ${num(p.chapter.number)}. You have heard ${p.segment.title}, the questions are left. Say go.`;
  }
  if (cur && cur.segmentId === firstSegmentId && cur.blockIdx > 0) {
    return `Picking up inside ${p.segment.title}, where we stopped. Say go, or say start over.`;
  }
  return `Back in chapter ${num(p.chapter.number)}, ${p.chapter.shortTitle}. Section ${sectionNumber(p.section.number)}, part ${num(p.partIndex)} of ${num(p.partCount)}. ${fits}. Say go.`;
}

export function whereAmI(course: Course, progress: Progress, segmentId: string, phase: string): string {
  const p = place(course, segmentId);
  if (!p) return "I have lost my place. Say go to continue.";
  const pct = chapterPct(progress, p.chapter);
  const where = phase === "ask" ? "on the questions" : `part ${num(p.partIndex)} of ${num(p.partCount)}`;
  const next = nextAfter(course, segmentId);
  const nextLine = next && next.section.id !== p.section.id ? ` Next is ${sectionNumber(next.section.number)}, ${next.section.title}.` : "";
  const legs = legsRemaining(course, progress, p.chapter);
  return `Chapter ${num(p.chapter.number)}, ${p.chapter.shortTitle}. Section ${sectionNumber(p.section.number)}, ${where}. Chapter is ${pct} percent done, about ${num(legs)} more ${legs === 1 ? "commute" : "commutes"}.${nextLine}`;
}

export function nextAfter(course: Course, segmentId: string): Place | null {
  const segs = allSegments(course);
  const i = segs.findIndex((s) => s.id === segmentId);
  return i >= 0 && segs[i + 1] ? place(course, segs[i + 1].id) : null;
}

export function tripEnd(progress: Progress, course: Course, s: { segmentIds: string[]; correct: number; total: number; modulePct: number; explored?: string[] }): string {
  const parts = s.segmentIds.length === 1 ? "one part" : `${num(s.segmentIds.length)} parts`;
  const score = s.total ? `${num(s.correct)} of ${num(s.total)} right.` : "";
  const explored = s.explored?.length ? ` You explored ${s.explored.slice(0, 2).join(" and ")}.` : "";
  const next = place(course, progress.resume.segmentId);
  const nextLine = next ? ` Next leg picks up at ${sectionNumber(next.section.number)}, ${next.section.title}.` : "";
  return `Trip done. ${parts}, ${score} Chapter is ${s.modulePct} percent finished.${explored}${nextLine}`;
}

export function letters(options: string[]): string {
  const L = ["A", "B", "C", "D", "E"];
  return options.map((o, i) => `${L[i]}, ${o.replace(/\.$/, "")}.`).join(" ");
}

export function question(prompt: string, options?: string[]): string {
  return options?.length ? `${prompt} ${letters(options)}` : prompt;
}
