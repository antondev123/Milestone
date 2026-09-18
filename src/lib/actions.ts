// One set of engine actions shared by the direct API routes (text/voice UIs)
// and the ElevenLabs tool route. Keep all business logic here.
import { DEMO_USER_ID, type Mode, type Plan, type Progress, type TripSummary, type GradeResponse, type ToolReply } from "@/types/lesson";
import { DEFAULT_COURSE_ID, loadCourse, loadQuestionFull, loadSegmentFull } from "./course";
import { getProgress, resetProgress, saveProgress } from "./store";
import { planTrip } from "./planner";
import { gradeAnswer } from "./grader";
import { completeSegment, endTrip, recordCheckpoint, startTrip } from "./progress";
import * as cursor from "./cursor";
import * as say from "./say";
import { resolveTarget } from "./navigate";
import { askBook } from "./ask";

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
  // the cursor is the source of truth for position; the plan starts where it points
  const c = cursor.ensureCursor(course, progress);
  if (c.segmentId !== plan.startAt.segmentId || c.phase === "done") cursor.moveTo(c, plan.startAt.segmentId, plan.startAt.position === "checkpoint" ? "ask" : "read");
  delete c.lastReply;
  delete c.detour;
  delete c.quiz;
  plan.greeting = say.greeting(course, progress, minutes, plan.segmentIds.length, plan.segmentIds[0]);
  startTrip(progress, plan, minutes, mode);
  // warm the section cache for this trip
  for (const id of plan.segmentIds) loadSegmentFull(courseId, id);
  return plan;
}

/**
 * Mode switch mid-trip: keep the running trip (same id, plan and clock) and just change mode,
 * so the other screen does not ask "how long is this trip?" again. Null when no trip is running.
 */
export function actionCarryTrip(mode: Mode): Plan | null {
  const course = loadCourse(courseId);
  const progress = getProgress(userId, courseId);
  const trip = progress.activeTrip;
  if (!trip) return null;
  const c = cursor.ensureCursor(course, progress);
  delete c.lastReply;
  trip.mode = mode;
  saveProgress(progress);
  const elapsed = (Date.now() - new Date(trip.startedAt).getTime()) / 60_000;
  const left = Math.max(1, Math.round(trip.minutes - elapsed));
  return {
    tripId: trip.tripId,
    segmentIds: trip.segmentIds,
    estMinutes: left,
    startAt: progress.resume,
    greeting: say.carryOn(left),
  };
}

// ---------- legacy segment API (text mode PR A, old agent tools) ----------

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
  const c = cursor.ensureCursor(course, progress);
  if (c.segmentId === segmentId) c.phase = "done";
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

// ---------- cursor tools (voice agent + text mode) ----------

export function actionNext(opts: { peek?: boolean } = {}): ToolReply {
  const course = loadCourse(courseId);
  return cursor.serveNext(course, getProgress(userId, courseId), opts);
}

export function actionExplain(how: string): ToolReply {
  const course = loadCourse(courseId);
  const h = (["again", "simpler", "deeper", "example"] as const).find((x) => x === how) ?? "simpler";
  return cursor.explain(course, getProgress(userId, courseId), h);
}

export function actionMark(segmentId: string, blockIdx: number): ToolReply {
  const course = loadCourse(courseId);
  return cursor.mark(course, getProgress(userId, courseId), segmentId, blockIdx);
}

export function actionCheck(segmentId: string): ToolReply {
  const course = loadCourse(courseId);
  return cursor.startCheck(course, getProgress(userId, courseId), segmentId);
}

export async function actionAnswer(text: string, mode: Mode): Promise<ToolReply> {
  const course = loadCourse(courseId);
  return cursor.answer(course, getProgress(userId, courseId), text, mode);
}

export function actionInterrupted(): { ok: true } {
  cursor.interrupted(loadCourse(courseId), getProgress(userId, courseId));
  return { ok: true };
}

export function actionWhereAmI(): ToolReply {
  return cursor.whereAmI(loadCourse(courseId), getProgress(userId, courseId));
}

export function actionGoto(target: string): ToolReply {
  const course = loadCourse(courseId);
  const progress = getProgress(userId, courseId);
  const c = cursor.ensureCursor(course, progress);
  const t = resolveTarget(course, c.segmentId, target);
  switch (t.kind) {
    case "segment":
      return cursor.gotoSegment(course, progress, t.segmentId, t.via);
    case "quiz":
      return cursor.startQuiz(course, progress, t.chapterId);
    case "back":
      return cursor.gotoBack(course, progress);
    case "skip":
      return cursor.skip(course, progress);
    case "ambiguous": {
      const [a, b] = t.candidates;
      return cursor.commitReply(course, progress, {
        kind: "say",
        say: `I can take you to ${say.sectionNumber(a.number)}, ${a.title}, or ${say.sectionNumber(b.number)}, ${b.title}. Which one?`,
        loc: "",
        more: false,
      });
    }
    default:
      return cursor.commitReply(course, progress, { kind: "say", say: "I could not find that in the course. Try a chapter number, or ask me the question instead.", loc: "", more: false });
  }
}

const recentAsks = new Map<string, { q: string; a: string }[]>();

/**
 * context: a sentence the learner tapped (study mode) — prepended for the model, not stored.
 * detour=false (study mode): no spoken detour bookkeeping and no "Say continue" tail.
 */
export async function actionAsk(question: string, opts: { context?: string; detour?: boolean } = {}): Promise<ToolReply> {
  const course = loadCourse(courseId);
  const progress = getProgress(userId, courseId);
  const { cursor: c, segment, place } = cursor.contextFor(course, progress);
  const key = `${userId}:${c.segmentId}`;
  const recent = recentAsks.get(key) ?? [];
  let result;
  try {
    const asked = opts.context ? `About this sentence from the passage: "${opts.context}"\n\n${question}` : question;
    result = await askBook(course, segment, place, asked, recent);
  } catch (e) {
    console.error(`[ask] failed: ${(e as Error).message}`);
    return cursor.commitReply(course, progress, { kind: "say", say: "I could not check that one right now. Say go to carry on.", loc: "", more: false });
  }
  recent.push({ q: question, a: result.answer });
  recentAsks.set(key, recent.slice(-3));
  const cur = cursor.beginDetour(course, progress, question, result.topic);
  let sayText = result.answer;
  let offer: ToolReply["offer"];
  if (result.jumpTo && result.jumpTo !== place?.section.id) {
    const sec = course.chapters.flatMap((ch) => ch.sections).find((s) => s.id === result.jumpTo);
    if (sec?.segments.length) {
      offer = { sectionId: sec.id, say: `That is covered in ${say.sectionNumber(sec.number)}, ${sec.title}. Want to go there?` };
      sayText += ` ${offer.say}`;
    }
  }
  if (cur && !cur.detour!.offered && !offer) {
    cur.detour!.offered = true;
    sayText += " Say continue when you are ready.";
  }
  return cursor.commitReply(course, progress, { kind: "say", say: sayText, loc: "", more: false, offer });
}

export function actionEndTripSpoken(): ToolReply & { summary: TripSummary } {
  const course = loadCourse(courseId);
  const progress = getProgress(userId, courseId);
  const summary = endTrip(course, progress);
  delete progress.cursor?.lastReply;
  return { kind: "end", say: say.tripEnd(progress, course, summary), loc: "end", more: false, tripId: summary.tripId, summary };
}
