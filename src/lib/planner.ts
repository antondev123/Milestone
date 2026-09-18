// Session planner: trips are open-ended (they run until the learner ends them), so all the
// planner does is pick where the trip starts. See docs/OUTLINE.md §5.
import { allSegments, type Course, type Mode, type Plan, type Progress } from "@/types/lesson";

export function planTrip(course: Course, progress: Progress, _mode: Mode): Plan {
  const segments = allSegments(course);
  const done = new Set(progress.segmentsCompleted);

  // start at resume pointer, else first incomplete segment
  let startIdx = segments.findIndex((s) => s.id === progress.resume.segmentId);
  if (startIdx < 0 || done.has(segments[startIdx].id)) {
    startIdx = segments.findIndex((s) => !done.has(s.id));
  }
  if (startIdx < 0) startIdx = 0; // course finished: replay from the top
  const first = segments[startIdx];

  return {
    tripId: `trip-${Date.now().toString(36)}`,
    segmentIds: [],
    startAt: { segmentId: first.id, position: progress.resume.segmentId === first.id ? progress.resume.position : "start" },
  };
}
