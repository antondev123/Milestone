// Stage demo: one fixed two-leg Listen trip that ends itself, for the pitch. Trips are otherwise
// open-ended, so this is the only place a trip carries a planned leg list.
// Armed by `npm run demo:stage` (progress.demo), consumed when that trip ends. Browsing elsewhere
// disarms it: the demo only fires while the learner is still standing at its first leg, so nobody
// gets yanked back to 2.5 from chapter 3.
import type { Plan, Progress } from "@/types/lesson";
import { hereId } from "./view";

export function demoArmed(progress: Progress): boolean {
  const d = progress.demo;
  return !!d && d.segmentIds.length > 0 && hereId(progress) === d.segmentIds[0];
}

/** The fixed plan: exactly these legs, then the trip ends (see cursor.serveNext). */
export function demoPlan(progress: Progress): Plan {
  const d = progress.demo!;
  return {
    tripId: `trip-${Date.now().toString(36)}`,
    segmentIds: d.segmentIds,
    startAt: { segmentId: d.segmentIds[0], position: "start" },
  };
}
