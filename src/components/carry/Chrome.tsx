// Shared screen furniture: the page frame, top bar, mode pill and the lost-signal notice.
import Link from "next/link";
import { BookIcon, ChevronIcon, HeadphonesIcon } from "./Icons";

/** `dark: "deep"` is the paused Listen screen: one shade darker so paused reads at a squint. */
export function Screen({ children, dark = false, gap = "gap-7" }: { children: React.ReactNode; dark?: boolean | "deep"; gap?: string }) {
  const ground = dark === "deep" ? "bg-ink-deep text-ground" : dark ? "bg-ink text-ground" : "bg-ground text-ink";
  return (
    <div className={`min-h-dvh ${ground}`}>
      <main className={`mx-auto flex min-h-dvh w-full max-w-[430px] flex-col px-6 pt-5 pb-8 ${gap}`}>{children}</main>
    </div>
  );
}

export function BackLink({ href, label = "Back to course" }: { href: string; label?: string }) {
  return (
    <Link href={href} aria-label={label} className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full">
      <ChevronIcon />
    </Link>
  );
}

/** `onTitleClick` makes the title a button (Study: opens the section picker); same text style, small down chevron. */
export function TopBar({ left, title, right, onTitleClick }: { left: React.ReactNode; title: string; right?: React.ReactNode; onTitleClick?: () => void }) {
  return (
    <div className="flex h-11 items-center justify-between gap-3">
      <div className="flex min-w-11 shrink-0">{left}</div>
      {onTitleClick ? (
        <button type="button" onClick={onTitleClick} aria-haspopup="dialog" className="-mx-2 flex min-h-11 min-w-0 items-center gap-0.5 rounded-full px-1 text-[15px] font-semibold">
          <span className="truncate">{title}</span>
          <ChevronIcon size={14} className="shrink-0 -rotate-90" />
        </button>
      ) : (
        <div className="truncate text-[15px] font-semibold">{title}</div>
      )}
      <div className="flex min-w-11 shrink-0 justify-end">{right}</div>
    </div>
  );
}

/** Outlined 44px pill: icon plus a short label. `compact`: icon only below `lg` (the label stays as the accessible name). */
export function Pill({ icon, label, onClick, dark = false, pressed, compact = false }: { icon: React.ReactNode; label: string; onClick: () => void; dark?: boolean; pressed?: boolean; compact?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      aria-label={compact ? label : undefined}
      title={compact ? label : undefined}
      className={`flex min-h-11 items-center gap-2 rounded-[22px] border-2 whitespace-nowrap text-[15px] font-semibold ${compact ? "min-w-11 justify-center lg:px-4" : "px-4"} ${
        dark ? "border-ground text-ground" : "border-ink text-ink"
      }`}
    >
      {icon}
      {compact ? <span className="hidden lg:inline">{label}</span> : label}
    </button>
  );
}

/** "Hands-off instead" / "Hands-on instead". Switching never moves the learner's place. */
export function ModePill({ to, onClick, dark = false, compact = false }: { to: "hands-off" | "hands-on"; onClick: () => void; dark?: boolean; compact?: boolean }) {
  return <Pill icon={to === "hands-off" ? <HeadphonesIcon size={18} /> : <BookIcon size={18} />} label={to === "hands-off" ? "Hands-off instead" : "Hands-on instead"} onClick={onClick} dark={dark} compact={compact} />;
}

export function SignalNotice({ show, dark = false }: { show: boolean; dark?: boolean }) {
  if (!show) return null;
  return (
    <div
      role="status"
      className={`rounded-xl px-4 py-3 text-[15px] font-medium ${dark ? "bg-ink-raised text-ground" : "bg-panel text-ink"}`}
    >
      Lost signal. Your progress is saved. Retrying.
    </div>
  );
}

export function PrimaryButton({
  children,
  onClick,
  href,
  tone = "gold",
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  href?: string;
  tone?: "gold" | "ink" | "ground";
  disabled?: boolean;
}) {
  const cls = `flex min-h-[60px] w-full items-center justify-center gap-3 rounded-2xl px-5 text-lg font-bold disabled:opacity-60 ${
    tone === "gold" ? "bg-gold text-ink" : tone === "ink" ? "bg-ink text-ground" : "bg-ground text-ink"
  }`;
  if (href)
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cls}>
      {children}
    </button>
  );
}
