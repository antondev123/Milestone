// The progress artefact. Closing beat of the pitch. Server component, reads the store directly.
import Link from "next/link";
import { actionProgress } from "@/lib/actions";
import { DEFAULT_COURSE_ID, loadCourse } from "@/lib/course";
import { chapterOf, findSegment, sectionOf } from "@/types/lesson";
import { ProgressBar } from "@/components/ProgressBar";

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
      <div className="flex flex-1 flex-col justify-center gap-4">
        <p>No trip found.</p>
        <Link href="/" className="text-emerald-400">Home</Link>
      </div>
    );
  }
  const mins = Math.max(1, Math.round((new Date(trip.endedAt).getTime() - new Date(trip.startedAt).getTime()) / 60000));
  const nextSeg = findSegment(course, progress.resume.segmentId);
  const nextSection = nextSeg ? sectionOf(course, nextSeg.id) : undefined;
  const anchorId = progress.segmentsCompleted.at(-1) ?? progress.resume.segmentId;
  const chapter = chapterOf(course, anchorId) ?? course.chapters[0];
  const totalSegs = chapter.segments.length;
  const doneInChapter = progress.segmentsCompleted.filter((id) => id.startsWith(chapter.id + "/")).length;

  return (
    <div className="flex flex-1 flex-col gap-5">
      <div>
        <p className="text-xs uppercase tracking-wide text-emerald-400">Trip complete · {trip.mode === "voice" ? "🚗 driving" : "🚐 taxi"}</p>
        <h1 className="mt-1 text-3xl font-bold">You arrived with progress.</h1>
        <p className="text-slate-400">{mins} min on the road, not wasted.</p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Stat big={String(trip.segmentIds.length)} small={`part${trip.segmentIds.length === 1 ? "" : "s"} done`} />
        <Stat big={`${trip.correct}/${trip.total}`} small="checkpoints" />
        <Stat big={`${trip.streakDays}🔥`} small={`day streak`} />
      </div>

      <div className="rounded-2xl bg-slate-900 p-4">
        <ProgressBar value={trip.modulePct} label={`Chapter ${chapter.number} · ${chapter.shortTitle} · ${doneInChapter}/${totalSegs} parts`} />
        <ul className="mt-3 flex flex-col gap-1 text-sm">
          {chapter.segments.map((s) => {
            const done = progress.segmentsCompleted.includes(s.id);
            const thisTrip = trip.segmentIds.includes(s.id);
            return (
              <li key={s.id} className={`flex items-center gap-2 ${done ? "" : "text-slate-500"}`}>
                <span>{done ? "✅" : "○"}</span>
                <span>{s.title}</span>
                {thisTrip && <span className="ml-auto rounded bg-emerald-900/60 px-1.5 text-[10px] text-emerald-300">this trip</span>}
              </li>
            );
          })}
        </ul>
      </div>

      {trip.explored && trip.explored.length > 0 && (
        <div className="rounded-2xl bg-sky-950/50 p-4">
          <p className="text-xs uppercase text-sky-300">You explored</p>
          <ul className="mt-1 text-sm">{trip.explored.map((t) => <li key={t}>{t}</li>)}</ul>
        </div>
      )}

      {(progress.pendingQuizzes ?? []).length > 0 && (
        <Link href={`/learn/text?goto=${encodeURIComponent(`quiz me on chapter ${progress.pendingQuizzes![0].split("/c")[1]}`)}`} className="rounded-2xl border border-amber-700/60 p-4 text-sm">
          <p className="text-xs uppercase text-amber-300">Quiz waiting</p>
          <p className="mt-1 font-medium">Chapter {progress.pendingQuizzes![0].split("/c")[1]} review · 6 questions, about two minutes</p>
        </Link>
      )}

      {(trip.mastered.length > 0 || trip.weak.length > 0) && (
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-emerald-950/60 p-4">
            <p className="text-xs uppercase text-emerald-400">Mastered</p>
            <ul className="mt-1 text-sm">{trip.mastered.length ? trip.mastered.map((t) => <li key={t}>{pretty(t)}</li>) : <li className="text-slate-500">keep going</li>}</ul>
          </div>
          <div className="rounded-2xl bg-rose-950/50 p-4">
            <p className="text-xs uppercase text-rose-300">Revisit</p>
            <ul className="mt-1 text-sm">{trip.weak.length ? trip.weak.map((t) => <li key={t}>{pretty(t)}</li>) : <li className="text-slate-500">nothing yet</li>}</ul>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-slate-800 p-4 text-sm">
        <p className="text-xs uppercase text-slate-400">Next leg picks up at</p>
        <p className="mt-1 font-medium">
          {nextSection ? `${nextSection.number} ${nextSection.title} · ` : ""}
          {nextSeg?.title ?? "Course complete"}
          {progress.resume.position === "checkpoint" && nextSeg ? " · checkpoint" : ""}
        </p>
      </div>

      {course.license && <p className="text-[11px] text-slate-500">{course.license.attribution}</p>}

      <div className="mt-auto flex gap-2">
        <Link href="/course" className="rounded-xl bg-slate-900 px-4 py-4 text-center font-semibold">🗺️</Link>
        <Link href="/learn/text" className="flex-1 rounded-xl bg-slate-800 px-4 py-4 text-center font-semibold">🚐 Next: taxi</Link>
        <Link href="/learn/voice" className="flex-1 rounded-xl bg-slate-800 px-4 py-4 text-center font-semibold">🚗 Next: drive</Link>
      </div>
    </div>
  );
}

function Stat({ big, small }: { big: string; small: string }) {
  return (
    <div className="rounded-2xl bg-slate-900 p-4 text-center">
      <p className="text-2xl font-bold">{big}</p>
      <p className="text-xs text-slate-400">{small}</p>
    </div>
  );
}
