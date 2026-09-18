// The progress artefact. Closing beat of the pitch. Server component, reads the store directly.
import Link from "next/link";
import { actionProgress } from "@/lib/actions";
import { DEFAULT_COURSE_ID, loadCourse } from "@/lib/course";
import { findSegment } from "@/types/lesson";
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
  const totalSegs = course.modules[0].segments.length;

  return (
    <div className="flex flex-1 flex-col gap-5">
      <div>
        <p className="text-xs uppercase tracking-wide text-emerald-400">Trip complete · {trip.mode === "voice" ? "🚗 driving" : "🚐 taxi"}</p>
        <h1 className="mt-1 text-3xl font-bold">You arrived with progress.</h1>
        <p className="text-slate-400">{mins} min on the road, not wasted.</p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Stat big={String(trip.segmentIds.length)} small={`segment${trip.segmentIds.length === 1 ? "" : "s"} done`} />
        <Stat big={`${trip.correct}/${trip.total}`} small="checkpoints" />
        <Stat big={`${trip.streakDays}🔥`} small={`day streak`} />
      </div>

      <div className="rounded-2xl bg-slate-900 p-4">
        <ProgressBar value={trip.modulePct} label={`${course.modules[0].title} · ${progress.segmentsCompleted.length}/${totalSegs} segments`} />
        <ul className="mt-3 flex flex-col gap-1 text-sm">
          {course.modules[0].segments.map((s) => {
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
          {nextSeg?.title ?? "Course complete"}
          {progress.resume.position === "checkpoint" && nextSeg ? " · checkpoint" : ""}
        </p>
      </div>

      <div className="mt-auto flex gap-2">
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
