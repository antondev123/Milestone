// Screen 1, Resume (docs/DESIGN.md §4.1). The cut-off on the card is the core proof: it comes
// from the cursor, the same position the text and voice modes read from.
import Link from "next/link";
import { actionProgress } from "@/lib/actions";
import { DEFAULT_COURSE_ID, loadCourse } from "@/lib/course";
import { courseFinished, currentChapter, greeting, hereId, legIndex, resumeCard, routeState } from "@/lib/view";
import { RouteLine } from "@/components/carry/RouteLine";
import { Screen } from "@/components/carry/Chrome";
import { BookIcon, HeadphonesIcon, LinesIcon } from "@/components/carry/Icons";

export const dynamic = "force-dynamic";

export default function Resume() {
  const course = loadCourse(DEFAULT_COURSE_ID);
  const progress = actionProgress();
  const finished = courseFinished(course, progress);
  const chapter = currentChapter(course, progress);
  const leg = legIndex(course)[hereId(progress)];
  const route = routeState(chapter, progress, (n) => `Leg ${n}`);
  const doneInChapter = route.done.filter(Boolean).length;
  const card = finished ? null : resumeCard(course, progress, leg?.n ?? 1);
  const fresh = progress.segmentsCompleted.length === 0 && progress.trips.length === 0 && !progress.cursor?.served;

  return (
    <Screen>
      <div className="flex h-11 items-center justify-between">
        <div className="font-display text-[26px] font-semibold tracking-[-0.01em]">Milestone</div>
        <div className="flex items-center gap-3">
          <Link href="/settings" className="flex min-h-11 items-center px-1 text-[15px] font-semibold underline underline-offset-4">
            Settings
          </Link>
          <Link href="/progress" className="flex min-h-11 items-center px-1 text-[15px] font-semibold underline underline-offset-4">
            Your progress
          </Link>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="text-[15px] text-muted">{greeting()}</div>
        <h1 className="font-display text-[34px] leading-[1.12] font-semibold tracking-[-0.015em]">
          {finished ? "You finished the course." : fresh ? "Your first leg is ready." : "Pick up where your last trip ended."}
        </h1>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-4">
          <div className="font-display text-xl font-semibold">
            Chapter {chapter.number}: {chapter.shortTitle}
          </div>
          <div className="shrink-0 text-[15px] text-muted">
            {doneInChapter} of {route.total} legs done
          </div>
        </div>
        <RouteLine route={route} />
      </div>

      {card && (
        <div className="flex flex-col gap-3 rounded-[20px] bg-panel px-[22px] pt-[22px] pb-5">
          <div className="text-[15px] text-muted">{card.context}</div>
          <p className="font-display text-[23px] leading-[1.35] italic">{card.fragment}</p>
          <div className="text-[15px] text-muted">{card.footer}</div>
        </div>
      )}

      <div className="mt-auto flex flex-col gap-3">
        {finished ? (
          <Link href="/progress" className="flex min-h-[60px] items-center justify-center rounded-2xl bg-ink px-5 text-lg font-bold text-ground">
            See your progress
          </Link>
        ) : (
          <>
            <div className="text-[17px] font-semibold">How are you travelling today?</div>
            <Link href="/learn/text" className="flex min-h-[68px] items-center gap-4 rounded-2xl bg-gold px-5 py-3 text-ink">
              <LinesIcon size={26} />
              <span className="flex flex-col gap-0.5">
                <span className="text-lg font-bold">Read quietly</span>
                <span className="text-sm font-medium">Short text, tap to answer</span>
              </span>
            </Link>
            <Link href="/learn/voice" className="flex min-h-[68px] items-center gap-4 rounded-2xl bg-ink px-5 py-3 text-ground">
              <HeadphonesIcon size={26} />
              <span className="flex flex-col gap-0.5">
                <span className="text-lg font-bold">Listen</span>
                <span className="text-sm font-medium">Audio, answer out loud or type</span>
              </span>
            </Link>
            <Link href="/learn/study" className="flex min-h-[68px] items-center gap-4 rounded-2xl bg-panel px-5 py-3 text-ink">
              <BookIcon size={26} />
              <span className="flex flex-col gap-0.5">
                <span className="text-lg font-bold">Study</span>
                <span className="text-sm font-medium">Not travelling: the book, read aloud, ask anything</span>
              </span>
            </Link>
          </>
        )}
      </div>
    </Screen>
  );
}
