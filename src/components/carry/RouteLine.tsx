// The route line is the brand: one stop per leg, a leg being a section (docs/DESIGN.md §3).
// Laid out on the 342×48 canvas; stop spacing stretches to fit however many legs the chapter has.
// On every load the whole route is drawn dotted with empty stops, then the ink line fills stop by
// stop to where you are (160 ms a leg) and the current stop pops gold, with an ink wedge for the parts
// of that leg already done. Pure CSS, so it also runs on server-rendered pages; reduced motion shows
// the end state at once.
import type { RouteState } from "@/lib/view";

const W = 342;
const Y = 16;
const PAD = 13;
const STEP_MS = 160;
const R_CUR = 11;
const R_WEDGE = 8; // inside the current stop's 3px ring

/** A pie slice of `f` (0–1) of the circle, clockwise from 12 o'clock. */
function wedge(cx: number, cy: number, r: number, f: number): string {
  const a = 2 * Math.PI * f;
  const ex = cx + r * Math.sin(a);
  const ey = cy - r * Math.cos(a);
  return `M${cx} ${cy} L${cx} ${cy - r} A${r} ${r} 0 ${f > 0.5 ? 1 : 0} 1 ${ex.toFixed(2)} ${ey.toFixed(2)} Z`;
}

function describe(r: RouteState, currentWord: string): string {
  const done = r.done.map((d, i) => (d ? i + 1 : 0)).filter(Boolean);
  const parts: string[] = [];
  if (done.length === r.total) return `All ${r.total} legs done`;
  if (done.length === 1) parts.push(`Leg ${done[0]} done`);
  else if (done.length > 1) parts.push(`${done.length} legs done`);
  if (r.current !== null) parts.push(`leg ${r.current + 1} ${currentWord}${r.fraction > 0 ? ` (${Math.round(r.fraction * 100)} percent of it done)` : ""}`);
  const after = r.done.filter((d, i) => !d && i !== r.current).length;
  if (after) parts.push(`${after} leg${after === 1 ? "" : "s"} to go`);
  return parts.join(", ");
}

export function RouteLine({
  route,
  currentWord = "in progress",
  justDone,
  dark = false,
}: {
  route: RouteState;
  currentWord?: string;
  /** 0-based stop finished on the trip being shown: it gets a gold tick as the line passes it. */
  justDone?: number;
  /** On an ink ground (the Resume header): the line and finished stops turn sand, the dotted route muted-on-ink. */
  dark?: boolean;
}) {
  const line = dark ? "var(--color-ground)" : "var(--color-ink)";
  const base = dark ? "var(--color-muted-on-ink)" : "var(--color-muted)";
  const empty = dark ? "var(--color-ink)" : "var(--color-ground)";
  const n = Math.max(1, route.total);
  const step = n === 1 ? 0 : (W - PAD * 2) / (n - 1);
  const x = (i: number) => PAD + i * step;
  // solid ink only joins a finished stop to the next finished-or-current one, so legs skipped by
  // a jump stay hollow on the dotted line instead of looking passed
  const solid = (i: number) => route.done[i] && (route.done[i + 1] || route.current === i + 1);
  const at = (i: number) => ({ animationDelay: `${i * STEP_MS}ms` });
  // keep the label on the canvas: hug the stop's outer edge at either end of the line
  const cx = route.current === null ? 0 : x(route.current);
  const anchor = cx < 40 ? "start" : cx > W - 40 ? "end" : "middle";
  const labelX = anchor === "start" ? cx - 12 : anchor === "end" ? cx + 12 : cx;
  const seg = step + 2;

  return (
    <svg width="100%" viewBox={`0 0 ${W} 48`} role="img" aria-label={describe(route, currentWord)} className="block max-w-[342px] overflow-visible">
      <line x1={x(0)} y1={Y} x2={x(n - 1)} y2={Y} stroke={base} strokeWidth={2} strokeDasharray="4 6" strokeLinecap="round" />
      {route.done.map((_, i) => (
        <circle key={`o${i}`} cx={x(i)} cy={Y} r={6} fill={empty} stroke={base} strokeWidth={2} />
      ))}
      {Array.from({ length: n - 1 }, (_, i) => i).filter(solid).map((i) => (
        <line
          key={`s${i}`}
          className="route-seg"
          style={{ ...at(i), strokeDasharray: seg, strokeDashoffset: seg }}
          x1={x(i)}
          y1={Y}
          x2={x(i + 1)}
          y2={Y}
          stroke={line}
          strokeWidth={3}
          strokeLinecap="round"
        />
      ))}
      {route.done.map((d, i) =>
        d && i !== route.current ? (
          i === justDone ? (
            <g key={`d${i}`}>
              <circle className="route-pop" style={at(i)} cx={x(i)} cy={Y} r={9} fill={line} />
              <path
                className="route-pop"
                style={{ animationDelay: `${i * STEP_MS + 60}ms` }}
                d={`M${x(i) - 4} ${Y}l3 3 5-6`}
                fill="none"
                stroke="var(--color-gold)"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>
          ) : (
            <circle key={`d${i}`} className="route-pop" style={at(i)} cx={x(i)} cy={Y} r={7} fill={line} />
          )
        ) : null,
      )}
      {route.current !== null && (
        <>
          <circle className="route-ring" style={{ animationDelay: `${route.current * STEP_MS + 120}ms` }} cx={cx} cy={Y} r={R_CUR} fill="none" stroke="var(--color-gold)" strokeWidth={3} />
          <circle className="route-pop" style={at(route.current)} cx={cx} cy={Y} r={R_CUR} fill="var(--color-gold)" stroke="var(--color-ink)" strokeWidth={3} />
          {route.fraction > 0 && route.fraction < 1 && (
            // parts of this leg already done: an ink wedge inside the gold stop, clockwise from
            // 12 o'clock like a clock face, faded in after the stop pops
            <path className="route-fade" style={{ animationDelay: `${route.current * STEP_MS + 200}ms` }} d={wedge(cx, Y, R_WEDGE, route.fraction)} fill="var(--color-ink)" />
          )}
        </>
      )}
      {route.label && route.current !== null && (
        <text className="route-fade" style={at(route.current)} x={labelX} y={44} textAnchor={anchor} fontSize={13} fontWeight={600} fill={line} fontFamily="var(--font-sans)">
          {route.label}
        </text>
      )}
    </svg>
  );
}
