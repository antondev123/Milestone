// Wipe runtime progress so the demo starts clean. Usage:
//   npm run demo:reset            → empty progress
//   npm run demo:reset -- --seed  → position only: chapter 1 done, chapter 2 through 2.4 (no trips, answers or streak)
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Course, Progress } from "../src/types/lesson.ts";

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
  const progress: Progress = {
    userId: "demo",
    courseId,
    segmentsCompleted: done.map((s) => s.id),
    // position only: no trips, answers or streak. Progress screens show logged numbers only
    // (docs/DESIGN.md §5), so do a real rehearsal trip for minutes to appear.
    checkpoints: [],
    topics: {},
    resume: { segmentId: next?.id ?? segs[0].id, position: "start" },
    streakDays: 0,
    lastTripAt: null,
    trips: [],
  };
  writeFileSync(join(dir, `demo-${courseId}.json`), JSON.stringify(progress, null, 2));
  console.log(`demo-reset: seeded position only: ${done.length} segments done, resume at ${progress.resume.segmentId}`);
}
