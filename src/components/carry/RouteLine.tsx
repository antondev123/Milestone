// The route line is the brand: one stop per leg (docs/DESIGN.md §3).
// Laid out on the 342×48 canvas; stop spacing stretches to fit however many legs the course has.
import type { RouteState } from "@/lib/view";

const W = 342;
const Y = 16;
const PAD = 13;

function describe(r: RouteState, currentWord: string): string {
  const done = r.done.map((d, i) => (d ? i + 1 : 0)).filter(Boolean);
  const parts: string[] = [];
  if (done.length === r.total) return `All ${r.total} legs done`;
  if (done.length === 1) parts.push(`Leg ${done[0]} done`);
  else if (done.length > 1) parts.push(`${done.length} legs done`);
  if (r.current !== null) parts.push(`leg ${r.current + 1} ${currentWord}`);
  const after = r.done.filter((d, i) => !d && i !== r.current).length;
  if (after) parts.push(`${after} leg${after === 1 ? "" : "s"} to go`);
  return parts.join(", ");
}

export function RouteLine({ route, currentWord = "in progress" }: { route: RouteState; currentWord?: string }) {
  const n = Math.max(1, route.total);
  const step = n === 1 ? 0 : (W - PAD * 2) / (n - 1);
  const x = (i: number) => PAD + i * step;
  // solid ink up to the furthest finished-or-current stop, dashed after it
  const lastSolid = route.current ?? route.done.lastIndexOf(true);
  // keep the label on the canvas: hug the stop's outer edge at either end of the line
  const cx = route.current === null ? 0 : x(route.current);
  const anchor = cx < 40 ? "start" : cx > W - 40 ? "end" : "middle";
  const labelX = anchor === "start" ? cx - 12 : anchor === "end" ? cx + 12 : cx;

  return (
    <svg width="100%" viewBox={`0 0 ${W} 48`} role="img" aria-label={describe(route, currentWord)} className="block max-w-[342px] overflow-visible">
      {lastSolid > 0 && <line x1={x(0)} y1={Y} x2={x(lastSolid)} y2={Y} stroke="var(--color-ink)" strokeWidth={3} strokeLinecap="round" />}
      {lastSolid < n - 1 && (
        <line
          x1={x(Math.max(0, lastSolid))}
          y1={Y}
          x2={x(n - 1)}
          y2={Y}
          stroke="var(--color-muted)"
          strokeWidth={2}
          strokeDasharray="4 6"
          strokeLinecap="round"
        />
      )}
      {route.done.map((d, i) =>
        i === route.current ? (
          <circle key={i} cx={x(i)} cy={Y} r={11} fill="var(--color-gold)" stroke="var(--color-ink)" strokeWidth={3} />
        ) : d ? (
          <circle key={i} cx={x(i)} cy={Y} r={7} fill="var(--color-ink)" />
        ) : (
          <circle key={i} cx={x(i)} cy={Y} r={6} fill="var(--color-ground)" stroke="var(--color-muted)" strokeWidth={2} />
        ),
      )}
      {route.label && route.current !== null && (
        <text x={labelX} y={44} textAnchor={anchor} fontSize={13} fontWeight={600} fill="var(--color-ink)" style={{ fontFamily: "var(--font-sans)" }}>
          {route.label}
        </text>
      )}
    </svg>
  );
}
