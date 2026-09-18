// Server-side view models for the Carry screens. Every number here comes from the
// course file or the logged progress; nothing is mocked.
import { allSegments, type Course, type Mode, type Progress, type Segment, type TripSummary } from "@/types/lesson";
import { TRIP_GAP_MS } from "./progress";

export const LEARNER_NAME = "Thandi";
const TZ = "Africa/Johannesburg";

export interface LegRef {
  index: number; // 0-based
  number: number; // 1-based, what the UI says
  total: number;
  segment: Segment;
}

export function legOf(course: Course, segmentId: string): LegRef {
  const segs = allSegments(course);
  const index = Math.max(0, segs.findIndex((s) => s.id === segmentId));
  return { index, number: index + 1, total: segs.length, segment: segs[index] };
}

export function currentLeg(course: Course, progress: Progress): LegRef {
  return legOf(course, progress.resume.segmentId);
}

export function courseFinished(course: Course, progress: Progress): boolean {
  return allSegments(course).every((s) => progress.segmentsCompleted.includes(s.id));
}

export function legsDone(course: Course, progress: Progress): number {
  return allSegments(course).filter((s) => progress.segmentsCompleted.includes(s.id)).length;
}

export function sourceLine(course: Course, leg: LegRef): string {
  return `From ${course.source ?? course.title}, section ${leg.segment.sourceSection ?? leg.number}`;
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

// ---------- trips ----------

export interface TripRow {
  id: string;
  when: string; // "Wednesday morning"
  what: string; // "Leg 3, read then listened"
  minutes: number;
  live: boolean;
}

function minutesBetween(a: string, b: string): number {
  return Math.max(1, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60_000));
}

function listLegs(nums: number[]): string {
  const n = [...new Set(nums)].sort((a, b) => a - b);
  if (n.length === 0) return "";
  if (n.length === 1) return `Leg ${n[0]}`;
  if (n.length === 2) return `Legs ${n[0]} and ${n[1]}`;
  const contiguous = n.every((x, i) => i === 0 || x === n[i - 1] + 1);
  return contiguous ? `Legs ${n[0]} to ${n.at(-1)}` : `Legs ${n.slice(0, -1).join(", ")} and ${n.at(-1)}`;
}

const VERB: Record<Mode, string> = { text: "read", voice: "listened" };

function describe(course: Course, segmentIds: string[], modes: Mode[]): string {
  const legs = listLegs(segmentIds.map((id) => legOf(course, id).number));
  const how = [...new Set(modes)].map((m) => VERB[m]).join(" then "); // first-use order
  return [legs, how].filter(Boolean).join(", ") || "Started a leg";
}

function tripRow(course: Course, t: TripSummary): TripRow {
  const { weekday, hour } = zoned(t.startedAt);
  return {
    id: t.tripId,
    when: `${weekday} ${partOfDay(hour)}`,
    what: describe(course, t.touchedSegmentIds?.length ? t.touchedSegmentIds : t.segmentIds, t.modes ?? [t.mode]),
    minutes: minutesBetween(t.startedAt, t.endedAt),
    live: false,
  };
}

/** Closed trips plus the one in flight, newest first. */
export function tripRows(course: Course, progress: Progress): TripRow[] {
  const rows = progress.trips.map((t) => tripRow(course, t));
  const a = progress.activeTrip;
  if (a) {
    const last = a.lastActiveAt ?? a.startedAt;
    const stale = Date.now() - new Date(last).getTime() > TRIP_GAP_MS;
    const { weekday, hour } = zoned(a.startedAt);
    rows.push({
      id: a.tripId,
      when: `${weekday} ${partOfDay(hour)}`,
      what: describe(course, a.touchedSegmentIds ?? a.segmentIds, a.modes ?? [a.mode]),
      minutes: minutesBetween(a.startedAt, last),
      live: !stale,
    });
  }
  return rows.reverse();
}

// ---------- route line ----------

export interface RouteState {
  total: number;
  done: boolean[];
  current: number | null; // 0-based index of the gold stop
  label: string | null;
}

export function routeState(course: Course, progress: Progress, labelFor: (n: number) => string): RouteState {
  const segs = allSegments(course);
  const done = segs.map((s) => progress.segmentsCompleted.includes(s.id));
  const finished = done.every(Boolean);
  const current = finished ? null : currentLeg(course, progress).index;
  return { total: segs.length, done, current, label: current === null ? null : labelFor(current + 1) };
}
