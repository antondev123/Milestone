// The progress artefact. Closing beat of the pitch. Server component, reads the store directly.
// Carry styling (docs/DESIGN.md): route line for the chapter, no emoji, one primary button.
import Link from "next/link";
import { actionProgress } from "@/lib/actions";
import { DEFAULT_COURSE_ID, loadCourse } from "@/lib/course";
import { chapterOf, findSegment, sectionOf } from "@/types/lesson";
import { milestoneLabel } from "@/lib/milestones";
import { routeState, tripMinutes } from "@/lib/view";
import { BackLink, Screen, TopBar } from "@/components/carry/Chrome";
import { RouteLine } from "@/components/carry/RouteLine";
import { Group } from "@/components/carry/Group";
import { BookIcon, CheckIcon, HeadphonesIcon } from "@/components/carry/Icons";

export const dynamic = "force-dynamic";

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
  // the furthest stop this trip finished gets the gold tick as the route fills
  const justDone = chapter.segments.reduce((at, s, i) => (trip.segmentIds.includes(s.id) ? i : at), -1);

  return (
    <Screen gap="gap-[26px]">
      <TopBar left={<BackLink href="/" />} title={trip.mode === "voice" ? "Trip done, hands-off" : trip.mode === "study" ? "Session done, hands-on" : "Trip done, read"} />

      <div className="flex flex-col gap-2">
        <h1 className="font-display text-[34px] leading-[1.12] font-semibold tracking-[-0.015em]">You arrived with progress.</h1>
        <p className="text-[17px] text-muted">{mins} min on the road, not wasted.</p>
      </div>

      {/* The milestone card leads: it is the moment the trip earned, and the driver only heard it */}
      {trip.milestones && trip.milestones.length > 0 && (
        <div className="flex flex-col gap-3 rounded-[20px] bg-gold px-[22px] pt-5 pb-[22px] text-ink">
          <div className="text-[15px] font-semibold uppercase tracking-[0.06em]">{trip.milestones.length === 1 ? "Milestone reached" : "Milestones reached"}</div>
          <ul className="flex flex-col gap-2.5">
            {trip.milestones.map((id, i) => (
              <li key={id} className={`flex items-center gap-3 font-display leading-[1.15] font-semibold ${i === 0 ? "text-[28px]" : "text-[21px]"}`}>
                <span className="h-3 w-3 shrink-0 rounded-full bg-ink ring-2 ring-ink/30" aria-hidden="true" />
                {milestoneLabel(id)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Group>
        <dl className="grid grid-cols-3">
          <Stat big={String(trip.segmentIds.length)} small={`leg${trip.segmentIds.length === 1 ? "" : "s"} done`} first />
          <Stat big={`${trip.correct}/${trip.total}`} small="checks right" />
          <Stat big={String(trip.streakDays)} small={`day streak`} />
        </dl>
      </Group>

      <Group label={`Chapter ${chapter.number}: ${chapter.shortTitle}`} aside={`${doneInChapter} of ${totalSegs} legs`}>
        <RouteLine route={route} currentWord="next" justDone={justDone >= 0 ? justDone : undefined} />
        <ul className="flex flex-col">
          {chapter.segments.map((s, i) => {
            const done = progress.segmentsCompleted.includes(s.id);
            const thisTrip = trip.segmentIds.includes(s.id);
            return (
              <li key={s.id} className={`flex min-h-11 items-center gap-3 border-b border-rule text-[15px] ${done ? "" : "text-muted"}`}>
                <span className="w-5 shrink-0">{done ? <CheckIcon size={18} /> : <span className="sr-only">Not done</span>}</span>
                <span className="flex-1">
                  Leg {i + 1}. {s.title}
                </span>
                {thisTrip && <span className="shrink-0 rounded-xl bg-panel px-2 py-0.5 text-sm font-semibold text-ink">this trip</span>}
              </li>
            );
          })}
        </ul>
      </Group>

      {trip.explored && trip.explored.length > 0 && (
        <Group label="You explored" gap="gap-1">
          <ul className="text-[15px]">
            {trip.explored.map((t) => (
              <li key={t} className="flex min-h-11 items-center border-b border-rule">
                {t}
              </li>
            ))}
          </ul>
        </Group>
      )}

      <Group label="Next leg picks up at" gap="gap-1.5">
        <div className="text-[17px] font-semibold">
          {nextSection ? `${nextSection.number} ${nextSection.title}, ` : ""}
          {nextSeg?.title ?? "Course complete"}
          {progress.resume.position === "checkpoint" && nextSeg ? ", check" : ""}
        </div>
      </Group>

      {course.license && <p className="text-sm text-muted">{course.license.attribution}</p>}

      <div className="mt-auto flex flex-col gap-3">
        <Link href="/learn/voice" className="flex min-h-[60px] items-center justify-center gap-3 rounded-2xl bg-gold px-5 text-lg font-bold text-ink">
          <HeadphonesIcon />
          Next leg, hands-off
        </Link>
        <div className="flex items-center justify-between">
          <Link href="/learn/study" className="flex min-h-11 items-center gap-2 text-[15px] font-semibold underline underline-offset-4">
            <BookIcon size={18} />
            Hands-on instead
          </Link>
          <Link href="/course" className="flex min-h-11 items-center text-[15px] font-semibold underline underline-offset-4">
            All chapters
          </Link>
        </div>
      </div>
    </Screen>
  );
}

function Stat({ big, small, first = false }: { big: string; small: string; first?: boolean }) {
  return (
    <div className={`flex flex-col gap-1 py-1 ${first ? "" : "border-l border-rule pl-3.5"}`}>
      <dt className="order-2 text-sm text-muted">{small}</dt>
      <dd className="order-1 font-display text-[34px] leading-none font-semibold">{big}</dd>
    </div>
  );
}
