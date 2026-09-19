// Screen 1, Resume (docs/DESIGN.md §4.1), the "departure board": the chapter and its route on an ink
// header, then where you stopped and how you are studying today on sand. The cut-off on the card is
// the core proof: it comes from the cursor, the same position the text and voice modes read from.
import Link from "next/link";
import { actionProgress } from "@/lib/actions";
import { DEFAULT_COURSE_ID, loadCourse } from "@/lib/course";
import { courseFinished, currentChapter, hereId, legIndex, resumeCard, routeState } from "@/lib/view";
import { RouteLine } from "@/components/carry/RouteLine";
import { NoBreak } from "@/components/carry/Chrome";
import { Group, GroupLabel, Hairline } from "@/components/carry/Group";
import { MilestoneLogo } from "@/components/carry/MilestoneLogo";
import { BookIcon, HeadphonesIcon } from "@/components/carry/Icons";

export const dynamic = "force-dynamic";

const headerLink = "flex min-h-11 items-center whitespace-nowrap px-1 text-[15px] font-semibold underline underline-offset-4";

export default function Resume() {
  const course = loadCourse(DEFAULT_COURSE_ID);
  const progress = actionProgress();
  const finished = courseFinished(course, progress);
  const chapter = currentChapter(course, progress);
  const leg = legIndex(course)[hereId(progress)];
  const route = routeState(chapter, progress, (n) => `Leg ${n}`);
  const doneInChapter = route.done.filter(Boolean).length;
  const card = finished ? null : resumeCard(course, progress, leg);

  return (
    <div className="flex min-h-dvh flex-col bg-ground text-ink">
      <header className="bg-ink text-ground">
        <div className="mx-auto flex w-full max-w-[430px] flex-col gap-[22px] px-6 pt-5 pb-7">
          <div className="flex h-12 items-center justify-between gap-3">
            {/* 44px tall (136 wide) wherever it fits; on a 320px phone it gives way to the links */}
            <h1 className="flex max-w-[136px] min-w-0 flex-1">
              <MilestoneLogo theme="dark" height={44} className="h-auto w-full" />
            </h1>
            <div className="flex shrink-0 items-center gap-3">
              <Link href="/settings" className={headerLink}>
                Settings
              </Link>
              <Link href="/progress" className={headerLink}>
                Your progress
              </Link>
            </div>
          </div>

          <div className="flex flex-col gap-2.5">
            <div className="flex items-baseline justify-between gap-4 text-sm text-muted-on-ink">
              <span className="font-semibold">Chapter {chapter.number}</span>
              <span className="shrink-0 tabular-nums">
                {doneInChapter} of {route.total} legs done
              </span>
            </div>
            <h2 className="mb-2 font-display text-[30px] leading-[1.1] font-semibold tracking-[-0.015em]">
              <NoBreak text={chapter.shortTitle || chapter.title} />
            </h2>
            <RouteLine route={route} dark />
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[430px] flex-1 flex-col gap-6 px-6 pt-6 pb-8">
        {finished ? (
          <Group>
            <h2 className="font-display text-[34px] leading-[1.12] font-semibold tracking-[-0.015em]">You finished the course.</h2>
          </Group>
        ) : (
          card && (
            <Group label={card.context}>
              <p className="font-display text-[23px] leading-[1.35] italic">{card.fragment}</p>
              <Hairline />
              <div className="text-[15px] text-muted">{card.footer}</div>
            </Group>
          )
        )}

        <div className="mt-auto flex flex-col gap-3">
          <div className="h-0.5 bg-ink" aria-hidden="true" />
          {finished ? (
            <Link href="/progress" className="flex min-h-[60px] items-center justify-center rounded-2xl bg-ink px-5 text-lg font-bold text-ground">
              See your progress
            </Link>
          ) : (
            <>
              <GroupLabel>How are you studying today?</GroupLabel>
              <Link href="/learn/voice" className="flex min-h-[72px] items-center gap-4 rounded-2xl bg-ink px-5 py-3 text-ground">
                <HeadphonesIcon size={26} />
                <span className="flex flex-col gap-0.5">
                  <span className="text-lg font-bold">Hands-off</span>
                  <span className="text-sm font-medium text-muted-on-ink">Just listen, answer out loud</span>
                </span>
              </Link>
              <Link href="/learn/study" className="flex min-h-[72px] items-center gap-4 rounded-2xl bg-panel px-5 py-3 text-ink">
                <BookIcon size={26} />
                <span className="flex flex-col gap-0.5">
                  <span className="text-lg font-bold">Hands-on</span>
                  <span className="text-sm font-medium text-muted">Read along, tap any line to ask</span>
                </span>
              </Link>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
