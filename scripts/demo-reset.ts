// Wipe runtime progress so the demo starts clean. Usage:
//   npm run demo:reset            → empty progress
//   npm run demo:reset -- --seed  → chapter 1 done, chapter 2 through 2.4, 4-day streak (rehearsal state)
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Course, Progress, TripSummary } from "../src/types/lesson.ts";

const courseId = process.env.COURSE_ID ?? "pom";
const dir = join(process.cwd(), "data", "progress");
mkdirSync(dir, { recursive: true });
let n = 0;
for (const f of readdirSync(dir)) {
  if (f.endsWith(".json")) {
    unlinkSync(join(dir, f));
    n++;
  }
}
console.log(`demo-reset: removed ${n} progress file(s) from data/progress`);

if (process.argv.includes("--seed")) {
  const manifest = join(process.cwd(), "data", "courses", courseId, "course.json");
  if (!existsSync(manifest)) throw new Error(`no course at ${manifest}`);
  const course = JSON.parse(readFileSync(manifest, "utf8")) as Course;
  const segs = course.chapters.flatMap((c) => c.sections.flatMap((s) => s.segments));
  // done: everything in chapter 1 and sections 2.1–2.4
  const done = segs.filter((s) => s.id.startsWith(`${courseId}/c1/`) || /\/c2\/s[1-4]\//.test(s.id));
  const next = segs.find((s) => !done.includes(s));
  const day = 86_400_000;
  const now = Date.now();
  const checkpoints: Progress["checkpoints"] = [];
  const topics: Progress["topics"] = {};
  done.forEach((s, i) => {
    for (const q of s.checkpoint) {
      const correct = (i + q.id.length) % 4 !== 0; // ~75% right
      checkpoints.push({ questionId: q.id, correct, attempt: 1, mode: i % 2 ? "voice" : "text", answer: "(seeded)", feedback: correct ? "Correct." : "Not quite.", at: new Date(now - (4 - Math.floor(i / 3)) * day).toISOString() });
      const t = (topics[q.topic] ??= { seen: 0, correct: 0 });
      t.seen++;
      if (correct) t.correct++;
    }
  });
  const trips: TripSummary[] = [3, 2, 1].map((d, i) => ({
    tripId: `trip-seed${i}`,
    startedAt: new Date(now - d * day - 20 * 60_000).toISOString(),
    endedAt: new Date(now - d * day).toISOString(),
    minutes: 20,
    mode: i % 2 ? "voice" : "text",
    segmentIds: done.slice(i * 3, i * 3 + 3).map((s) => s.id),
    correct: 5,
    total: 6,
    mastered: [],
    weak: [],
    modulePct: 40 + i * 20,
    streakDays: i + 2,
  }));
  const progress: Progress = {
    userId: "demo",
    courseId,
    segmentsCompleted: done.map((s) => s.id),
    checkpoints,
    topics,
    resume: { segmentId: next?.id ?? segs[0].id, position: "start" },
    streakDays: 4,
    lastTripAt: new Date(now - day).toISOString(),
    trips,
  };
  writeFileSync(join(dir, `demo-${courseId}.json`), JSON.stringify(progress, null, 2));
  console.log(`demo-reset: seeded ${done.length} segments done, resume at ${progress.resume.segmentId}, streak 4`);
}
