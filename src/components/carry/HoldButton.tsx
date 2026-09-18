"use client";
// Listen dial: End needs a 700 ms hold so a bump in the road cannot end a trip. A gold arc fills
// around the button while held; letting go early does nothing.
import { useEffect, useRef, useState } from "react";

const R = 30; // in a 64 box with a 4px stroke
const C = 2 * Math.PI * R;

export function HoldButton({
  onHold,
  onHoldingChange,
  holdMs = 700,
  disabled = false,
  label = "End",
}: {
  onHold: () => void;
  onHoldingChange?: (holding: boolean) => void;
  holdMs?: number;
  disabled?: boolean;
  label?: string;
}) {
  const [holding, setHolding] = useState(false);
  const timer = useRef<number | null>(null);
  const fired = useRef(false);

  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (holding) {
      setHolding(false);
      onHoldingChange?.(false);
    }
  };
  const begin = () => {
    if (disabled || fired.current) return;
    setHolding(true);
    onHoldingChange?.(true);
    timer.current = window.setTimeout(() => {
      fired.current = true;
      setHolding(false);
      onHoldingChange?.(false);
      onHold();
    }, holdMs);
  };
  useEffect(() => () => stop(), []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <button
      type="button"
      onPointerDown={begin}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onContextMenu={(e) => e.preventDefault()}
      disabled={disabled}
      aria-label={`${label} trip (hold)`}
      className={`relative grid h-16 w-16 select-none place-items-center rounded-full text-[14px] font-bold disabled:opacity-40 ${
        holding ? "bg-ground text-ink" : "bg-ink-raised text-ground"
      }`}
      style={{ touchAction: "none", WebkitUserSelect: "none" }}
    >
      {label}
      {holding && (
        <svg viewBox="0 0 64 64" className="pointer-events-none absolute -inset-1.5 h-[76px] w-[76px] -rotate-90" aria-hidden="true">
          <circle
            cx="32"
            cy="32"
            r={R}
            fill="none"
            stroke="var(--color-gold)"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={C}
            style={{ animation: `hold-arc ${holdMs}ms linear forwards` }}
          />
        </svg>
      )}
    </button>
  );
}
