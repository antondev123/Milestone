// Wipe runtime progress so the demo starts clean. Usage:
//   npm run demo:reset            → empty progress
//   npm run demo:reset -- --seed  → position only: chapter 1 done, chapter 2 through 2.4 (no trips, answers or streak)
//   npm run demo:stage            → the seed above plus the stage demo armed: the next Listen trip is exactly
//                                   2.5 parts 1 and 2, then it ends itself into the summary. Once. See docs/DEMO.md.
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Course, Progress } from "../src/types/lesson.ts";

const courseId = process.env.COURSE_ID ?? "pom";
const stage = process.argv.includes("--stage");
const seed = stage || process.argv.includes("--seed");
// The stage trip: the book's own text for 2.5, ~1.5 min read, open + mcq check, ~2 min read, open check.
const STAGE_LEGS = [`${courseId}/c2/s5/g1`, `${courseId}/c2/s5/g2`];

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

if (seed) {
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
    // (docs/DESIGN.md §5), so the first real trip is what puts minutes and a streak there.
    checkpoints: [],
    topics: {},
    resume: { segmentId: next?.id ?? segs[0].id, position: "start" },
    streakDays: 0,
    lastTripAt: null,
    trips: [],
  };
  if (stage) {
    for (const id of STAGE_LEGS) if (!segs.some((s) => s.id === id)) throw new Error(`stage leg ${id} is not in the course`);
    progress.resume = { segmentId: STAGE_LEGS[0], position: "start" };
    progress.demo = { segmentIds: STAGE_LEGS };
  }
  writeFileSync(join(dir, `demo-${courseId}.json`), JSON.stringify(progress, null, 2));
  console.log(`demo-reset: seeded position only: ${done.length} segments done, resume at ${progress.resume.segmentId}`);
  if (stage) {
    console.log(`demo-reset: stage demo armed: ${STAGE_LEGS.join(" → ")}`);
    console.log("  open / and tap Listen, then tap the dial. The trip ends itself after part 2. Runs once; rerun npm run demo:stage for the next person.");
  }
}
