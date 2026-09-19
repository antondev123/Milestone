// Server-side view models for the Carry screens (Resume, Progress) and the leg labels the
// text and voice pages show. Position comes from the cursor engine; every number comes from
// the course manifest or logged trips. Nothing is mocked.
import { chapterOf, type Chapter, type Course, type Mode, type Progress, type TripSummary } from "@/types/lesson";
import { blocks, WORDS_PER_MIN } from "./chunk";
import { loadSegmentFull } from "./course";
import { milestoneLabel } from "./milestones";

export const LEARNER_NAME = "Thandi";
const TZ = "Africa/Johannesburg";

/** Where the learner is: the cursor when there is one, else the resume mirror. */
export function hereId(progress: Progress): string {
  return progress.cursor?.segmentId ?? progress.resume.segmentId;
}

// ---------- legs: a leg is a teachable section, its parts are the ~2-minute segments ----------
// The route line has one stop per leg (docs/DESIGN.md §3), so chapter 2 is 6 stops, not 31.

export interface Leg {
  n: number; // leg number: 1-based among the chapter's teachable sections (same as sectionIdx)
  of: number; // legs in the chapter
  chapter: number;
  section: string; // "1.3"
  // For the Listen dial: Topic / Section words and a coarse ring, no lesson text on screen.
  chapterTitle: string;
  sectionTitle: string;
  sectionIdx: number; // 1-based among the chapter's teachable sections
  sectionCount: number;
  partIndex: number; // 1-based within the section
  partCount: number;
}

export type LegIndex = Record<string, Leg>;

/** A chapter's teachable sections: the legs on the route line. */
export function chapterLegs(chapter: Chapter) {
  return chapter.sections.filter((s) => s.segments.length > 0);
}

/** Every teachable part in the course → its leg (section) and part numbers. Small; safe to send to the client. */
export function legIndex(course: Course): LegIndex {
  const out: LegIndex = {};
  for (const ch of course.chapters) {
    const teachable = chapterLegs(ch);
    teachable.forEach((s, si) =>
      s.segments.forEach((g, gi) => {
        out[g.id] = {
          n: si + 1,
          of: teachable.length,
          chapter: ch.number,
          section: s.number,
          chapterTitle: ch.shortTitle || ch.title,
          sectionTitle: s.title,
          sectionIdx: si + 1,
          sectionCount: teachable.length,
          partIndex: gi + 1,
          partCount: s.segments.length,
        };
      }),
    );
  }
  return out;
}

/** "Principles of Management by OpenStax" from the license attribution, for "From …, section 1.3". */
export function sourceTitle(course: Course): string {
  return course.license?.attribution.split(/\.\s/)[0].split(",")[0] ?? course.title;
}

export function courseFinished(course: Course, progress: Progress): boolean {
  const done = new Set(progress.segmentsCompleted);
  const teachable = course.chapters.flatMap((c) => c.segments);
  return teachable.length > 0 && teachable.every((s) => done.has(s.id));
}

export function currentChapter(course: Course, progress: Progress): Chapter {
  return chapterOf(course, hereId(progress)) ?? course.chapters.find((c) => c.segments.length) ?? course.chapters[0];
}

/** The last mode used, for "Your progress carried over from reading". */
export function lastMode(progress: Progress): Mode | null {
  return progress.activeTrip?.mode ?? progress.trips.at(-1)?.mode ?? null;
}

// ---------- route line ----------

export interface RouteState {
  total: number; // legs (teachable sections) in the chapter
  done: boolean[]; // a leg is done when every part of it is
  current: number | null; // 0-based index of the gold stop
  fraction: number; // parts of the current leg done, 0–1: the arc on the gold stop
  label: string | null;
}

export function routeState(chapter: Chapter, progress: Progress, labelFor: (n: number) => string): RouteState {
  const legs = chapterLegs(chapter);
  const completed = new Set(progress.segmentsCompleted);
  const done = legs.map((s) => s.segments.every((g) => completed.has(g.id)));
  const id = hereId(progress);
  const here = legs.findIndex((s) => s.segments.some((g) => g.id === id));
  const current = done.every(Boolean) ? null : here >= 0 && !done[here] ? here : done.findIndex((d) => !d);
  const cur = current === null ? null : legs[current];
  const fraction = cur ? cur.segments.filter((g) => completed.has(g.id)).length / cur.segments.length : 0;
  return { total: legs.length, done, current, fraction, label: current === null ? null : labelFor(current + 1) };
}

// ---------- resume card ----------

function words(s: string): string[] {
  return s.split(/\s+/).filter(Boolean);
}

export interface ResumeCard {
  context: string;
  fragment: string; // already carries its "…"
  footer: string;
}

function timeLeft(wordsLeft: number): string {
  const sec = (wordsLeft / WORDS_PER_MIN) * 60;
  if (sec < 60) return "Less than a minute left in this part";
  const m = Math.ceil(sec / 60);
  return `About ${m} minute${m === 1 ? "" : "s"} left in this part`;
}

/**
 * The card's cut-off comes from the cursor's block: the engine reads ~150-word blocks, so the
 * place is exact to the block the learner last heard in full (a barged-in block counts as unheard).
 */
export function resumeCard(course: Course, progress: Progress, leg: Leg | undefined): ResumeCard | null {
  const seg = loadSegmentFull(course.id, hereId(progress));
  if (!seg) return null;
  // "leg 4, part 2" when the section has several parts, else just "leg 4"
  const legN = leg ? `leg ${leg.n}${leg.partCount > 1 ? `, part ${leg.partIndex}` : ""}` : "leg 1";
  const bl = blocks(seg.script);
  const c = progress.cursor;
  const phase = c?.phase ?? (progress.resume.position === "checkpoint" ? "ask" : "read");
  if (phase === "ask" || phase === "done") {
    return {
      context: phase === "ask" ? `You finished reading ${legN} on your last trip` : `You finished ${legN} on your last trip`,
      fragment: `…${words(seg.script).slice(-14).join(" ")}`,
      footer: phase === "ask" ? "The check for this part is next" : "The next part is up",
    };
  }
  const stopAt = c ? (c.served && c.heard ? c.blockIdx + 1 : c.blockIdx) : 0;
  if (stopAt <= 0) {
    return {
      context: progress.segmentsCompleted.length ? `${legN[0].toUpperCase()}${legN.slice(1)} starts with` : `Your first leg starts with`,
      fragment: `${words(seg.script).slice(0, 14).join(" ").replace(/[,;:]+$/, "")}…`,
      footer: timeLeft(words(seg.script).length),
    };
  }
  const heard = bl.slice(0, stopAt).join(" ");
  return {
    context: "Your last trip stopped here",
    fragment: `…${words(heard).slice(-14).join(" ")}`,
    footer: timeLeft(words(bl.slice(stopAt).join(" ")).length),
  };
}

// ---------- time ----------

function zoned(iso: string) {
  const parts = new Intl.DateTimeFormat("en-ZA", { timeZone: TZ, weekday: "long", hour: "numeric", hourCycle: "h23" }).formatToParts(new Date(iso));
  return {
    weekday: parts.find((p) => p.type === "weekday")?.value ?? "",
    hour: Number(parts.find((p) => p.type === "hour")?.value ?? 0),
  };
}

function partOfDay(hour: number): string {
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

export function greeting(now = new Date().toISOString()): string {
  const { hour } = zoned(now);
  const word = hour < 12 ? "Morning" : hour < 17 ? "Afternoon" : "Evening";
  return `${word}, ${LEARNER_NAME}`;
}

// ---------- trips (ended trips only: an open trip has no end time to count) ----------

export interface TripRow {
  id: string;
  when: string; // "Wednesday morning"
  what: string; // "Chapter 1, leg 3, listened"
  minutes: number;
}

export function tripMinutes(t: TripSummary): number {
  return Math.max(1, Math.round((new Date(t.endedAt).getTime() - new Date(t.startedAt).getTime()) / 60_000));
}

function listLegs(nums: number[]): string {
  const n = [...new Set(nums)].sort((a, b) => a - b);
  if (n.length === 1) return `leg ${n[0]}`;
  if (n.length === 2) return `legs ${n[0]} and ${n[1]}`;
  const contiguous = n.every((x, i) => i === 0 || x === n[i - 1] + 1);
  return contiguous ? `legs ${n[0]} to ${n.at(-1)}` : `legs ${n.slice(0, -1).join(", ")} and ${n.at(-1)}`;
}

const modeVerb = (m: Mode) => (m === "voice" ? "listened" : m === "study" ? "studied" : "read");

export function tripRows(course: Course, progress: Progress): TripRow[] {
  const legs = legIndex(course);
  return progress.trips
    .map((t) => {
      const { weekday, hour } = zoned(t.startedAt);
      const finished = t.segmentIds.map((id) => legs[id]).filter(Boolean);
      const chapters = [...new Set(finished.map((l) => l.chapter))];
      const what =
        finished.length === 0
          ? "No part finished"
          : chapters.length === 1
            ? `Chapter ${chapters[0]}, ${listLegs(finished.map((l) => l.n))}`
            : `${finished.length} parts across chapters ${chapters.join(" and ")}`;
      return { id: t.tripId, when: `${weekday} ${partOfDay(hour)}`, what: `${what}, ${modeVerb(t.mode)}`, minutes: tripMinutes(t) };
    })
    .reverse();
}

// ---------- milestones (earned at trip end, see src/lib/milestones.ts) ----------

export interface MilestoneRow {
  id: string;
  label: string;
  when: string; // "Wednesday morning", the trip that earned it
}

/** Newest first, like the trip list. */
export function milestoneRows(progress: Progress): MilestoneRow[] {
  return progress.trips
    .flatMap((t) => {
      const { weekday, hour } = zoned(t.endedAt);
      return (t.milestones ?? []).map((id) => ({ id, label: milestoneLabel(id), when: `${weekday} ${partOfDay(hour)}` }));
    })
    .reverse();
}
