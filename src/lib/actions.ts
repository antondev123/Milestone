// One set of engine actions shared by the direct API routes (text/voice UIs)
// and the ElevenLabs tool route. Keep all business logic here.
import { DEMO_USER_ID, allSegments, type Mode, type Plan, type Progress, type TripSummary, type GradeResponse, type ToolReply } from "@/types/lesson";
import { DEFAULT_COURSE_ID, loadCourse, loadQuestionFull, loadSegmentFull } from "./course";
import { getProgress, resetProgress, saveProgress } from "./store";
import { planTrip } from "./planner";
import { gradeAnswer } from "./grader";
import { completeSegment, endTrip, recordCheckpoint, startTrip } from "./progress";
import * as cursor from "./cursor";
import * as say from "./say";
import { resolveTarget } from "./navigate";
import { askBook } from "./ask";
import { quickIntent } from "./intent";
import { carrySession, closeSession, openSession } from "./log/log";
import { demoArmed, demoPlan } from "./demo";

const userId = DEMO_USER_ID;
const courseId = DEFAULT_COURSE_ID;

export function actionProgress(): Progress {
  return getProgress(userId, courseId);
}

export function actionReset(): Progress {
  return resetProgress(userId, courseId);
}

/**
 * Start an open-ended trip at the cursor. It runs until the learner ends it (or the course runs out).
 * Listen with the stage demo armed (`npm run demo:stage`) gets the fixed demo trip instead.
 */
export function actionStartSession(mode: Mode): Plan {
  const course = loadCourse(courseId);
  const progress = getProgress(userId, courseId);
  if (mode === "voice" && demoArmed(progress)) return startDemo(course, progress, mode);
  const plan = planTrip(course, progress, mode);
  // the cursor is the source of truth for position; the plan starts where it points
  const c = cursor.ensureCursor(course, progress);
  if (c.segmentId !== plan.startAt.segmentId || c.phase === "done") cursor.moveTo(c, plan.startAt.segmentId, plan.startAt.position === "checkpoint" ? "ask" : "read");
  delete c.lastReply;
  delete c.detour;
  delete c.quiz;
  plan.greeting = say.greeting(course, progress, plan.startAt.segmentId);
  startTrip(progress, plan, mode);
  loadSegmentFull(courseId, plan.startAt.segmentId); // warm the first leg
  openSession(plan, mode);
  return plan;
}

/**
 * Stage demo: the fixed two-leg trip that ends itself (cursor.serveNext honours a non-empty plan).
 * Always starts from the top of the first leg, so a reload before the end gives the identical run;
 * an abandoned trip is dropped without a summary. The flag is consumed when this trip ends.
 */
function startDemo(course: ReturnType<typeof loadCourse>, progress: Progress, mode: Mode): Plan {
  delete progress.activeTrip;
  const plan = demoPlan(progress);
  const c = cursor.ensureCursor(course, progress);
  cursor.moveTo(c, plan.startAt.segmentId);
  delete c.lastReply;
  delete c.detour;
  delete c.quiz;
  plan.greeting = say.greeting(course, progress, plan.startAt.segmentId);
  progress.demo!.tripId = plan.tripId;
  startTrip(progress, plan, mode);
  for (const id of plan.segmentIds) loadSegmentFull(courseId, id);
  openSession(plan, mode);
  return plan;
}

/**
 * Mode switch mid-trip: keep the running trip (same id and clock) and just change mode,
 * so the other screen does not start a second trip. Null when no trip is running.
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
  const plan: Plan = {
    tripId: trip.tripId,
    segmentIds: trip.segmentIds,
    startAt: progress.resume,
    greeting: say.carryOn(),
  };
  carrySession(plan, mode);
  return plan;
}

// ---------- legacy segment API (text mode PR A, old agent tools) ----------

/** Segment content for the agent/UI. Position tells whether to skip the script and go to the checkpoint. */
export function actionGetSegment(segmentId?: string) {
  const progress = getProgress(userId, courseId);
  const id = segmentId ?? progress.resume.segmentId;
  const seg = loadSegmentFull(courseId, id);
  if (!seg) throw new Error(`unknown segment ${id}`);
  // trips are open-ended: "next" is the next segment in course order
  const segs = allSegments(loadCourse(courseId));
  const idx = segs.findIndex((s) => s.id === id);
  return {
    segment: seg,
    position: progress.resume.segmentId === id ? progress.resume.position : "start",
    indexInTrip: progress.activeTrip?.completedSegmentIds.length ?? -1,
    tripLength: 0,
    nextSegmentId: segs[idx + 1]?.id ?? null,
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
  if (!progress.activeTrip) return { nextSegmentId: null, tripDone: true };
  const segs = allSegments(course);
  const next = segs[segs.findIndex((s) => s.id === segmentId) + 1]?.id ?? null;
  return { nextSegmentId: next, tripDone: next === null };
}

export function actionEndTrip(): TripSummary {
  const course = loadCourse(courseId);
  const summary = endTrip(course, getProgress(userId, courseId));
  closeSession(summary);
  return summary;
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

/**
 * Whatever the learner said while a question was open. Only a real attempt is graded: unmistakable
 * commands are dispatched before any model (`quickIntent`), the grader classifies the rest, and a
 * question / command / give-up is routed to the tool it meant. The open question survives all of it.
 */
export async function actionAnswer(text: string, mode: Mode): Promise<ToolReply> {
  const course = loadCourse(courseId);
  const progress = getProgress(userId, courseId);
  if (!cursor.questionOpen(course, progress)) return cursor.answer(course, progress, text, mode);
  const study = mode === "study"; // the study page owns navigation; only repeat and give-up apply there
  const quick = quickIntent(text);
  switch (quick) {
    case "repeat":
      return { ...cursor.explain(course, progress, "again"), intent: "command" };
    case "giveup":
      return cursor.answer(course, progress, text, mode, { giveup: true });
    case "skip":
      if (!study) return { ...cursor.skip(course, progress), intent: "command" };
      break;
    case "where":
      if (!study) return { ...cursor.whereAmI(course, progress), intent: "command" };
      break;
    case "hold":
      // not committed: "repeat" must still repeat the question, and next re-asks it
      if (!study) return { kind: "say", say: "Holding. Say continue when you are ready.", loc: "", more: false, intent: "command" };
      break;
    case "goto": {
      if (study) break;
      const r = actionGoto(text);
      if (r.say !== NOT_FOUND) return { ...r, intent: "command" };
      break; // could not resolve it: let the grader decide what it was
    }
  }
  const r = await cursor.answer(course, progress, text, mode);
  if (r.intent === "question") {
    const a = await actionAsk(text, { detour: !study });
    return { ...a, intent: "question" };
  }
  if (r.intent === "command") {
    if (study) return cursor.commitReply(course, progress, { kind: "say", say: "The question is still open. Type your answer, or ask me about the passage.", loc: "", more: false, intent: "command" });
    const g = actionGoto(text);
    if (g.say === NOT_FOUND) return cursor.commitReply(course, progress, { kind: "say", say: "I did not catch that. The question is still open. Say repeat to hear it again.", loc: "", more: false, intent: "command" });
    return { ...g, intent: "command" };
  }
  return r;
}

const NOT_FOUND = "I could not find that in the course. Try a chapter number, or ask me the question instead.";

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
      return cursor.commitReply(course, progress, { kind: "say", say: NOT_FOUND, loc: "", more: false });
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
  // "First question from the road" is earned here, so it is spoken before the continue tail
  const reply = cursor.withMilestones(course, progress, { kind: "say", say: sayText, loc: "", more: false, offer });
  if (cur && !cur.detour!.offered && !offer) {
    cur.detour!.offered = true;
    reply.say += cursor.questionOpen(course, progress) ? " Say continue to get back to the question." : " Say continue when you are ready.";
  }
  return cursor.commitReply(course, progress, reply);
}

export function actionEndTripSpoken(): ToolReply & { summary: TripSummary } {
  const course = loadCourse(courseId);
  const progress = getProgress(userId, courseId);
  const summary = endTrip(course, progress);
  closeSession(summary);
  delete progress.cursor?.lastReply;
  return { kind: "end", say: say.tripEnd(progress, course, summary), loc: "end", more: false, tripId: summary.tripId, summary };
}
