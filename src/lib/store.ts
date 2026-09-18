// Progress store: JSON file per user+course under data/progress, with an
// in-memory fallback for read-only filesystems (Vercel). No auth, no DB.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { emptyProgress, type Progress } from "@/types/lesson";
import { loadCourse } from "./course";

const memory = new Map<string, Progress>();
let fsWritable: boolean | null = null;

function dir(): string {
  return join(process.cwd(), "data", "progress");
}

function key(userId: string, courseId: string): string {
  return `${userId}-${courseId}`;
}

function filePath(userId: string, courseId: string): string {
  return join(dir(), `${key(userId, courseId)}.json`);
}

export function getProgress(userId: string, courseId: string): Progress {
  const k = key(userId, courseId);
  const mem = memory.get(k);
  if (mem) return mem;
  const p = filePath(userId, courseId);
  if (existsSync(p)) {
    try {
      const parsed = JSON.parse(readFileSync(p, "utf8")) as Progress;
      memory.set(k, parsed);
      return parsed;
    } catch {
      // fall through to fresh
    }
  }
  const fresh = emptyProgress(userId, loadCourse(courseId));
  memory.set(k, fresh);
  return fresh;
}

export function saveProgress(progress: Progress): void {
  memory.set(key(progress.userId, progress.courseId), progress);
  if (fsWritable === false) return;
  try {
    mkdirSync(dir(), { recursive: true });
    writeFileSync(filePath(progress.userId, progress.courseId), JSON.stringify(progress, null, 2));
    fsWritable = true;
  } catch {
    fsWritable = false; // e.g. Vercel read-only FS; memory copy still serves this instance
  }
}

export function resetProgress(userId: string, courseId: string): Progress {
  const fresh = emptyProgress(userId, loadCourse(courseId));
  saveProgress(fresh);
  return fresh;
}
