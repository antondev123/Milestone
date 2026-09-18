// Timetable grouping (docs/DESIGN.md §3 "Groups and separators"): every group opens with a 2px rule
// and a small label; rows inside it are split by 1px hairlines. No cards around groups.

export function Group({
  label,
  aside,
  children,
  gap = "gap-2.5",
  dark = false,
  className = "",
  as: Tag = "section",
}: {
  label?: React.ReactNode;
  /** Right-aligned note on the label line, e.g. "2 of 8 legs done". */
  aside?: React.ReactNode;
  children: React.ReactNode;
  gap?: string;
  dark?: boolean;
  className?: string;
  as?: "section" | "div" | "nav";
}) {
  return (
    <Tag className={`flex flex-col ${gap} ${className}`}>
      <div className={`h-0.5 shrink-0 ${dark ? "bg-muted-on-ink" : "bg-ink"}`} aria-hidden="true" />
      {(label || aside) && (
        <div className="flex items-baseline justify-between gap-4">
          {label && <GroupLabel dark={dark}>{label}</GroupLabel>}
          {aside && <div className={`shrink-0 text-sm tabular-nums ${dark ? "text-muted-on-ink" : "text-muted"}`}>{aside}</div>}
        </div>
      )}
      {children}
    </Tag>
  );
}

export function GroupLabel({ children, dark = false }: { children: React.ReactNode; dark?: boolean }) {
  return <div className={`text-sm font-semibold ${dark ? "text-muted-on-ink" : "text-muted"}`}>{children}</div>;
}

/** 1px hairline between rows or before a footer line. */
export function Hairline({ dark = false }: { dark?: boolean }) {
  return <div className={`h-px shrink-0 ${dark ? "bg-ink-track" : "bg-rule"}`} aria-hidden="true" />;
}
