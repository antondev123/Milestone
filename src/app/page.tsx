// Screen 1, Resume. The cut-off sentence on the card is the core proof: protect it.
import Link from "next/link";
import { actionProgress } from "@/lib/actions";
import { DEFAULT_COURSE_ID, loadCourse } from "@/lib/course";
import { fragmentBefore, fragmentFrom, isMidSentence } from "@/lib/text";
import { courseFinished, currentLeg, greeting, legsDone, routeState } from "@/lib/view";
import { RouteLine } from "@/components/carry/RouteLine";
import { Screen } from "@/components/carry/Chrome";
import { HeadphonesIcon, LinesIcon } from "@/components/carry/Icons";

export const dynamic = "force-dynamic";

function timeLeft(durationSec: number, frac: number): string {
  const sec = durationSec * (1 - frac);
  if (sec < 60) return "Less than a minute left in this leg";
  const m = Math.ceil(sec / 60);
  return `About ${m} minute${m === 1 ? "" : "s"} left in this leg`;
}

export default function Resume() {
  const course = loadCourse(DEFAULT_COURSE_ID);
  const progress = actionProgress();
  const finished = courseFinished(course, progress);
  const leg = currentLeg(course, progress);
  const done = legsDone(course, progress);
  const route = routeState(course, progress, (n) => `Leg ${n}`);
  const { script, durationSec } = leg.segment;
  const offset = progress.resume.offset ?? 0;
  const atCheck = progress.resume.position === "checkpoint";
  const fresh = done === 0 && offset === 0 && !atCheck && progress.trips.length === 0 && !progress.activeTrip;

  let heading = "Pick up where your last trip ended.";
  let context: string;
  let fragment: string;
  let footer: string;
  if (finished) {
    heading = "You finished the course.";
    context = `All ${leg.total} legs done`;
    fragment = "";
    footer = "Every leg and check is logged in your progress.";
  } else if (atCheck) {
    context = `You finished reading leg ${leg.number} on your last trip`;
    fragment = `…${fragmentBefore(script, script.length)}`;
    footer = "The check for this leg is next";
  } else if (offset > 0) {
    context = isMidSentence(script, offset) ? "You stopped mid-sentence on your last trip" : "You stopped here on your last trip";
    fragment = `…${fragmentBefore(script, offset)}`;
    footer = timeLeft(durationSec, offset / script.length);
  } else {
    if (fresh) heading = "Your first leg is ready.";
    context = fresh ? `Leg ${leg.number} starts with` : `You finished leg ${leg.number - 1}. Leg ${leg.number} starts with`;
    fragment = `${fragmentFrom(script, 0)}…`;
    footer = timeLeft(durationSec, 0);
  }

  return (
    <Screen>
      <div className="flex h-11 items-center justify-between">
        <div className="font-display text-[26px] font-semibold tracking-[-0.01em]">Carry</div>
        <Link href="/progress" className="flex min-h-11 items-center px-1 text-[15px] font-semibold underline underline-offset-4">
          Your progress
        </Link>
      </div>

      <div className="flex flex-col gap-2">
        <div className="text-[15px] text-muted">{greeting()}</div>
        <h1 className="font-display text-[34px] leading-[1.12] font-semibold tracking-[-0.015em]">{heading}</h1>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-4">
          <div className="font-display text-xl font-semibold">{course.title}</div>
          <div className="shrink-0 text-[15px] text-muted">
            {done} of {leg.total} legs done
          </div>
        </div>
        <RouteLine route={route} />
      </div>

      <div className="flex flex-col gap-3 rounded-[20px] bg-panel px-[22px] pt-[22px] pb-5">
        <div className="text-[15px] text-muted">{context}</div>
        {fragment && <p className="font-display text-[23px] leading-[1.35] italic">{fragment}</p>}
        <div className="text-[15px] text-muted">{footer}</div>
      </div>

      <div className="mt-auto flex flex-col gap-3">
        {finished ? (
          <Link href="/progress" className="flex min-h-[60px] items-center justify-center rounded-2xl bg-ink px-5 text-lg font-bold text-ground">
            See your progress
          </Link>
        ) : (
          <>
            <div className="text-[17px] font-semibold">How are you travelling today?</div>
            <Link href="/read" className="flex min-h-[68px] items-center gap-4 rounded-2xl bg-gold px-5 py-3 text-ink">
              <LinesIcon size={26} />
              <span className="flex flex-col gap-0.5">
                <span className="text-lg font-bold">Read quietly</span>
                <span className="text-sm font-medium">Short text, tap to answer</span>
              </span>
            </Link>
            <Link href="/listen" className="flex min-h-[68px] items-center gap-4 rounded-2xl bg-ink px-5 py-3 text-ground">
              <HeadphonesIcon size={26} />
              <span className="flex flex-col gap-0.5">
                <span className="text-lg font-bold">Listen</span>
                <span className="text-sm font-medium">Audio, answer out loud or tap</span>
              </span>
            </Link>
          </>
        )}
      </div>
    </Screen>
  );
}
