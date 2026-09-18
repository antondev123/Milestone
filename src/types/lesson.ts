// Source of truth for lesson + progress shapes. See docs/SCHEMA.md for intent.
// Everything downstream (ingest, planner, text mode, voice tools, summary) imports from here.

export type Mode = "voice" | "text";

// ---------- Lesson (produced offline by scripts/ingest.ts) ----------

export type QuestionType = "mcq" | "open";

export interface Question {
  id: string; // "<segmentId>/q1"
  prompt: string;
  type: QuestionType;
  options?: string[]; // mcq only, 3–4 entries
  answer: string; // mcq: exact option text; open: model answer
  rubric: string; // open: what a correct paraphrase must contain
  topic: string; // short tag, e.g. "compound-interest"
}

export interface Segment {
  id: string; // "<moduleId>/s1"
  title: string;
  durationSec: number; // 180–300
  script: string; // plain prose, read aloud verbatim
  keyPoints: string[]; // 2–4
  altExplanation: string;
  deeper: string;
  checkpoint: Question[]; // 1–3
}

export interface Module {
  id: string; // "<courseId>/m1"
  title: string;
  segments: Segment[];
}

export interface Course {
  id: string;
  title: string;
  description: string;
  estimatedMinutes: number;
  modules: Module[];
}

// ---------- Progress (read/write at runtime) ----------

export type ResumePosition = "start" | "checkpoint";

export interface ResumePointer {
  segmentId: string;
  position: ResumePosition;
}

export interface CheckpointResult {
  questionId: string;
  correct: boolean;
  attempt: number; // 1-based per question
  mode: Mode;
  answer: string;
  feedback: string;
  at: string; // ISO
}

export interface TopicStat {
  seen: number;
  correct: number;
}

export interface TripSummary {
  tripId: string;
  startedAt: string;
  endedAt: string;
  minutes: number;
  mode: Mode;
  segmentIds: string[];
  correct: number;
  total: number;
  mastered: string[];
  weak: string[];
  modulePct: number; // 0–100
  streakDays: number;
}

/** A trip in flight. Cleared when the trip ends and becomes a TripSummary. */
export interface ActiveTrip {
  tripId: string;
  startedAt: string;
  minutes: number;
  mode: Mode;
  segmentIds: string[]; // planned
  completedSegmentIds: string[]; // done so far this trip
}

export interface Progress {
  userId: string;
  courseId: string;
  segmentsCompleted: string[];
  checkpoints: CheckpointResult[];
  topics: Record<string, TopicStat>;
  resume: ResumePointer;
  streakDays: number;
  lastTripAt: string | null;
  trips: TripSummary[];
  activeTrip?: ActiveTrip;
}

// ---------- Session plan (ephemeral) ----------

export interface Plan {
  tripId: string;
  segmentIds: string[];
  estMinutes: number;
  startAt: ResumePointer;
}

// ---------- API payloads ----------

export interface SessionRequest {
  userId: string;
  courseId: string;
  minutes: number;
  mode: Mode;
}

export interface GradeRequest {
  questionId: string;
  answer: string;
  mode: Mode;
}

export interface GradeResponse {
  correct: boolean;
  feedback: string; // ≤ 20 words
}

// ---------- Helpers ----------

export const CHECKPOINT_OVERHEAD_SEC: Record<Mode, number> = { voice: 60, text: 30 };
export const INTRO_SEC = 30;
export const MAX_SEGMENTS_PER_TRIP = 6;
export const DEMO_USER_ID = "demo";

export function emptyProgress(userId: string, course: Course): Progress {
  return {
    userId,
    courseId: course.id,
    segmentsCompleted: [],
    checkpoints: [],
    topics: {},
    resume: { segmentId: course.modules[0].segments[0].id, position: "start" },
    streakDays: 0,
    lastTripAt: null,
    trips: [],
  };
}

export function allSegments(course: Course): Segment[] {
  return course.modules.flatMap((m) => m.segments);
}

export function findSegment(course: Course, id: string): Segment | undefined {
  return allSegments(course).find((s) => s.id === id);
}

export function findQuestion(course: Course, id: string): Question | undefined {
  return allSegments(course)
    .flatMap((s) => s.checkpoint)
    .find((q) => q.id === id);
}
