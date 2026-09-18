"use client";
// Bottom sheet. Phone-only for the assistant (the desktop layout shows it as a column instead);
// with `allSizes` it also renders at lg, as a centred dialog, for the section picker.
import { useEffect } from "react";
import { ChatIcon, CloseIcon } from "@/components/carry/Icons";

export function AssistantSheet({
  open,
  onClose,
  title = "Ask about this passage",
  allSizes = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  allSizes?: boolean;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className={`fixed inset-0 z-30 ${allSizes ? "" : "lg:hidden"}`}>
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-ink/40" />
      <div
        role="dialog"
        aria-label={title}
        className={`absolute inset-x-0 bottom-0 flex h-[62dvh] flex-col rounded-t-[20px] bg-ground px-5 pt-2 pb-4 text-ink ${
          allSizes ? "lg:inset-x-auto lg:top-24 lg:bottom-auto lg:left-1/2 lg:h-auto lg:max-h-[70dvh] lg:w-[560px] lg:-translate-x-1/2 lg:rounded-[20px]" : ""
        }`}
      >
        <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-track lg:hidden" aria-hidden="true" />
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-[22px] font-semibold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="-mr-2 flex h-11 w-11 items-center justify-center">
            <CloseIcon />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** The 56px round button that opens the sheet, floating above the strip. */
export function AssistantFab({ onClick, lifted }: { onClick: () => void; lifted: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Ask about this passage"
      className={`fixed right-5 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-ink text-ground lg:hidden ${lifted ? "bottom-[88px]" : "bottom-6"}`}
    >
      <ChatIcon />
    </button>
  );
}
