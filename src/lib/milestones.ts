// Milestones: named stops earned from logged data, awarded once. Checked mid-trip at the moments
// that can earn one (part done, quiz done, first question) so they can be spoken on the road, and
// again at trip end (streaks). Every rule needs this trip to have caused it, so seeded progress
// never earns one.
import { findChapter, type CheckpointResult, type Course, type Detour, type Mode, type Progress, type QuizResult } from "@/types/lesson";

export interface MilestoneContext {
  course: Course;
  progress: Progress; // after the trip: streak updated, segments recorded
  mode: Mode;
  completedSegmentIds: string[]; // this trip
  checks: CheckpointResult[]; // this trip, first attempts only
  detours: Detour[]; // this trip
  quizzes: QuizResult[]; // this trip
}

const QUIZ_PASS = 0.7;

function did(ctx: MilestoneContext): boolean {
  return ctx.completedSegmentIds.length > 0 || ctx.checks.length > 0 || ctx.quizzes.length > 0;
}

/** Fixed milestones. Chapter and quiz ones are per chapter, see `awardMilestones`. */
const FIXED: { id: string; label: string; test: (ctx: MilestoneContext) => boolean }[] = [
  { id: "first-trip", label: "First trip", test: did },
  { id: "first-hands-free", label: "First hands-free trip", test: (ctx) => ctx.mode === "voice" && did(ctx) },
  { id: "first-question", label: "First question from the road", test: (ctx) => ctx.detours.length > 0 },
  { id: "clean-run", label: "Clean run: every check right first time", test: (ctx) => ctx.checks.length >= 3 && ctx.checks.every((c) => c.correct) },
  { id: "streak-3", label: "3-day streak", test: (ctx) => ctx.progress.streakDays >= 3 },
  { id: "streak-5", label: "5-day streak", test: (ctx) => ctx.progress.streakDays >= 5 },
];

export function milestoneLabel(id: string): string {
  const fixed = FIXED.find((m) => m.id === id);
  if (fixed) return fixed.label;
  const chapter = /^chapter-(\d+)$/.exec(id);
  if (chapter) return `Chapter ${chapter[1]} finished`;
  const quiz = /^quiz-(\d+)$/.exec(id);
  if (quiz) return `Chapter ${quiz[1]} quiz passed`;
  return id;
}

/** Ids earned by this trip that no earlier trip already earned. */
export function awardMilestones(ctx: MilestoneContext): string[] {
  const earlier = new Set(ctx.progress.trips.flatMap((t) => t.milestones ?? []));
  const ids = FIXED.filter((m) => m.test(ctx)).map((m) => m.id);

  // a chapter counts only if this trip finished one of its legs and now every leg is done
  const done = new Set(ctx.progress.segmentsCompleted);
  for (const ch of ctx.course.chapters) {
    if (ch.segments.length === 0) continue;
    const touched = ctx.completedSegmentIds.some((id) => id.startsWith(ch.id + "/"));
    if (touched && ch.segments.every((s) => done.has(s.id))) ids.push(`chapter-${ch.number}`);
  }
  for (const q of ctx.quizzes) {
    const ch = findChapter(ctx.course, q.chapterId);
    if (ch && q.total > 0 && q.correct / q.total >= QUIZ_PASS) ids.push(`quiz-${ch.number}`);
  }
  return [...new Set(ids)].filter((id) => !earlier.has(id));
}

/**
 * Mid-trip check: milestones the running trip has earned since the last check. Records them on
 * `activeTrip.milestones` so each is spoken once; `endTrip` merges that list into the summary.
 * Streak rules only resolve at trip end (the streak is updated there), so they never fire here.
 */
export function earnNow(course: Course, progress: Progress): string[] {
  const trip = progress.activeTrip;
  if (!trip) return [];
  const since = (at: string) => at >= trip.startedAt;
  const ids = awardMilestones({
    course,
    progress,
    mode: trip.mode,
    completedSegmentIds: trip.completedSegmentIds,
    checks: progress.checkpoints.filter((c) => since(c.at) && c.attempt === 1),
    detours: (progress.detours ?? []).filter((d) => since(d.at)),
    quizzes: (progress.quizResults ?? []).filter((q) => since(q.at)),
  });
  trip.milestones ??= [];
  const fresh = ids.filter((id) => !trip.milestones!.includes(id) && !id.startsWith("streak-"));
  trip.milestones.push(...fresh);
  return fresh;
}
