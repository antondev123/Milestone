# SCHEMA

Source of truth: `src/types/lesson.ts`. This doc explains intent. Change the code first, then this.

## Course on disk (`data/courses/<courseId>/`)

```
course.json          manifest: chapters → sections → segment METADATA. Small (~70 KB), always in memory.
toc.md               one line per chapter/section, ~1.6k tokens, pasted into LLM prompts as the table of contents
source/cNN/*.md      one Markdown file per section, parsed from the book. Human-editable. Committed.
sections/cNN-sMM.json  one SectionLesson per ingested section (the prose). Loaded lazily by id. Committed.
chapters/cNN-review.json  the book's own Chapter Review Questions (raw)
chapters/cNN-quiz.json    generated ChapterQuiz (open questions with model answers + rubrics)
raw/                 pdftotext dump, gitignored, regenerable
parse-report.json    per-section parse stats + warnings
ingest.log.jsonl     one row per Claude call: tokens, $, ms
LICENSE.md           CC BY 4.0 attribution (the book is OpenStax)
```

Pipeline: `npm run parse:book` (deterministic, free) → `npm run ingest` (Claude, per section, idempotent) → `npm run validate`.

## Ids

```
pom                    course
pom/c2                 chapter 2
pom/c2/s5              section 2.5
pom/c2/s5/g1           segment (one 3–5 min spoken "part"), g = "gobbet"
pom/c2/s5/g1/q2        checkpoint question
pom/c2/quiz/q3         chapter quiz question
```
`parentId(id)` drops the last path element. Quiz question ids do not move the resume pointer.

## Manifest shapes (in memory)

```
Course
  id, title, description, estimatedMinutes
  license          { name, url, attribution }   shown on the start screen and summary
  chapters         Chapter[]
  modules          alias of chapters (deprecated, filled by loadCourse)

Chapter
  id, number, title
  shortTitle       speech-safe, ≤ 40 chars ("Organizational Environments")
  objectives       string[]  chapter-level learning objectives
  sections         SectionMeta[]
  reviewFile?      raw review questions
  quizFile?        generated ChapterQuiz
  segments         SegmentMeta[]  flattened across sections, in order

SectionMeta
  id, number ("2.5"), title
  kind             "content" | "intro" | "summary"   only content/intro sections are ingested
  words            source prose words
  status           "source" | "ingested"
  sourceFile, lessonFile?, sourceHash?
  objectives       string[]
  keyTerms         { term, definition }[]   populated on the chapter's summary section
  segments         SegmentMeta[]   [] until ingested

SegmentMeta      { id, title, durationSec, sectionId, checkpoint: QuestionMeta[] }
QuestionMeta     { id, type: "mcq"|"open", topic }
```

The planner and progress code only need the manifest. Prose is loaded when a segment is actually read or graded.

## Lesson shapes (lazy, `sections/*.json`)

```
SectionLesson { id, title, sourceHash, model, segments: Segment[] }
  model = the ingest model id, or "verbatim" when the scripts are cut from the PDF text layer by scripts/verbatim-chapter.ts (chapter 1). Verbatim scripts run 300–600 words.

Segment extends SegmentMeta      one 3–5 min spoken unit
  script          plain prose, no markdown, read aloud verbatim. 380–560 words
  keyPoints       2–4 short bullets; "repeat" reads these
  altExplanation  same idea, different analogy — "explain differently"
  deeper          100–200 words of extra depth — "go deeper"
  example         one worked SA example — "give me an example"
  checkpoint      Question[] 1–3, ordered

Question extends QuestionMeta
  prompt          spoken/shown as-is
  options         mcq only, 3–4, ≤ 8 words each
  answer          mcq: exact option text. open: model answer
  rubric          open: what a correct paraphrase MUST contain
  source          "book" (the textbook's own Concept Check / review question) | "generated"

ChapterQuiz { id "<chapterId>/quiz", chapterId, title, source, questions: Question[] }
```

Rules: segments are the unit of resume and of planning. Every segment has ≥ 1 question so the planner can always end on a checkpoint. Concept Check questions from the book are reused verbatim with the book's Summary-of-Learning-Outcomes answer where it exists.

## Loader API (`src/lib/course.ts`)

```
loadCourse(courseId)                      manifest, sync, cached
loadSection(courseId, sectionId)          SectionLesson | null
loadSegmentFull(courseId, segmentId)      Segment | undefined
loadQuestionFull(courseId, questionId)    Question | undefined  (segment checkpoints and chapter quizzes)
loadChapterQuiz(courseId, chapterId)      ChapterQuiz | null
tocForPrompt(courseId)                    string, ~1.6k tokens
```
`DEFAULT_COURSE_ID` is `pom` (override with `COURSE_ID`). The old `sample` course still loads through a legacy adapter.

## Progress (read/write at runtime, one file per user+course)

```
Progress
  userId             string   "demo" for the hackathon
  courseId           string
  segmentsCompleted  string[] segment ids, in completion order
  checkpoints        CheckpointResult[]  every attempt, append-only
  topics             Record<topic, { seen: number; correct: number }>
  resume             ResumePointer
  streakDays         number
  lastTripAt         string | null   ISO
  trips              TripSummary[]
  activeTrip?        ActiveTrip

ResumePointer  { segmentId, position: "start" | "checkpoint" }
CheckpointResult { questionId, correct, attempt, mode, answer, feedback, at }

TripSummary                      the progress artefact
  tripId, startedAt, endedAt, minutes (elapsed, rounded, min 1), mode
  segmentIds   completed this trip
  correct, total
  mastered     topics with correct/seen ≥ 0.75 after this trip (≥2 seen)
  weak         topics with correct/seen < 0.5
  modulePct    0–100, segments completed in the CURRENT CHAPTER / chapter segments
  streakDays   snapshot at trip end
  explored?    detour topics (PR B)
  milestones?  milestone ids first earned on this trip, e.g. "first-hands-free", "chapter-2", "quiz-1"
               (rules and labels in src/lib/milestones.ts; awarded once, only for what this trip did)

ActiveTrip { tripId, startedAt, minutes (0 = open-ended), mode, segmentIds (always [] — trips run until ended),
             completedSegmentIds, milestones? (ids earned and spoken so far this trip; merged into the summary) }
```

## Session plan (ephemeral, returned by POST /api/session)

```
Plan { tripId, segmentIds (always []), startAt: ResumePointer, greeting? }
```

## Grade request/response (POST /api/grade)

```
GradeRequest  { questionId, answer, mode }
GradeResponse { correct: boolean, feedback: string }   feedback ≤ 20 words, spoken aloud in voice mode
```

MCQ is graded locally by string match. Open questions go to Claude with prompt + rubric + answer; accept paraphrase, reject vague or partial answers.

## Routes

| Route | Body → Response |
|---|---|
| POST /api/session | `{mode}` → `Plan` (open-ended trip at the cursor); `{carry: true, mode}` keeps the running trip |
| GET /api/course | → manifest without objectives/key terms (~35 KB). Never prose. |
| GET /api/segment?id= | → `{segment (full), position, indexInTrip, tripLength, nextSegmentId}` |
| POST /api/segment | `{segmentId}` → `{nextSegmentId, tripDone}` |
| POST /api/grade | `GradeRequest` → `GradeResponse` (also records the checkpoint) |
| POST /api/trip/end | → `TripSummary` |
| GET / DELETE /api/progress | → `Progress` (DELETE resets the demo user) |
| POST /api/tools/{get_segment,grade_answer,complete_segment,end_trip} | ElevenLabs tool shapes, see docs/ELEVENLABS.md |

## Cursor (server-owned position; lives on `Progress.cursor`)

```
Cursor
  segmentId     current part
  blockIdx      which ~250-word block of the script (src/lib/chunk.ts) is current
  served/heard  the block or question was sent; heard=false after a barge-in → re-read on the next `next`
  phase         "read" | "ask" (checkpoint qIdx) | "done" (part finished, next `next` moves on)
  qIdx, attempt
  detour?       { topic, turns, startedAt, history[] {q, a} }  set by `ask` (history = last 6 chat turns), popped by `next` ("Back to <part>.")
  quiz?         { quizId, qIdx, attempt, correct }     chapter quiz in progress
  returnStack   previous positions for "go back"
  lastReply     for idempotent `next` (900 ms window) and "again"

Progress +=  cursor?, detours[] {at, segmentId, question, topic}, bookmarks[], pendingQuizzes[] (chapter ids), quizResults[]
Progress +=  demo? { segmentIds[], tripId? }   stage demo armed by `npm run demo:stage`: the next Listen trip is exactly these
             legs, then it ends itself (the only trip with a non-empty ActiveTrip.segmentIds). Cleared when that trip ends.
TripSummary += explored[]   detour topics this trip
TripSummary += milestones[] milestone ids first earned on this trip
Progress +=  voiceId?     learner's pick from /settings, an id in data/voices.json; unset = Mark (DEFAULT_VOICE_ID in src/lib/voices.ts)
Plan += greeting            server-composed opening line

ToolReply { kind: "read"|"ask"|"say"|"end", say, loc, more, options?, correct?, tripId?, segmentId?, offer?, qIdx?, block?,
            milestones? (ids first earned by this reply; already spoken inside `say`, the client plays an earcon) }
  qIdx: set on kind "ask" so study mode can render the question locally
  block: { idx, count } on kind "read": which script block of the part this is, so the Listen Dial can creep its ring through the part
Mode = "voice" | "text" | "study"   (study = hands-on reader; trips log as "studied")
```
`progress.resume` is kept as a mirror of the cursor on every mutation so the planner and summary page are unchanged.

### Speech tool routes (POST /api/tools/<name>, body JSON, reply ToolReply)

| Tool | Body |
|---|---|
| `next` | `{ peek?: true }` (peek warms the cache without moving) |
| `explain` | `{ how: "again" \| "simpler" \| "deeper" \| "example" }` |
| `answer` | `{ text, mode? }` |
| `ask` | `{ question, context? }` (`context` = a tapped sentence, prepended for the model; `mode: "study"` skips the spoken detour and the "back to the lesson, or keep chatting?" tail) |
| `goto` | `{ target }` (spoken words) |
| `where_am_i` | – |
| `interrupted` | – (client barge-in signal) |
| `end_trip` | – → ToolReply + TripSummary fields + `spoken` |
| `mark` | `{ segmentId, blockIdx }` study mode: the reader reached a block; cursor moves there (served, not heard) so Listen re-reads it |
| `check` | `{ segmentId }` study mode: open the checkpoint (phase ask, q1) or reply "Part done."; `answer` grades from here |

### Read-aloud (GET /api/tts)

`?segmentId=&blockIdx=` → `{ text, words: [{start, end}], model, voice }`; `&audio=1` → `audio/mpeg`. One ElevenLabs call per block, cached under `TTS_CACHE_DIR` (default `data/tts`). `words` has one entry per `text.split(/s+/)` item.
