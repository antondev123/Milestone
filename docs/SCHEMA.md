# SCHEMA

Source of truth: `src/types/lesson.ts`. This doc explains intent. Change the code first, then this.

## Lesson (output of ingestion, read-only at runtime)

```
Course
  id                string   slug, e.g. "personal-finance-sa"
  title             string
  description       string   one sentence, used on the start screen
  estimatedMinutes  number   sum of segment durations + checkpoint overhead
  modules           Module[]

Module
  id        string   "<courseId>/m1"
  title     string
  segments  Segment[]  ordered

Segment                         one 3–5 min spoken unit
  id              string   "<moduleId>/s1"
  title           string
  durationSec     number   180–300; estimated at 150 words/min from script
  script          string   plain prose, no markdown, no headings — read aloud verbatim
  keyPoints       string[] 2–4 short bullets; "repeat" reads these, summary uses them
  altExplanation  string   same idea, different angle/analogy — "explain differently"
  deeper          string   1–2 paragraphs of extra depth — "go deeper"
  checkpoint      Question[] 1–3, ordered

Question
  id       string   "<segmentId>/q1"
  prompt   string   spoken/shown as-is
  type     "mcq" | "open"
  options  string[]  mcq only, 3–4, no "all of the above"
  answer   string   mcq: exact option text. open: model answer
  rubric   string   open: what a correct paraphrase MUST contain; grader rejects vagueness
  topic    string   short tag, e.g. "compound-interest"; feeds mastered/weak
```

Rules: segments are the unit of resume and of planning. Questions never reference other segments. Every segment has ≥1 question so the planner can always end on a checkpoint.

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

ResumePointer
  segmentId  string
  position   "start" | "checkpoint"   where in that segment to pick up

CheckpointResult
  questionId  string
  correct     boolean
  attempt     number    1-based, per question
  mode        "voice" | "text"
  answer      string    what the user said/tapped
  feedback    string    one-line grader feedback
  at          string    ISO

TripSummary                      the progress artefact
  tripId       string
  startedAt    string    ISO
  endedAt      string    ISO
  minutes      number    what the user picked
  mode         "voice" | "text"
  segmentIds   string[]  completed this trip
  correct      number
  total        number
  mastered     string[]  topics with correct/seen ≥ 0.75 after this trip (≥2 seen)
  weak         string[]  topics with correct/seen < 0.5
  modulePct    number    0–100, segments completed / module segments
  streakDays   number    snapshot at trip end
```

## Session plan (ephemeral, returned by POST /api/session)

```
Plan
  tripId       string
  segmentIds   string[]
  estMinutes   number
  startAt      ResumePointer   where to begin (copied from progress.resume)
```

## Grade request/response (POST /api/grade)

```
GradeRequest  { questionId, answer, mode }
GradeResponse { correct: boolean, feedback: string }   feedback ≤ 20 words, spoken aloud in voice mode
```

MCQ is graded locally by string match. Open questions go to Claude with prompt + rubric + answer; accept paraphrase, reject vague or partial answers.

## ActiveTrip (added during build; lives on Progress.activeTrip while a trip is in flight)

```
ActiveTrip
  tripId               string
  startedAt            string    ISO
  minutes              number
  mode                 "voice" | "text"
  segmentIds           string[]  planned by the planner
  completedSegmentIds  string[]  done so far this trip
```

Cleared by POST /api/trip/end, which turns it into a TripSummary.

## Routes

| Route | Body → Response |
|---|---|
| POST /api/session | `{minutes, mode}` → `Plan` |
| GET /api/segment?id= | → `{segment, position, indexInTrip, tripLength, nextSegmentId}` |
| POST /api/segment | `{segmentId}` → `{nextSegmentId, tripDone}` |
| POST /api/grade | `GradeRequest` → `GradeResponse` (also records the checkpoint) |
| POST /api/trip/end | → `TripSummary` |
| GET / DELETE /api/progress | → `Progress` (DELETE resets the demo user) |
| GET /api/course | → `Course` |
| POST /api/tools/{get_segment,grade_answer,complete_segment,end_trip} | ElevenLabs tool shapes, see docs/ELEVENLABS.md |
