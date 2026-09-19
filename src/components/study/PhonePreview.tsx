"use client";
// Desktop-only "Phone" preview: the same route in an iframe sized like a phone, so every breakpoint,
// matchMedia check, sheet and FAB resolve exactly as on a handset. Nothing inside is mocked.
import { useEffect } from "react";
import { PhoneIcon } from "@/components/carry/Icons";

export const PHONE_W = 390;
export const PHONE_H = 844;

export function PhoneButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Preview the phone layout"
      aria-label="Phone preview"
      className="ml-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-rule text-muted hover:text-ink"
    >
      <PhoneIcon size={18} />
    </button>
  );
}

export function PhonePreview({
  open,
  onClose,
  src,
}: {
  open: boolean;
  onClose: () => void;
  src: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    // zoom: 1 keeps the device frame at true pixels regardless of the page's desktop scaling
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-ink/70 p-6"
      style={{ zoom: 1 }}
      role="dialog"
      aria-label="Phone preview"
    >
      <div className="relative">
        <div
          className="overflow-hidden rounded-[44px] border-[10px] border-ink-deep bg-ink-deep shadow-2xl"
          style={{
            width: PHONE_W + 20,
            height: PHONE_H + 20,
            maxHeight: "calc(100dvh - 48px)",
          }}
        >
          <iframe
            src={src}
            title="Phone preview"
            className="h-full w-full rounded-[34px] bg-ground"
            style={{ width: PHONE_W }}
          />
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close phone preview"
          className="absolute -top-3 -right-3 flex h-10 w-10 items-center justify-center rounded-full bg-ground text-xl font-bold text-ink shadow"
        >
          ×
        </button>
      </div>
    </div>
  );
}
