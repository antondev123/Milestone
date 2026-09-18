// Progress store: JSON file per user+course under data/progress, with an
// in-memory fallback for read-only filesystems (Vercel). No auth, no DB.
// The file is the source of truth when it exists: dev bundles (route handlers vs server
// components) each have their own module instance, so memory alone goes stale.
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { emptyProgress, type Progress } from "@/types/lesson";
import { loadCourse } from "./course";

const memory = new Map<string, { progress: Progress; mtime: number }>();
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
  const p = filePath(userId, courseId);
  const mem = memory.get(k);
  let mtime = 0;
  try {
    if (existsSync(p)) mtime = statSync(p).mtimeMs;
  } catch {
    mtime = 0;
  }
  if (mem && (mtime === 0 || mem.mtime >= mtime)) return mem.progress;
  if (mtime > 0) {
    try {
      const parsed = JSON.parse(readFileSync(p, "utf8")) as Progress;
      memory.set(k, { progress: parsed, mtime });
      return parsed;
    } catch {
      // fall through to fresh
    }
  }
  if (mem) return mem.progress;
  const fresh = emptyProgress(userId, loadCourse(courseId));
  memory.set(k, { progress: fresh, mtime: 0 });
  return fresh;
}

export function saveProgress(progress: Progress): void {
  const k = key(progress.userId, progress.courseId);
  const entry = { progress, mtime: Date.now() };
  memory.set(k, entry);
  if (fsWritable === false) return;
  try {
    mkdirSync(dir(), { recursive: true });
    const p = filePath(progress.userId, progress.courseId);
    writeFileSync(p, JSON.stringify(progress, null, 2));
    entry.mtime = statSync(p).mtimeMs;
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
