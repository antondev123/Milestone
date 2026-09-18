// Progress mutations. Every function writes the resume pointer immediately so a
// killed trip resumes where it stopped.
import {
  allSegments,
  chapterOf,
  parentId,
  type QuestionMeta,
  findSegment,
  type Course,
  type Mode,
  type Plan,
  type Progress,
  type TripSummary,
} from "@/types/lesson";
import { saveProgress } from "./store";

export function startTrip(progress: Progress, plan: Plan, minutes: number, mode: Mode): Progress {
  progress.activeTrip = {
    tripId: plan.tripId,
    startedAt: new Date().toISOString(),
    minutes,
    mode,
    segmentIds: plan.segmentIds,
    completedSegmentIds: [],
  };
  progress.resume = plan.startAt;
  saveProgress(progress);
  return progress;
}

export function recordCheckpoint(
  progress: Progress,
  q: QuestionMeta,
  answer: string,
  correct: boolean,
  feedback: string,
  mode: Mode,
): Progress {
  const questionId = q.id;
  const attempt = progress.checkpoints.filter((c) => c.questionId === questionId).length + 1;
  progress.checkpoints.push({ questionId, correct, attempt, mode, answer, feedback, at: new Date().toISOString() });
  const t = (progress.topics[q.topic] ??= { seen: 0, correct: 0 });
  if (attempt === 1) {
    t.seen += 1;
    if (correct) t.correct += 1;
  }
  const segId = parentId(questionId);
  // chapter-quiz questions ("<chapterId>/quiz/qN") do not move the resume pointer
  if (!segId.endsWith("/quiz")) progress.resume = { segmentId: segId, position: "checkpoint" };
  saveProgress(progress);
  return progress;
}

export function completeSegment(course: Course, progress: Progress, segmentId: string): Progress {
  if (!findSegment(course, segmentId)) throw new Error(`unknown segment ${segmentId}`);
  if (!progress.segmentsCompleted.includes(segmentId)) progress.segmentsCompleted.push(segmentId);
  if (progress.activeTrip && !progress.activeTrip.completedSegmentIds.includes(segmentId)) {
    progress.activeTrip.completedSegmentIds.push(segmentId);
  }
  const segs = allSegments(course);
  const idx = segs.findIndex((s) => s.id === segmentId);
  const next = segs[idx + 1];
  progress.resume = next ? { segmentId: next.id, position: "start" } : { segmentId, position: "checkpoint" };
  saveProgress(progress);
  return progress;
}

function daysBetween(a: string, b: string): number {
  const d = (x: string) => Math.floor(new Date(x).getTime() / 86_400_000);
  return d(b) - d(a);
}

export function endTrip(course: Course, progress: Progress): TripSummary {
  const active = progress.activeTrip;
  const now = new Date().toISOString();
  const tripId = active?.tripId ?? `trip-${Date.now().toString(36)}`;
  const startedAt = active?.startedAt ?? now;

  // streak
  if (progress.lastTripAt) {
    const gap = daysBetween(progress.lastTripAt, now);
    if (gap === 1) progress.streakDays += 1;
    else if (gap > 1) progress.streakDays = 1;
    else if (progress.streakDays === 0) progress.streakDays = 1;
  } else {
    progress.streakDays = 1;
  }
  progress.lastTripAt = now;

  const thisTrip = progress.checkpoints.filter((c) => c.at >= startedAt && c.attempt === 1);
  const mastered: string[] = [];
  const weak: string[] = [];
  for (const [topic, t] of Object.entries(progress.topics)) {
    if (t.seen >= 2 && t.correct / t.seen >= 0.75) mastered.push(topic);
    else if (t.seen >= 1 && t.correct / t.seen < 0.5) weak.push(topic);
  }
  // chapter-scoped: the chapter of the most recent completed segment (or the resume pointer)
  const anchorId = progress.segmentsCompleted.at(-1) ?? progress.resume.segmentId;
  const chapter = chapterOf(course, anchorId) ?? course.chapters[0];
  const moduleSegs = Math.max(1, chapter.segments.length);
  const doneInChapter = progress.segmentsCompleted.filter((id) => id.startsWith(chapter.id + "/")).length;
  const summary: TripSummary = {
    tripId,
    startedAt,
    endedAt: now,
    minutes: active?.minutes ?? 0,
    mode: active?.mode ?? "text",
    segmentIds: active?.completedSegmentIds ?? [],
    correct: thisTrip.filter((c) => c.correct).length,
    total: thisTrip.length,
    mastered,
    weak,
    modulePct: Math.round((doneInChapter / moduleSegs) * 100),
    streakDays: progress.streakDays,
  };
  progress.trips.push(summary);
  delete progress.activeTrip;
  saveProgress(progress);
  return summary;
}
