// Course map: every chapter and section, with progress. Nothing is locked. Server component.
// Carry styling: the current chapter shows its route line; state words instead of symbols.
import Link from "next/link";
import { actionProgress } from "@/lib/actions";
import { DEFAULT_COURSE_ID, loadCourse } from "@/lib/course";
import { chapterPct, legsRemaining, place } from "@/lib/say";
import { routeState } from "@/lib/view";
import { BackLink, Screen, TopBar } from "@/components/carry/Chrome";
import { RouteLine } from "@/components/carry/RouteLine";

export const dynamic = "force-dynamic";

export default function CourseMap() {
  const course = loadCourse(DEFAULT_COURSE_ID);
  const progress = actionProgress();
  const done = new Set(progress.segmentsCompleted);
  const here = progress.cursor?.segmentId ?? progress.resume.segmentId;
  const herePlace = place(course, here);
  const totalSegs = course.chapters.reduce((a, c) => a + c.segments.length, 0);
  const pending = new Set(progress.pendingQuizzes ?? []);
  const quizScore = (chapterId: string) => progress.quizResults?.filter((q) => q.chapterId === chapterId).at(-1);

  return (
    <Screen gap="gap-6">
      <TopBar left={<BackLink href="/" />} title="All chapters" />

      <div className="flex flex-col gap-2">
        <h1 className="font-display text-[34px] leading-[1.12] font-semibold tracking-[-0.015em]">{course.title}</h1>
        <p className="text-[15px] text-muted">
          {course.chapters.length} chapters, {done.size} of {totalSegs} parts done. Nothing is locked.
        </p>
      </div>

      {herePlace && (
        <Link href="/learn/voice" className="flex min-h-[60px] items-center justify-center rounded-2xl bg-gold px-5 text-center text-lg font-bold text-ink">
          Resume {herePlace.section.number}, {herePlace.segment.title}
        </Link>
      )}

      <div className="flex flex-col">
        {course.chapters.map((ch) => {
          const pct = chapterPct(progress, ch);
          const teachable = ch.sections.filter((s) => s.segments.length > 0);
          const isHere = herePlace?.chapter.id === ch.id;
          const state = ch.segments.length === 0 ? "Text only for now" : pct === 100 ? "Done" : `${pct}%`;
          const score = quizScore(ch.id);
          return (
            <details key={ch.id} open={isHere} className={`last:border-b last:border-rule ${isHere ? "border-t-2 border-ink" : "border-t border-rule"}`}>
              <summary className="flex min-h-14 cursor-pointer items-center gap-3 py-2">
                <span className={`flex-1 text-base font-semibold ${ch.segments.length ? "" : "text-muted"}`}>
                  {ch.number}. {ch.title}
                </span>
                <span className="shrink-0 text-sm text-muted">{state}</span>
              </summary>
              <div className="flex flex-col gap-2 pb-4">
                {isHere && <RouteLine route={routeState(ch, progress, (n) => `Leg ${n}`)} />}
                <ul className="flex flex-col">
                  {ch.sections
                    .filter((s) => s.kind !== "summary")
                    .map((s) => {
                      const segsDone = s.segments.filter((g) => done.has(g.id)).length;
                      const secHere = herePlace?.section.id === s.id;
                      const status = !s.segments.length
                        ? ""
                        : secHere
                          ? herePlace && s.segments.length > 1
                            ? `You are here, part ${herePlace.partIndex} of ${s.segments.length}`
                            : "You are here"
                          : segsDone === s.segments.length
                            ? "Done"
                            : s.segments.length > 1
                              ? `${s.segments.length} parts`
                              : "";
                      const inner = (
                        <span className={`flex min-h-11 items-center gap-3 text-[15px] ${!s.segments.length ? "text-muted" : ""} ${secHere ? "font-semibold" : ""}`}>
                          {secHere && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-gold ring-2 ring-ink" aria-hidden="true" />}
                          <span className="flex-1">
                            {s.number} {s.title}
                          </span>
                          {status && <span className="shrink-0 text-sm font-normal text-muted">{status}</span>}
                        </span>
                      );
                      return (
                        <li key={s.id} className="border-b border-rule">
                          {s.segments.length ? (
                            <Link href={`/learn/study?goto=${encodeURIComponent(`section ${s.number}`)}`} className="block">
                              {inner}
                            </Link>
                          ) : (
                            <span className="block" title="Not yet transposed to audio">
                              {inner}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  {ch.quizFile && (
                    <li className="border-b border-rule">
                      {/* quiz status only: taken by voice ("quiz me on chapter N"), no screen of its own */}
                      <div className="flex min-h-11 items-center gap-3 text-[15px]">
                        <span className="flex-1">Chapter quiz</span>
                        <span className="shrink-0 text-sm text-muted">{score ? `${score.correct} of ${score.total}` : pending.has(ch.id) ? "Waiting for you" : "6 questions"}</span>
                      </div>
                    </li>
                  )}
                </ul>
                {teachable.length > 0 && pct < 100 && <p className="text-sm text-muted">About {legsRemaining(course, progress, ch)} more commutes to finish this chapter</p>}
              </div>
            </details>
          );
        })}
      </div>

      {course.license && <p className="text-sm text-muted">{course.license.attribution}</p>}
    </Screen>
  );
}
