import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Course } from "@/types/lesson";

const cache = new Map<string, Course>();

/** Load an ingested lesson.json. Read-only at runtime. */
export function loadCourse(courseId = "sample"): Course {
  const hit = cache.get(courseId);
  if (hit) return hit;
  const path = join(process.cwd(), "data", "courses", courseId, "lesson.json");
  const course = JSON.parse(readFileSync(path, "utf8")) as Course;
  cache.set(courseId, course);
  return course;
}

export const DEFAULT_COURSE_ID = "sample";
