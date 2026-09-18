// Course loading. The manifest (course.json) is small and stays in memory; section lessons
// (sections/*.json) hold the prose and are loaded lazily by id. Read-only at runtime.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  parentId,
  type ChapterQuiz,
  type Course,
  type Question,
  type SectionLesson,
  type Segment,
} from "@/types/lesson";

export const DEFAULT_COURSE_ID = process.env.COURSE_ID ?? "pom";

const manifests = new Map<string, Course>();
const sections = new Map<string, SectionLesson | null>(); // "<courseId>:<sectionId>"
const quizzes = new Map<string, ChapterQuiz | null>();

function courseDir(courseId: string): string {
  return join(process.cwd(), "data", "courses", courseId);
}

/** Manifest: chapters → sections → segment metadata. Sync, cached for the process lifetime. */
export function loadCourse(courseId = DEFAULT_COURSE_ID): Course {
  const hit = manifests.get(courseId);
  if (hit) return hit;
  const path = join(courseDir(courseId), "course.json");
  const course = JSON.parse(readFileSync(path, "utf8")) as Course;
  // legacy shape (sample course): modules with inline segments → treat each module as a chapter with one section
  if (!course.chapters && Array.isArray(course.modules)) {
    course.chapters = course.modules.map((m, i) => {
      const legacy = m as unknown as { id: string; title: string; segments: Segment[] };
      const sectionId = `${legacy.id}/s1`;
      return {
        id: legacy.id,
        number: i + 1,
        title: legacy.title,
        shortTitle: legacy.title,
        objectives: [],
        sections: [
          {
            id: sectionId,
            number: `${i + 1}.1`,
            title: legacy.title,
            kind: "content",
            words: 0,
            status: "ingested",
            sourceFile: "",
            objectives: [],
            keyTerms: [],
            segments: legacy.segments.map((s) => ({ ...s, sectionId: s.sectionId ?? sectionId })),
          },
        ],
        segments: legacy.segments,
      };
    });
    for (const ch of course.chapters) {
      sections.set(`${courseId}:${ch.sections[0].id}`, { id: ch.sections[0].id, title: ch.title, sourceHash: "", model: "", segments: ch.segments as Segment[] });
    }
  }
  for (const ch of course.chapters) ch.segments = ch.sections.flatMap((s) => s.segments);
  course.modules = course.chapters;
  manifests.set(courseId, course);
  return course;
}

/** Full lesson for one section, or null if not ingested. */
export function loadSection(courseId: string, sectionId: string): SectionLesson | null {
  const key = `${courseId}:${sectionId}`;
  if (sections.has(key)) return sections.get(key)!;
  const course = loadCourse(courseId);
  const meta = course.chapters.flatMap((c) => c.sections).find((s) => s.id === sectionId);
  let lesson: SectionLesson | null = null;
  if (meta?.lessonFile) {
    const path = join(courseDir(courseId), meta.lessonFile);
    if (existsSync(path)) lesson = JSON.parse(readFileSync(path, "utf8")) as SectionLesson;
  }
  sections.set(key, lesson);
  return lesson;
}

export function loadSegmentFull(courseId: string, segmentId: string): Segment | undefined {
  return loadSection(courseId, parentId(segmentId))?.segments.find((s) => s.id === segmentId);
}

export function loadChapterQuiz(courseId: string, chapterId: string): ChapterQuiz | null {
  const key = `${courseId}:${chapterId}`;
  if (quizzes.has(key)) return quizzes.get(key)!;
  const ch = loadCourse(courseId).chapters.find((c) => c.id === chapterId);
  let quiz: ChapterQuiz | null = null;
  if (ch?.quizFile) {
    const path = join(courseDir(courseId), ch.quizFile);
    if (existsSync(path)) quiz = JSON.parse(readFileSync(path, "utf8")) as ChapterQuiz;
  }
  quizzes.set(key, quiz);
  return quiz;
}

/** Question with prompt/answer/rubric. Searches segment checkpoints and chapter quizzes ("<chapterId>/quiz/qN"). */
export function loadQuestionFull(courseId: string, questionId: string): Question | undefined {
  const parent = parentId(questionId);
  if (parent.endsWith("/quiz")) {
    return loadChapterQuiz(courseId, parentId(parent))?.questions.find((q) => q.id === questionId);
  }
  return loadSegmentFull(courseId, parent)?.checkpoint.find((q) => q.id === questionId);
}

/** Compact table of contents for LLM prompts (~1.6k tokens for the whole book). */
export function tocForPrompt(courseId = DEFAULT_COURSE_ID): string {
  const course = loadCourse(courseId);
  return course.chapters
    .flatMap((c) => [`${c.number} ${c.title}`, ...c.sections.map((s) => ` ${s.number} ${s.title}${s.status === "ingested" ? "" : " (not yet available as audio)"}`)])
    .join("\n");
}

/** Drop the caches (used by scripts and tests). */
export function clearCourseCache(): void {
  manifests.clear();
  sections.clear();
  quizzes.clear();
}
