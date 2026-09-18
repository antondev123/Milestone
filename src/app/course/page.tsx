// Course map: every chapter and section, with progress. Nothing is locked. Server component.
import Link from "next/link";
import { actionProgress } from "@/lib/actions";
import { DEFAULT_COURSE_ID, loadCourse } from "@/lib/course";
import { chapterPct, legsRemaining, place } from "@/lib/say";
import { ProgressBar } from "@/components/ProgressBar";

export const dynamic = "force-dynamic";

export default function CourseMap() {
  const course = loadCourse(DEFAULT_COURSE_ID);
  const progress = actionProgress();
  const done = new Set(progress.segmentsCompleted);
  const here = progress.cursor?.segmentId ?? progress.resume.segmentId;
  const herePlace = place(course, here);
  const totalSegs = course.chapters.reduce((a, c) => a + c.segments.length, 0);
  const coursePct = Math.round((done.size / Math.max(1, totalSegs)) * 100);
  const pending = new Set(progress.pendingQuizzes ?? []);
  const quizScore = (chapterId: string) => progress.quizResults?.filter((q) => q.chapterId === chapterId).at(-1);

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div>
        <p className="text-xs uppercase tracking-wide text-emerald-400">Course map</p>
        <h1 className="mt-1 text-2xl font-bold">{course.title}</h1>
        <p className="text-sm text-slate-400">
          {course.chapters.length} chapters · {course.chapters.reduce((a, c) => a + c.sections.length, 0)} sections · 🔥 {progress.streakDays}-day streak
        </p>
      </div>
      <ProgressBar value={coursePct} label={`${done.size} of ${totalSegs} parts ready to hear`} />

      {herePlace && (
        <Link href="/learn/text" className="rounded-xl bg-emerald-500 px-4 py-3 text-center font-bold text-slate-950">
          ▶ Resume {herePlace.section.number} · {herePlace.segment.title}
        </Link>
      )}

      <div className="flex flex-col gap-2">
        {course.chapters.map((ch) => {
          const pct = chapterPct(progress, ch);
          const teachable = ch.sections.filter((s) => s.segments.length > 0);
          const isHere = herePlace?.chapter.id === ch.id;
          const state = ch.segments.length === 0 ? "○" : pct === 100 ? "✓ 🏅" : pct > 0 || isHere ? "◐" : "○";
          const score = quizScore(ch.id);
          return (
            <details key={ch.id} open={isHere} className="rounded-2xl bg-slate-900 p-3">
              <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
                <span className="w-8 text-slate-500">{state}</span>
                <span className="flex-1">
                  {ch.number}. {ch.title}
                </span>
                <span className="text-xs text-slate-500">{ch.segments.length ? `${pct}%` : "text only"}</span>
              </summary>
              <ul className="mt-2 flex flex-col gap-1 text-sm">
                {ch.sections
                  .filter((s) => s.kind !== "summary")
                  .map((s) => {
                    const segsDone = s.segments.filter((g) => done.has(g.id)).length;
                    const secHere = herePlace?.section.id === s.id;
                    const mark = !s.segments.length ? "·" : secHere ? "▶" : segsDone === s.segments.length ? "✓" : segsDone > 0 ? "◐" : "○";
                    const inner = (
                      <span className={`flex items-center gap-2 ${!s.segments.length ? "text-slate-600" : secHere ? "text-emerald-300" : ""}`}>
                        <span className="w-4 text-slate-500">{mark}</span>
                        <span className="flex-1">
                          {s.number} {s.title}
                        </span>
                        {s.segments.length > 1 && <span className="text-[10px] text-slate-500">{secHere && herePlace ? `part ${herePlace.partIndex} of ${s.segments.length}` : `${s.segments.length} parts`}</span>}
                      </span>
                    );
                    return (
                      <li key={s.id}>
                        {s.segments.length ? (
                          <Link href={`/learn/text?goto=${encodeURIComponent(`section ${s.number}`)}`} className="block rounded-lg px-1 py-1 hover:bg-slate-800">
                            {inner}
                          </Link>
                        ) : (
                          <span className="block px-1 py-1" title="Not yet transposed to audio">
                            {inner}
                          </span>
                        )}
                      </li>
                    );
                  })}
                {ch.quizFile && (
                  <li>
                    <Link href={`/learn/text?goto=${encodeURIComponent(`quiz me on chapter ${ch.number}`)}`} className="flex items-center gap-2 rounded-lg px-1 py-1 hover:bg-slate-800">
                      <span className="w-4 text-slate-500">{score ? "✓" : pending.has(ch.id) ? "!" : "Q"}</span>
                      <span className="flex-1">Chapter quiz</span>
                      <span className="text-[10px] text-slate-500">{score ? `${score.correct}/${score.total}` : pending.has(ch.id) ? "pending" : "6 questions"}</span>
                    </Link>
                  </li>
                )}
                {teachable.length > 0 && pct < 100 && (
                  <li className="px-1 pt-1 text-[11px] text-slate-500">~{legsRemaining(course, progress, ch)} more commutes to finish this chapter</li>
                )}
              </ul>
            </details>
          );
        })}
      </div>

      {course.license && <p className="text-[11px] text-slate-500">{course.license.attribution}</p>}
      <div className="flex gap-2">
        <Link href="/learn/text" className="flex-1 rounded-xl bg-slate-800 px-4 py-3 text-center text-sm font-semibold">🚐 Taxi</Link>
        <Link href="/learn/voice" className="flex-1 rounded-xl bg-slate-800 px-4 py-3 text-center text-sm font-semibold">🚗 Drive</Link>
      </div>
    </div>
  );
}
