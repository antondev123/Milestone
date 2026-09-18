// Source of truth for lesson + progress shapes. See docs/SCHEMA.md for intent.
// Everything downstream (parse, ingest, planner, text mode, voice tools, summary) imports from here.

export type Mode = "voice" | "text";

// ---------- Lesson ----------
// Two layers: *Meta shapes live in data/courses/<id>/course.json (the manifest, always in memory);
// full shapes live in data/courses/<id>/sections/*.json and are loaded lazily by id.

export type QuestionType = "mcq" | "open";

export interface QuestionMeta {
  id: string; // "<segmentId>/q1"
  type: QuestionType;
  topic: string; // short tag, e.g. "mintzberg-roles"
}

export interface Question extends QuestionMeta {
  prompt: string;
  options?: string[]; // mcq only, 3–4 entries
  answer: string; // mcq: exact option text; open: model answer
  rubric: string; // open: what a correct paraphrase must contain
  source?: "book" | "generated"; // "book" = the textbook's own Concept Check / review question
}

export interface SegmentMeta {
  id: string; // "<sectionId>/g1"
  title: string;
  durationSec: number; // 150–360
  sectionId: string; // "<chapterId>/s2"
  checkpoint: QuestionMeta[]; // 1–3
}

export interface Segment extends SegmentMeta {
  script: string; // plain prose, read aloud verbatim
  keyPoints: string[]; // 2–4
  altExplanation: string;
  deeper: string;
  example?: string; // one concrete worked example, for "give me an example"
  checkpoint: Question[];
}

/** One ingested section: data/courses/<id>/sections/cNN-sMM.json */
export interface SectionLesson {
  id: string;
  title: string;
  sourceHash: string; // sha1 of the source markdown this was generated from
  model: string;
  segments: Segment[];
}

export interface KeyTerm {
  term: string;
  definition: string;
}

export type SectionKind = "content" | "intro" | "summary";

export interface SectionMeta {
  id: string; // "<courseId>/c1/s2"
  number: string; // "1.2", spoken as "section one point two"
  title: string;
  kind: SectionKind;
  words: number; // source prose words
  status: "source" | "ingested";
  sourceFile: string; // "source/c01/c01-s02.md"
  lessonFile?: string; // "sections/c01-s02.json" once ingested
  sourceHash?: string;
  objectives: string[];
  keyTerms: KeyTerm[]; // populated on the chapter's summary section
  segments: SegmentMeta[]; // [] while status === "source"
}

export interface ChapterQuiz {
  id: string; // "<chapterId>/quiz"
  chapterId: string;
  title: string;
  source: "book" | "generated";
  questions: Question[]; // ids "<chapterId>/quiz/q1"
}

export interface Chapter {
  id: string; // "<courseId>/c1"
  number: number;
  title: string;
  shortTitle: string; // speech-safe, ≤ 40 chars
  objectives: string[];
  sections: SectionMeta[];
  reviewFile?: string; // raw Chapter Review Questions from the book
  quizFile?: string; // generated ChapterQuiz
  segments: SegmentMeta[]; // flattened, ordered; keeps Module-shaped code working
}

/** @deprecated use Chapter */
export type Module = Chapter;

export interface Course {
  id: string;
  title: string;
  description: string;
  estimatedMinutes: number;
  license?: { name: string; url: string; attribution: string };
  chapters: Chapter[];
  /** @deprecated alias of chapters, filled in by loadCourse() */
  modules: Chapter[];
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
  modulePct: number; // 0–100, of the current chapter
  streakDays: number;
  explored?: string[]; // detour topics this trip
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

/** Segments in course order. Only ingested sections have segments. */
export function allSegments(course: Course): SegmentMeta[] {
  return course.chapters.flatMap((c) => c.sections.flatMap((s) => s.segments));
}

export function emptyProgress(userId: string, course: Course): Progress {
  const first = allSegments(course)[0];
  return {
    userId,
    courseId: course.id,
    segmentsCompleted: [],
    checkpoints: [],
    topics: {},
    resume: { segmentId: first?.id ?? "", position: "start" },
    streakDays: 0,
    lastTripAt: null,
    trips: [],
  };
}

export function findSegment(course: Course, id: string): SegmentMeta | undefined {
  return allSegments(course).find((s) => s.id === id);
}

export function findQuestion(course: Course, id: string): QuestionMeta | undefined {
  return allSegments(course)
    .flatMap((s) => s.checkpoint)
    .find((q) => q.id === id);
}

/** "pom/c1/s2/g1/q1" → "pom/c1/s2/g1"; "pom/c1/s2/g1" → "pom/c1/s2" */
export function parentId(id: string): string {
  return id.split("/").slice(0, -1).join("/");
}

export function findSection(course: Course, sectionId: string): SectionMeta | undefined {
  for (const c of course.chapters) for (const s of c.sections) if (s.id === sectionId) return s;
  return undefined;
}

export function findChapter(course: Course, chapterId: string): Chapter | undefined {
  return course.chapters.find((c) => c.id === chapterId);
}

/** Chapter containing a segment, section or question id. */
export function chapterOf(course: Course, id: string): Chapter | undefined {
  const parts = id.split("/");
  return findChapter(course, parts.slice(0, 2).join("/"));
}

export function sectionOf(course: Course, id: string): SectionMeta | undefined {
  const parts = id.split("/");
  return findSection(course, parts.slice(0, 3).join("/"));
}
