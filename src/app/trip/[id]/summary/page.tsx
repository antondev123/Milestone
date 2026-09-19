// The progress artefact. Closing beat of the pitch. Server component, reads the store directly.
// Carry styling (docs/DESIGN.md §4): the trip as a ticket (from, to, the stats), then the milestones
// it earned, no emoji, one primary button.
import Link from "next/link";
import { actionProgress } from "@/lib/actions";
import { DEFAULT_COURSE_ID, loadCourse } from "@/lib/course";
import { findSegment, sectionOf } from "@/types/lesson";
import { milestoneLabel } from "@/lib/milestones";
import { legIndex, tripMinutes } from "@/lib/view";
import { BackLink, Screen, TopBar } from "@/components/carry/Chrome";
import { Group } from "@/components/carry/Group";
import { BookIcon, HeadphonesIcon } from "@/components/carry/Icons";

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
  const legs = legIndex(course);
  // the ticket's ends: the first and last part this trip finished, "2.5.1 Bounded rationality"
  const stop = (segId: string | undefined) => {
    const leg = segId ? legs[segId] : undefined;
    return leg ? { code: `${leg.section}.${leg.partIndex}`, title: findSegment(course, segId!)?.title ?? "" } : null;
  };
  const from = stop(trip.segmentIds[0]);
  const to = trip.segmentIds.length > 1 ? stop(trip.segmentIds.at(-1)) : null;
  const milestones = trip.milestones ?? [];

  return (
    <Screen gap="gap-[22px]">
      <TopBar left={<BackLink href="/" />} title={trip.mode === "voice" ? "Trip done, hands-off" : trip.mode === "study" ? "Session done, hands-on" : "Trip done, read"} />

      <h1 className="font-display text-[34px] leading-[1.12] font-semibold tracking-[-0.015em]">You arrived with progress.</h1>

      <section aria-label="This trip" className="flex flex-col gap-4 rounded-[20px] bg-panel px-[22px] py-5">
        {from && to ? (
          // the little route keeps its own fixed column, so a long leg title wraps in its own column
          // and can never run into it or cut it off
          <div className="grid grid-cols-[minmax(0,1fr)_48px_minmax(0,1fr)] items-start gap-2">
            <TicketStop label="From" stop={from} />
            <svg width="48" height="26" viewBox="0 0 48 26" aria-hidden="true" className="mt-[22px] shrink-0 overflow-visible">
              <line
                className="route-seg"
                style={{ animationDelay: "150ms", strokeDasharray: 36, strokeDashoffset: 36 }}
                x1={6}
                y1={13}
                x2={40}
                y2={13}
                stroke="var(--color-ink)"
                strokeWidth={3}
                strokeLinecap="round"
              />
              <circle cx={6} cy={13} r={4} fill="var(--color-ink)" />
              <circle className="route-pop" style={{ animationDelay: "320ms" }} cx={40} cy={13} r={5.5} fill="var(--color-gold)" stroke="var(--color-ink)" strokeWidth={2.5} />
            </svg>
            <TicketStop label="To" stop={to} />
          </div>
        ) : from ? (
          <TicketStop label="Part finished" stop={from} />
        ) : (
          <p className="font-display text-[22px] leading-[1.2] font-semibold">No part finished this trip</p>
        )}

        {/* perforation: the notches sit on this row only, clear of the stops above */}
        <div className="relative -mx-[22px] h-0 border-t-2 border-dashed border-rule" aria-hidden="true">
          <span className="absolute -top-3 -left-[11px] h-[22px] w-[22px] rounded-full bg-ground" />
          <span className="absolute -top-3 -right-[11px] h-[22px] w-[22px] rounded-full bg-ground" />
        </div>

        <dl className="grid grid-cols-3">
          <Stat big={`${mins} min`} small="on the road" first />
          <Stat big={`${trip.correct}/${trip.total}`} small="checks right" />
          <Stat big={String(trip.streakDays)} small="day streak" />
        </dl>
      </section>

      {milestones.length > 0 && (
        <Group label={milestones.length === 1 ? "Milestone reached" : "Milestones reached"} aside={`${milestones.length} new`} gap="gap-1">
          <ul>
            {milestones.map((m, i) => (
              <li key={m} className="fade-up flex min-h-11 items-center gap-3 border-b border-rule text-base font-semibold" style={{ animationDelay: `${350 + i * 110}ms` }}>
                <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-gold ring-2 ring-ink" aria-hidden="true" />
                {milestoneLabel(m)}
              </li>
            ))}
          </ul>
        </Group>
      )}

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

function TicketStop({ label, stop }: { label: string; stop: { code: string; title: string } }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-[13px] font-semibold text-muted">{label}</span>
      <span className="font-display text-[26px] leading-none font-semibold tabular-nums">{stop.code}</span>
      <span className="text-sm leading-[1.3] break-words hyphens-auto">{stop.title}</span>
    </div>
  );
}

function Stat({ big, small, first = false }: { big: string; small: string; first?: boolean }) {
  return (
    <div className={`flex min-w-0 flex-col gap-1 py-1 ${first ? "" : "border-l border-rule pl-3"}`}>
      <dt className="order-2 text-sm text-muted">{small}</dt>
      <dd className="order-1 font-display text-[28px] leading-none font-semibold whitespace-nowrap">{big}</dd>
    </div>
  );
}
