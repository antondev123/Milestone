// Session planner: fit N segments into the minutes the user has. See docs/OUTLINE.md §5.
import {
  CHECKPOINT_OVERHEAD_SEC,
  INTRO_SEC,
  MAX_SEGMENTS_PER_TRIP,
  allSegments,
  type Course,
  type Mode,
  type Plan,
  type Progress,
  type Segment,
} from "@/types/lesson";

export function segmentCostSec(seg: Segment, mode: Mode): number {
  return seg.durationSec + seg.checkpoint.length * CHECKPOINT_OVERHEAD_SEC[mode];
}

export function planTrip(course: Course, progress: Progress, minutes: number, mode: Mode): Plan {
  const segments = allSegments(course);
  const done = new Set(progress.segmentsCompleted);

  // 1. start at resume pointer, else first incomplete segment
  let startIdx = segments.findIndex((s) => s.id === progress.resume.segmentId);
  if (startIdx < 0 || done.has(segments[startIdx].id)) {
    startIdx = segments.findIndex((s) => !done.has(s.id));
  }
  if (startIdx < 0) startIdx = 0; // course finished: replay from the top

  // 2–4. greedy fill
  let budget = minutes * 60 - INTRO_SEC;
  const picked: Segment[] = [];
  for (let i = startIdx; i < segments.length && picked.length < MAX_SEGMENTS_PER_TRIP; i++) {
    const seg = segments[i];
    if (done.has(seg.id) && picked.length > 0) continue;
    const cost = segmentCostSec(seg, mode);
    if (cost > budget && picked.length > 0) break;
    picked.push(seg);
    budget -= cost;
  }

  const estMinutes = Math.round(
    (INTRO_SEC + picked.reduce((a, s) => a + segmentCostSec(s, mode), 0)) / 60,
  );

  return {
    tripId: `trip-${Date.now().toString(36)}`,
    segmentIds: picked.map((s) => s.id),
    estMinutes,
    startAt: { segmentId: picked[0].id, position: progress.resume.segmentId === picked[0].id ? progress.resume.position : "start" },
  };
}
