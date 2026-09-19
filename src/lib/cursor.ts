// The server-owned cursor: where the learner is in the course, and the state machine the
// speech tools drive. The agent LLM never sees ids; it only speaks `reply.say`.
import {
  allSegments,
  parentId,
  type Course,
  type Cursor,
  type Mode,
  type Progress,
  type Question,
  type Segment,
  type ToolReply,
} from "@/types/lesson";
import type { LessonSoFar } from "./ask";
import { blocks, sentences } from "./chunk";
import { loadChapterQuiz, loadQuestionFull, loadSegmentFull } from "./course";
import { gradeAnswer, revealLine } from "./grader";
import { earnNow } from "./milestones";
import { previousSegmentId } from "./navigate";
import { completeSegment, endTrip, recordCheckpoint } from "./progress";
import * as say from "./say";
import { saveProgress } from "./store";

const DEDUPE_MS = 900;

export function ensureCursor(course: Course, progress: Progress): Cursor {
  if (progress.cursor && allSegments(course).some((s) => s.id === progress.cursor!.segmentId)) return progress.cursor;
  const segId = progress.resume.segmentId || allSegments(course)[0]?.id;
  progress.cursor = {
    segmentId: segId,
    blockIdx: 0,
    served: false,
    heard: true,
    phase: progress.resume.position === "checkpoint" ? "ask" : "read",
    qIdx: 0,
    attempt: 0,
    returnStack: [],
    updatedAt: new Date().toISOString(),
  };
  return progress.cursor;
}

function loc(course: Course, c: Cursor): string {
  const p = say.place(course, c.segmentId);
  if (!p) return c.segmentId;
  const where = c.quiz ? `quiz q${c.quiz.qIdx + 1}` : c.phase === "ask" ? `q${c.qIdx + 1}` : c.phase === "done" ? "done" : `block ${c.blockIdx + 1}`;
  return `${p.section.number} · part ${p.partIndex}/${p.partCount} · ${where}`;
}

function commit(course: Course, progress: Progress, c: Cursor, reply: ToolReply): ToolReply {
  reply.loc = reply.loc || loc(course, c);
  reply.segmentId = c.segmentId;
  c.lastReply = reply;
  c.lastAt = new Date().toISOString();
  c.updatedAt = c.lastAt;
  // mirror for the planner / summary page; once a part is done, completeSegment has already pointed
  // resume at the next part, and the summary's "Next leg picks up at" must not fall back to this one
  if (c.phase !== "done") progress.resume = { segmentId: c.segmentId, position: c.phase === "ask" ? "checkpoint" : "start" };
  saveProgress(progress);
  return reply;
}

function segmentFull(courseId: string, id: string): Segment {
  const s = loadSegmentFull(courseId, id);
  if (!s) throw new Error(`segment ${id} has no lesson content`);
  return s;
}

/** Move the cursor to the start of a segment. */
export function moveTo(c: Cursor, segmentId: string, phase: Cursor["phase"] = "read"): void {
  c.segmentId = segmentId;
  c.blockIdx = 0;
  c.served = false;
  c.heard = true;
  c.phase = phase;
  c.qIdx = 0;
  c.attempt = 0;
  delete c.detour;
  delete c.quiz;
  clearResume(c);
}

/** Forget a mid-block resume point: the block changed, or the whole block is wanted again. */
function clearResume(c: Cursor): void {
  delete c.resumeFrom;
  delete c.quiet;
}

/** Trips are open-ended: the next segment is simply the next one in course order (null at the true end). */
function nextSegmentId(course: Course, segmentId: string): string | null {
  const segs = allSegments(course);
  const i = segs.findIndex((s) => s.id === segmentId);
  return segs[i + 1]?.id ?? null;
}

/** Append any milestone this state change just earned to the spoken line. Reading carries on after it. */
export function withMilestones(course: Course, progress: Progress, reply: ToolReply): ToolReply {
  const won = earnNow(course, progress);
  if (won.length) {
    reply.say = `${reply.say} ${say.milestones(won)}`.trim();
    reply.milestones = won;
  }
  return reply;
}

// ---------- next ----------

export function serveNext(course: Course, progress: Progress, opts: { peek?: boolean } = {}): ToolReply {
  // A peek warms the next block without committing, but the helpers below (readBlock, askQuestion,
  // moveTo, quizQuestion, earnNow) all write into the cursor and progress as they go. The store hands
  // out the same in-memory object every call, so a peek on the live object used to flip the phase to
  // "ask" behind the client's back and the next real `next` said "Again." for a question never asked.
  // Peek on a throwaway copy instead.
  if (opts.peek) progress = structuredClone(progress);
  const c = ensureCursor(course, progress);
  // idempotency: a second `next` inside the dedupe window re-serves the same reply
  if (c.lastReply?.kind === "read" && c.lastAt && Date.now() - new Date(c.lastAt).getTime() < DEDUPE_MS && !opts.peek) return c.lastReply;

  // returning from a detour: re-anchor and re-serve the interrupted block
  if (c.detour) {
    const p = say.place(course, c.segmentId);
    delete c.detour;
    if (c.phase === "read") {
      // "Back to <part>" only when a block of it was interrupted; a chat right after a goto, before the
      // first block, is not a return (trip-mu81rfl5: "Going to 2.6…" then "Back to Experience…")
      const prefix = c.served ? `Back to ${p?.segment.title ?? "it"}. ` : "";
      c.heard = false;
      const r = readBlock(course, progress, c, prefix);
      return opts.peek ? r : commit(course, progress, c, r);
    }
    if (c.phase === "ask") {
      const r = askQuestion(course, progress, c, "Back to the question. ");
      return opts.peek ? r : commit(course, progress, c, r);
    }
  }

  // chapter quiz in progress
  if (c.quiz) {
    const r = quizQuestion(course, progress, c);
    return opts.peek ? r : commit(course, progress, c, r);
  }

  if (c.phase === "read") {
    const seg = segmentFull(course.id, c.segmentId);
    const bl = blocks(seg.script);
    // a resume point past the last sentence means the whole block was in fact spoken
    if (c.served && !c.heard && c.resumeFrom !== undefined && c.resumeFrom >= sentences(bl[c.blockIdx] ?? "").length) {
      c.heard = true;
      clearResume(c);
    }
    if (c.served && c.heard) {
      if (c.blockIdx + 1 < bl.length) c.blockIdx += 1;
      else {
        c.phase = "ask";
        c.qIdx = 0;
        c.attempt = 0;
        c.served = false;
        const r = askQuestion(course, progress, c, "Quick check. ");
        return opts.peek ? r : commit(course, progress, c, r);
      }
    }
    const r = readBlock(course, progress, c, c.served && !c.heard ? "Back to it. " : "");
    return opts.peek ? r : commit(course, progress, c, r);
  }

  if (c.phase === "ask") {
    const r = askQuestion(course, progress, c, c.served && !c.heard ? "Again. " : "");
    return opts.peek ? r : commit(course, progress, c, r);
  }

  // phase done → next segment in course order, or the end of the course. A fixed plan (the stage
  // demo, src/lib/demo.ts) lists its legs; past the last one the trip ends itself.
  const from = say.place(course, c.segmentId);
  const planned = progress.activeTrip?.segmentIds ?? [];
  if (planned.length && planned.indexOf(c.segmentId) === planned.length - 1) return endReply(course, progress, c, opts.peek);
  const nxtId = nextSegmentId(course, c.segmentId);
  if (!nxtId) return endReply(course, progress, c, opts.peek);
  const to = say.place(course, nxtId);
  if (!to) return endReply(course, progress, c, opts.peek);
  const chapterChanged = from && from.chapter.id !== to.chapter.id;
  let prefix = say.boundary(from, to) + " ";
  if (chapterChanged && from) {
    const quiz = loadChapterQuiz(course.id, from.chapter.id);
    if (quiz) {
      progress.pendingQuizzes ??= [];
      if (!progress.pendingQuizzes.includes(from.chapter.id)) progress.pendingQuizzes.push(from.chapter.id);
      prefix = say.chapterDone(from.chapter, true) + say.chapterIntro(to) + " ";
    }
  }
  moveTo(c, nxtId);
  const r = readBlock(course, progress, c, prefix);
  return opts.peek ? r : commit(course, progress, c, r);
}

/** The course itself ran out: the trip ends; the reply carries tripId so the UI moves to the summary. */
function endReply(course: Course, progress: Progress, c: Cursor, peek?: boolean): ToolReply {
  if (peek || !progress.activeTrip) {
    const r: ToolReply = { kind: "end", say: "That is the end of the course so far.", loc: loc(course, c), more: false };
    return peek ? r : commit(course, progress, c, r);
  }
  const summary = endTrip(course, progress);
  delete c.lastReply; // "again" after the trip should not replay the closing line
  c.updatedAt = new Date().toISOString();
  saveProgress(progress);
  return { kind: "end", say: say.tripEnd(progress, course, summary), loc: "end", more: false, tripId: summary.tripId, segmentId: c.segmentId };
}

function readBlock(course: Course, progress: Progress, c: Cursor, prefix: string): ToolReply {
  const seg = segmentFull(course.id, c.segmentId);
  const bl = blocks(seg.script);
  const first = c.blockIdx === 0 && !c.served;
  const p = say.place(course, c.segmentId);
  const intro = first && !prefix && p ? say.partIntro(p) + " " : "";
  // mid-block resume: pick up at the sentence the agent was cut in, not the top of the block. A turn the
  // agent cut short by itself (quiet) just carries on; a barge-in or pause keeps the caller's "Back to it."
  let text = bl[c.blockIdx] ?? "";
  if (c.resumeFrom !== undefined && c.resumeFrom > 0) {
    const rest = sentences(text).slice(c.resumeFrom).join(" ");
    if (rest) {
      text = rest;
      if (c.quiet) prefix = "";
    }
  }
  clearResume(c);
  c.served = true;
  c.heard = true;
  return {
    kind: "read",
    say: `${prefix}${intro}${text}`.trim(),
    loc: loc(course, c),
    more: true,
    block: { idx: c.blockIdx, count: bl.length },
  };
}

function currentQuestion(course: Course, c: Cursor): Question | undefined {
  if (c.quiz) return loadChapterQuiz(course.id, parentId(c.quiz.quizId))?.questions[c.quiz.qIdx];
  return segmentFull(course.id, c.segmentId).checkpoint[c.qIdx];
}

function askQuestion(course: Course, progress: Progress, c: Cursor, prefix: string): ToolReply {
  const q = currentQuestion(course, c);
  if (!q) {
    // no questions on this part: it is finished the moment its last block was heard, so credit it
    // (completeSegment is otherwise only reached from answer/skip) and move on. The caller commits
    // (or is itself a peek on a copy), so this must advance the cursor it was handed, not a clone.
    if (!c.quiz && c.phase !== "done") completeSegment(course, progress, c.segmentId);
    c.phase = "done";
    return serveNext(course, progress, {});
  }
  c.served = true;
  c.heard = true;
  return { kind: "ask", say: `${prefix}${say.question(q.prompt, q.options)}`.trim(), loc: loc(course, c), more: false, options: q.options, qIdx: c.qIdx };
}

function quizQuestion(course: Course, progress: Progress, c: Cursor): ToolReply {
  const quiz = loadChapterQuiz(course.id, parentId(c.quiz!.quizId));
  const q = quiz?.questions[c.quiz!.qIdx];
  if (!quiz || !q) {
    // quiz finished
    const res = c.quiz!;
    progress.quizResults ??= [];
    progress.quizResults.push({ chapterId: quiz?.chapterId ?? parentId(res.quizId), correct: res.correct, total: quiz?.questions.length ?? res.qIdx, at: new Date().toISOString() });
    progress.pendingQuizzes = (progress.pendingQuizzes ?? []).filter((id) => id !== quiz?.chapterId);
    delete c.quiz;
    c.heard = false;
    return withMilestones(course, progress, { kind: "say", say: `Quiz done. ${say.num(res.correct)} of ${say.num(quiz?.questions.length ?? res.qIdx)} right. Back to the lesson.`, loc: loc(course, c), more: true });
  }
  c.served = true;
  c.heard = true;
  const intro = c.quiz!.qIdx === 0 && c.quiz!.attempt === 0 ? "First: " : "";
  return { kind: "ask", say: `${intro}${say.question(q.prompt, q.options)}`, loc: loc(course, c), more: false, options: q.options };
}

// ---------- study mode (hands-on reader) ----------

/**
 * The reader has reached the start of a block. Point the cursor there so Listen and Read modes
 * pick up at the same block. heard=false means "mid-block": serveNext re-reads it ("Back to it.")
 * and the resume card cuts at the end of the previous block.
 */
export function mark(course: Course, progress: Progress, segmentId: string, blockIdx: number): ToolReply {
  const c = ensureCursor(course, progress);
  const seg = segmentFull(course.id, segmentId);
  if (c.segmentId !== segmentId) moveTo(c, segmentId);
  const n = blocks(seg.script).length;
  c.blockIdx = Math.max(0, Math.min(n - 1, Math.floor(blockIdx)));
  c.phase = "read";
  c.served = true;
  c.heard = false;
  clearResume(c);
  delete c.lastReply;
  delete c.detour;
  return commit(course, progress, c, { kind: "say", say: "", loc: loc(course, c), more: false });
}

/** Open the checkpoint for a segment. The existing answer() grades and advances from here. */
export function startCheck(course: Course, progress: Progress, segmentId: string): ToolReply {
  const c = ensureCursor(course, progress);
  if (c.segmentId !== segmentId) moveTo(c, segmentId);
  delete c.detour;
  delete c.quiz;
  if (c.phase === "done") return commit(course, progress, c, { kind: "say", say: "Part done.", loc: loc(course, c), more: true });
  if (c.phase !== "ask") {
    c.phase = "ask";
    c.qIdx = 0;
    c.attempt = 0;
    c.served = false;
  }
  return commit(course, progress, c, askQuestion(course, progress, c, ""));
}

// ---------- answer ----------

/** A checkpoint or quiz question is waiting for an answer. */
export function questionOpen(course: Course, progress: Progress): boolean {
  const c = ensureCursor(course, progress);
  return (c.phase === "ask" || !!c.quiz) && !!currentQuestion(course, c);
}

/**
 * Grade and advance. A wrong first try gets a hint and one retry; the second try (or a give-up)
 * reveals the answer and moves on. When the grader says the words were not an answer at all
 * (a question, a command), nothing is recorded and the reply carries `intent` for actionAnswer to route.
 */
export async function answer(course: Course, progress: Progress, text: string, mode: Mode, opts: { giveup?: boolean } = {}): Promise<ToolReply> {
  const c = ensureCursor(course, progress);
  const q = currentQuestion(course, c);
  if (!q || (c.phase !== "ask" && !c.quiz)) {
    return commit(course, progress, c, { kind: "say", say: "No question is open right now. Say continue to carry on.", loc: loc(course, c), more: false });
  }
  const first = (c.quiz ? c.quiz.attempt : c.attempt) === 0;
  const result = opts.giveup ? { correct: false, feedback: revealLine(q), intent: "giveup" as const } : await gradeAnswer(q, text, { reveal: !first, chatting: !!c.detour });
  if (result.intent && result.intent !== "answer" && result.intent !== "giveup") {
    // not an answer: leave the question open, burn nothing
    return { kind: "say", say: "", loc: loc(course, c), more: false, intent: result.intent, segmentId: c.segmentId };
  }
  recordCheckpoint(progress, q, text, result.correct, result.feedback, mode);
  const attempt = c.quiz ? ++c.quiz.attempt : ++c.attempt;
  const retry = !result.correct && attempt === 1 && !opts.giveup;
  if (c.quiz) {
    if (result.correct) c.quiz.correct += 1;
    if (!retry) {
      c.quiz.qIdx += 1;
      c.quiz.attempt = 0;
    }
    const more = !retry;
    return commit(course, progress, c, { kind: "say", say: retry ? `${result.feedback} Try once more.` : result.feedback, loc: loc(course, c), more, correct: result.correct });
  }
  if (retry) {
    return commit(course, progress, c, { kind: "say", say: `${result.feedback} Try once more.`, loc: loc(course, c), more: false, correct: false });
  }
  c.qIdx += 1;
  c.attempt = 0;
  c.served = false;
  const seg = segmentFull(course.id, c.segmentId);
  if (c.qIdx >= seg.checkpoint.length) {
    completeSegment(course, progress, c.segmentId);
    c.phase = "done";
    // completeSegment moved progress.resume; the cursor stays on this segment until next()
    // Study's Checkpoint reads the "Part done." tail; spoken, the boundary line names the part on the next `next`
    const tail = mode === "study" ? " Part done." : "";
    return commit(course, progress, c, withMilestones(course, progress, { kind: "say", say: `${result.feedback}${tail}`, loc: loc(course, c), more: true, correct: result.correct }));
  }
  return commit(course, progress, c, { kind: "say", say: result.feedback, loc: loc(course, c), more: true, correct: result.correct });
}

// ---------- explain ----------

export type Aspect = "again" | "simpler" | "deeper" | "example";

export function explain(course: Course, progress: Progress, how: Aspect): ToolReply {
  const c = ensureCursor(course, progress);
  if (how === "again") {
    if (c.lastReply?.kind === "ask") return commit(course, progress, c, { ...c.lastReply, say: c.lastReply.say.replace(/^(Again\. |Quick check\. |Back to the question\. )/, ""), more: false });
    // a question is open but the last thing said was a detour answer or feedback: read the question again
    if (c.quiz) return commit(course, progress, c, quizQuestion(course, progress, c));
    if (c.phase === "ask" && currentQuestion(course, c)) return commit(course, progress, c, askQuestion(course, progress, c, ""));
    if (c.phase === "read") {
      const seg = segmentFull(course.id, c.segmentId);
      // key points are the "repeat" content; then reading resumes on the current block, from its top
      c.heard = false;
      clearResume(c);
      return commit(course, progress, c, { kind: "say", say: `The main points so far. ${seg.keyPoints.join(" ")}`, loc: loc(course, c), more: true });
    }
    return commit(course, progress, c, { ...(c.lastReply ?? { kind: "say", say: "Say go to continue.", loc: loc(course, c), more: false }) });
  }
  const seg = segmentFull(course.id, c.segmentId);
  const text = how === "simpler" ? seg.altExplanation : how === "deeper" ? seg.deeper : seg.example || seg.altExplanation;
  const more = c.phase === "read"; // resume reading afterwards; if on a question, wait for the answer
  return commit(course, progress, c, { kind: "say", say: text, loc: loc(course, c), more });
}

// ---------- interrupted ----------

/** The learner cut the tutor off: the current block or question is re-served on the next `next`.
 *  The client posts this only for a real barge-in, never for its own synthetic "continue" turn. */
export function interrupted(course: Course, progress: Progress, opts: { spoken?: string; quiet?: boolean } = {}): void {
  const c = ensureCursor(course, progress);
  c.heard = false;
  // `spoken` is what the agent actually said of the block (the SDK's corrected response on a barge-in, or
  // the transcript of a turn the agent cut short by itself): the re-read picks up at the next sentence.
  // A bare post (no spoken) keeps any resume point an earlier post set; it never widens the re-read.
  if (opts.spoken && c.phase === "read" && c.served) {
    const from = spokenUpTo(segmentFull(course.id, c.segmentId), c.blockIdx, opts.spoken);
    if (from !== undefined) {
      c.resumeFrom = from;
      c.quiet = opts.quiet === true;
    }
  }
  c.updatedAt = new Date().toISOString();
  saveProgress(progress);
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();

/**
 * The sentence of the block after the last one `spoken` contains. A contiguous run only: from the first
 * sentence found in `spoken` (0 for a fresh read; later when the block was already resumed mid-way) to
 * the first one missing, so a chance match cannot skip text. undefined when no sentence was said: that
 * is a full re-read, as before.
 */
export function spokenUpTo(seg: Segment, blockIdx: number, spoken: string): number | undefined {
  const said = norm(spoken);
  if (!said) return undefined;
  const sents = sentences(blocks(seg.script)[blockIdx] ?? "").map(norm);
  const start = sents.findIndex((s) => s && said.includes(s));
  if (start < 0) return undefined;
  let k = start;
  while (k < sents.length && said.includes(sents[k])) k += 1;
  return k;
}

// ---------- where am I ----------

export function whereAmI(course: Course, progress: Progress): ToolReply {
  const c = ensureCursor(course, progress);
  const r: ToolReply = { kind: "say", say: say.whereAmI(course, progress, c.segmentId, c.phase), loc: loc(course, c), more: false };
  // do not overwrite lastReply (so "again" still repeats the lesson content)
  saveProgress(progress);
  return r;
}

// ---------- goto ----------

export function gotoSegment(course: Course, progress: Progress, segmentId: string, via: string): ToolReply {
  const c = ensureCursor(course, progress);
  const to = say.place(course, segmentId);
  if (!to) return commit(course, progress, c, { kind: "say", say: "That part is not available yet.", loc: loc(course, c), more: false });
  // remember an open question too, so "go back" lands on it rather than the start of the block
  c.returnStack.push(c.phase === "ask" && !c.quiz ? { segmentId: c.segmentId, blockIdx: c.blockIdx, phase: "ask", qIdx: c.qIdx } : { segmentId: c.segmentId, blockIdx: c.blockIdx });
  if (c.returnStack.length > 5) c.returnStack.shift();
  moveTo(c, segmentId);
  const line = via === "relative" && to.section.id === say.place(course, c.returnStack.at(-1)!.segmentId)?.section.id ? say.partIntro(to) : say.chapterIntro(to);
  return commit(course, progress, c, { kind: "say", say: `Going to ${line}`, loc: loc(course, c), more: true });
}

export function gotoBack(course: Course, progress: Progress): ToolReply {
  const c = ensureCursor(course, progress);
  let prev = c.returnStack.pop();
  if (!prev) {
    // nothing jumped to this trip: "go back" means the part before this one in the book
    const before = previousSegmentId(course, c.segmentId);
    if (!before) return commit(course, progress, c, { kind: "say", say: "This is the start of the course. There is nowhere to go back to.", loc: loc(course, c), more: false });
    prev = { segmentId: before, blockIdx: 0 };
  }
  const p = say.place(course, prev.segmentId);
  moveTo(c, prev.segmentId);
  c.blockIdx = prev.blockIdx;
  if (prev.phase === "ask") {
    c.phase = "ask";
    c.qIdx = prev.qIdx ?? 0;
    return commit(course, progress, c, askQuestion(course, progress, c, "Back to the question. "));
  }
  return commit(course, progress, c, { kind: "say", say: `Back to ${p ? say.partIntro(p) : "where you were."}`, loc: loc(course, c), more: true });
}

export function skip(course: Course, progress: Progress): ToolReply {
  const c = ensureCursor(course, progress);
  if (c.quiz) {
    c.quiz.qIdx += 1;
    c.quiz.attempt = 0;
    return commit(course, progress, c, { kind: "say", say: "Skipping that one.", loc: loc(course, c), more: true });
  }
  if (c.phase === "read") {
    c.phase = "ask";
    c.qIdx = 0;
    c.attempt = 0;
    c.served = false;
    clearResume(c);
    return commit(course, progress, c, { kind: "say", say: "Skipping to the questions.", loc: loc(course, c), more: true });
  }
  if (c.phase === "ask") {
    // one question at a time; the last one skipped finishes the part
    const seg = segmentFull(course.id, c.segmentId);
    c.qIdx += 1;
    c.attempt = 0;
    c.served = false;
    if (c.qIdx < seg.checkpoint.length) return commit(course, progress, c, { kind: "say", say: "Skipping that one.", loc: loc(course, c), more: true });
    completeSegment(course, progress, c.segmentId);
    c.phase = "done";
    return commit(course, progress, c, withMilestones(course, progress, { kind: "say", say: "Skipping the questions.", loc: loc(course, c), more: true }));
  }
  return commit(course, progress, c, { kind: "say", say: "Moving on.", loc: loc(course, c), more: true });
}

export function startQuiz(course: Course, progress: Progress, chapterId: string): ToolReply {
  const c = ensureCursor(course, progress);
  const quiz = loadChapterQuiz(course.id, chapterId);
  if (!quiz) return commit(course, progress, c, { kind: "say", say: "That chapter has no quiz yet.", loc: loc(course, c), more: false });
  c.quiz = { quizId: quiz.id, qIdx: 0, attempt: 0, correct: 0 };
  c.heard = false; // when the quiz ends, re-read the current block
  clearResume(c);
  return commit(course, progress, c, { kind: "say", say: `Chapter ${say.num(Number(chapterId.split("/c")[1]))} quiz, ${say.num(quiz.questions.length)} questions.`, loc: loc(course, c), more: true });
}

// ---------- detour bookkeeping (the answer itself comes from ask.ts) ----------

const CHAT_HISTORY = 6;

/**
 * `meta`: the turn was about the tutor, the app or small talk ("what's your name?"), not the course.
 * It still joins the chat history (follow-ups and "you didn't answer me" need it) but is not a detour
 * on the record: no "You explored tutor identity" on the summary, no "First question from the road".
 */
export function beginDetour(course: Course, progress: Progress, question: string, answer: string, topic: string, meta = false): Cursor {
  const c = ensureCursor(course, progress);
  if (!c.detour) c.detour = { topic, turns: 0, startedAt: new Date().toISOString(), history: [] };
  c.detour.turns += 1;
  if (!meta || !c.detour.topic) c.detour.topic = topic;
  c.detour.history = [...(c.detour.history ?? []), { q: question, a: answer }].slice(-CHAT_HISTORY);
  if (meta) return c;
  progress.detours ??= [];
  progress.detours.push({ at: new Date().toISOString(), segmentId: c.segmentId, question, topic });
  return c;
}

/** The chat so far at this position (empty once the cursor has moved on). */
export function chatHistory(course: Course, progress: Progress): { q: string; a: string }[] {
  return ensureCursor(course, progress).detour?.history ?? [];
}

/**
 * What the learner has heard and done in the current part, for the chat model: blocks read so far,
 * the rest of the part, the questions asked here (checkpoint or quiz) and their attempts at them.
 */
export function lessonSoFar(course: Course, progress: Progress): LessonSoFar {
  const c = ensureCursor(course, progress);
  const seg = segmentFull(course.id, c.segmentId);
  const bl = blocks(seg.script);
  // during a checkpoint the whole part has been read; mid-read, the current block counts as heard
  const upto = c.phase === "read" ? (c.served ? c.blockIdx + 1 : c.blockIdx) : bl.length;
  const questions: Question[] = c.quiz
    ? (loadChapterQuiz(course.id, parentId(c.quiz.quizId))?.questions ?? []).slice(0, c.quiz.qIdx + 1)
    : c.phase === "ask"
      ? seg.checkpoint.slice(0, c.qIdx + 1)
      : c.phase === "done"
        ? seg.checkpoint
        : [];
  const ids = new Set(questions.map((q) => q.id));
  const since = progress.activeTrip?.startedAt ?? ""; // this trip's attempts only, not a rerun's from last week
  // the whole part has been read and the checkpoint is what `next` serves next: the chat model must know,
  // or it tells a learner who never heard the question that none was due (trip-mu81rfl5)
  const pending = c.phase === "read" && !c.quiz && upto >= bl.length ? seg.checkpoint : [];
  return {
    readSoFar: bl.slice(0, upto).join("\n"),
    unread: bl.slice(upto).join("\n"),
    questions,
    attempts: progress.checkpoints.filter((a) => ids.has(a.questionId) && a.at >= since),
    pending,
  };
}

export function commitReply(course: Course, progress: Progress, reply: ToolReply): ToolReply {
  const c = ensureCursor(course, progress);
  return commit(course, progress, c, reply);
}

/** Context for grounded Q&A: current segment + section metadata. */
export function contextFor(course: Course, progress: Progress) {
  const c = ensureCursor(course, progress);
  const seg = segmentFull(course.id, c.segmentId);
  const p = say.place(course, c.segmentId);
  return { cursor: c, segment: seg, place: p };
}
