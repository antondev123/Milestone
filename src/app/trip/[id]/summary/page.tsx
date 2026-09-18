// The progress artefact. Closing beat of the pitch. Server component, reads the store directly.
// Carry styling (docs/DESIGN.md): route line for the chapter, no emoji, one primary button.
import Link from "next/link";
import { actionProgress } from "@/lib/actions";
import { DEFAULT_COURSE_ID, loadCourse } from "@/lib/course";
import { chapterOf, findSegment, sectionOf } from "@/types/lesson";
import { routeState, tripMinutes } from "@/lib/view";
import { BackLink, Screen, TopBar } from "@/components/carry/Chrome";
import { RouteLine } from "@/components/carry/RouteLine";
import { CheckIcon, HeadphonesIcon, LinesIcon } from "@/components/carry/Icons";

export const dynamic = "force-dynamic";

function pretty(topic: string) {
  return topic.replace(/-/g, " ");
}

export default async function Summary({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const progress = actionProgress();
  const course = loadCourse(DEFAULT_COURSE_ID);
  const trip = progress.trips.find((t) => t.tripId === id) ?? progress.trips.at(-1);
  if (!trip) {
    return (
      <Screen>
        <TopBar left={<BackLink href="/" />} title="Trip" />
        <p className="text-[17px]">No trip found.</p>
      </Screen>
    );
  }
  const mins = tripMinutes(trip);
  const nextSeg = findSegment(course, progress.resume.segmentId);
  const nextSection = nextSeg ? sectionOf(course, nextSeg.id) : undefined;
  const anchorId = progress.segmentsCompleted.at(-1) ?? progress.resume.segmentId;
  const chapter = chapterOf(course, anchorId) ?? course.chapters[0];
  const totalSegs = chapter.segments.length;
  const doneInChapter = progress.segmentsCompleted.filter((sid) => sid.startsWith(chapter.id + "/")).length;
  const route = routeState(chapter, progress, (n) => `Next: leg ${n}`);
  const pendingQuiz = progress.pendingQuizzes?.[0]?.split("/c")[1];

  return (
    <Screen gap="gap-[26px]">
      <TopBar left={<BackLink href="/" />} title={trip.mode === "voice" ? "Trip done, listened" : trip.mode === "study" ? "Session done, studied" : "Trip done, read"} />

      <div className="flex flex-col gap-2">
        <h1 className="font-display text-[34px] leading-[1.12] font-semibold tracking-[-0.015em]">You arrived with progress.</h1>
        <p className="text-[17px] text-muted">{mins} min on the road, not wasted.</p>
      </div>

      <dl className="grid grid-cols-3 gap-3">
        <Stat big={String(trip.segmentIds.length)} small={`leg${trip.segmentIds.length === 1 ? "" : "s"} done`} />
        <Stat big={`${trip.correct}/${trip.total}`} small="checks right" />
        <Stat big={String(trip.streakDays)} small={`day streak`} />
      </dl>

      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-4">
          <div className="font-display text-xl font-semibold">
            Chapter {chapter.number}: {chapter.shortTitle}
          </div>
          <div className="shrink-0 text-[15px] text-muted">
            {doneInChapter} of {totalSegs} legs
          </div>
        </div>
        <RouteLine route={route} currentWord="next" />
        <ul className="flex flex-col">
          {chapter.segments.map((s, i) => {
            const done = progress.segmentsCompleted.includes(s.id);
            const thisTrip = trip.segmentIds.includes(s.id);
            return (
              <li key={s.id} className={`flex min-h-11 items-center gap-3 border-t border-rule text-[15px] last:border-b ${done ? "" : "text-muted"}`}>
                <span className="w-5 shrink-0">{done ? <CheckIcon size={18} /> : <span className="sr-only">Not done</span>}</span>
                <span className="flex-1">
                  Leg {i + 1}. {s.title}
                </span>
                {thisTrip && <span className="shrink-0 rounded-xl bg-panel px-2 py-0.5 text-sm font-semibold text-ink">this trip</span>}
              </li>
            );
          })}
        </ul>
      </div>

      {trip.explored && trip.explored.length > 0 && (
        <div className="flex flex-col gap-1 rounded-[20px] bg-panel p-[18px]">
          <div className="text-[15px] font-semibold">You explored</div>
          <ul className="text-[15px]">
            {trip.explored.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      )}

      {pendingQuiz && (
        <Link href={`/learn/text?goto=${encodeURIComponent(`quiz me on chapter ${pendingQuiz}`)}`} className="flex flex-col gap-1 rounded-2xl border-2 border-ink p-[18px]">
          <span className="text-[15px] text-muted">Quiz waiting</span>
          <span className="text-[17px] font-semibold">Chapter {pendingQuiz} review, about two minutes</span>
        </Link>
      )}

      {(trip.mastered.length > 0 || trip.weak.length > 0) && (
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1 rounded-[20px] bg-panel p-[18px]">
            <div className="text-[15px] font-semibold">Solid</div>
            <ul className="text-[15px]">{trip.mastered.length ? trip.mastered.map((t) => <li key={t}>{pretty(t)}</li>) : <li className="text-muted">Keep going</li>}</ul>
          </div>
          <div className="flex flex-col gap-1 rounded-[20px] bg-panel p-[18px]">
            <div className="text-[15px] font-semibold">Worth another look</div>
            <ul className="text-[15px]">{trip.weak.length ? trip.weak.map((t) => <li key={t}>{pretty(t)}</li>) : <li className="text-muted">Nothing yet</li>}</ul>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1">
        <div className="text-[15px] text-muted">Next leg picks up at</div>
        <div className="text-[17px] font-semibold">
          {nextSection ? `${nextSection.number} ${nextSection.title}, ` : ""}
          {nextSeg?.title ?? "Course complete"}
          {progress.resume.position === "checkpoint" && nextSeg ? ", check" : ""}
        </div>
      </div>

      {course.license && <p className="text-sm text-muted">{course.license.attribution}</p>}

      <div className="mt-auto flex flex-col gap-3">
        <Link href="/learn/text" className="flex min-h-[60px] items-center justify-center gap-3 rounded-2xl bg-gold px-5 text-lg font-bold text-ink">
          <LinesIcon />
          Read the next leg
        </Link>
        <div className="flex items-center justify-between">
          <Link href="/learn/voice" className="flex min-h-11 items-center gap-2 text-[15px] font-semibold underline underline-offset-4">
            <HeadphonesIcon size={18} />
            Listen instead
          </Link>
          <Link href="/course" className="flex min-h-11 items-center text-[15px] font-semibold underline underline-offset-4">
            All chapters
          </Link>
        </div>
      </div>
    </Screen>
  );
}

function Stat({ big, small }: { big: string; small: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-[20px] bg-panel p-4">
      <dt className="order-2 text-sm text-muted">{small}</dt>
      <dd className="order-1 font-display text-[34px] leading-none font-semibold">{big}</dd>
    </div>
  );
}
