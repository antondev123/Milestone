// One set of engine actions shared by the direct API routes (text/voice UIs)
// and the ElevenLabs tool webhook route. Keep all business logic here.
import { DEMO_USER_ID, type Mode, type Plan, type Progress, type TripSummary, type GradeResponse } from "@/types/lesson";
import { DEFAULT_COURSE_ID, loadCourse, loadQuestionFull, loadSegmentFull } from "./course";
import { getProgress, resetProgress } from "./store";
import { planTrip } from "./planner";
import { gradeAnswer } from "./grader";
import { completeSegment, endTrip, recordCheckpoint, startTrip } from "./progress";

const userId = DEMO_USER_ID;
const courseId = DEFAULT_COURSE_ID;

export function actionProgress(): Progress {
  return getProgress(userId, courseId);
}

export function actionReset(): Progress {
  return resetProgress(userId, courseId);
}

export function actionStartSession(minutes: number, mode: Mode): Plan {
  const course = loadCourse(courseId);
  const progress = getProgress(userId, courseId);
  const plan = planTrip(course, progress, minutes, mode);
  startTrip(progress, plan, minutes, mode);
  return plan;
}

/** Segment content for the agent/UI. Position tells whether to skip the script and go to the checkpoint. */
export function actionGetSegment(segmentId?: string) {
  const progress = getProgress(userId, courseId);
  const id = segmentId ?? progress.resume.segmentId;
  const seg = loadSegmentFull(courseId, id);
  if (!seg) throw new Error(`unknown segment ${id}`);
  const trip = progress.activeTrip;
  const idx = trip ? trip.segmentIds.indexOf(id) : -1;
  const nextId = trip && idx >= 0 ? trip.segmentIds[idx + 1] ?? null : null;
  return {
    segment: seg,
    position: progress.resume.segmentId === id ? progress.resume.position : "start",
    indexInTrip: idx,
    tripLength: trip?.segmentIds.length ?? 0,
    nextSegmentId: nextId,
  };
}

export async function actionGrade(questionId: string, answer: string, mode: Mode): Promise<GradeResponse> {
  const q = loadQuestionFull(courseId, questionId);
  if (!q) throw new Error(`unknown question ${questionId}`);
  const result = await gradeAnswer(q, answer);
  recordCheckpoint(getProgress(userId, courseId), q, answer, result.correct, result.feedback, mode);
  return result;
}

export function actionCompleteSegment(segmentId: string): { nextSegmentId: string | null; tripDone: boolean } {
  const course = loadCourse(courseId);
  const progress = completeSegment(course, getProgress(userId, courseId), segmentId);
  const trip = progress.activeTrip;
  if (!trip) return { nextSegmentId: null, tripDone: true };
  const idx = trip.segmentIds.indexOf(segmentId);
  const next = trip.segmentIds[idx + 1] ?? null;
  return { nextSegmentId: next, tripDone: next === null };
}

export function actionEndTrip(): TripSummary {
  const course = loadCourse(courseId);
  return endTrip(course, getProgress(userId, courseId));
}
