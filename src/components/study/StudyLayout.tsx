"use client";
// Study mode frame. Phone: a single column with a sticky top bar and a pinned strip at the bottom.
// Desktop (lg, ≥1024px): the page column on the left and a persistent assistant column on the right;
// the strip pins to the bottom of the page column only.
// Desktop also scales: the whole frame is `zoom`ed with the viewport so the 1240px grid and its px
// type fill a 1920 or 2560 monitor instead of sitting small in the middle. The factor is the smaller
// of width/1280 and height/640, so a wide but short window is not blown up past its own height.
// `zoom` takes part in layout (sticky/fixed still work) and media queries keep reading the real
// viewport — but Chrome multiplies viewport units (dvh) inside a zoomed element by the zoom, so
// every height that must match the real window is computed here from innerHeight instead.
import { useEffect, useState } from "react";

const DESKTOP = 1024; // Tailwind lg, matches the matchMedia checks in StudyPage
const BASE_W = 1280; // width at which the layout is 1:1
const BASE_H = 640; // height at which the layout is 1:1
const MAX = 1.5;

export function desktopZoom(width: number, height: number): number {
  if (width < DESKTOP) return 1;
  return Math.min(MAX, Math.max(1, Math.min(width / BASE_W, height / BASE_H)));
}

function useDesktopZoom() {
  const [state, setState] = useState<{ zoom: number; vh: number | null }>({ zoom: 1, vh: null });
  useEffect(() => {
    const apply = () => setState({ zoom: desktopZoom(window.innerWidth, window.innerHeight), vh: window.innerHeight });
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, []);
  return state;
}

export function StudyLayout({
  topBar,
  aside,
  strip,
  children,
}: {
  topBar: React.ReactNode;
  aside: React.ReactNode;
  strip: React.ReactNode;
  children: React.ReactNode;
}) {
  const { zoom, vh } = useDesktopZoom();
  // real window height in the frame's own px; `min-h-dvh` stays as the pre-mount fallback
  const screen = vh === null ? undefined : vh / zoom;
  return (
    <div className="min-h-dvh bg-ground text-ink" style={{ zoom, minHeight: screen }}>
      <div className="mx-auto lg:grid lg:max-w-[1240px] lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="flex min-h-dvh flex-col" style={{ minHeight: screen }}>
          <header className="sticky top-0 z-20 border-b border-rule bg-ground px-6 pt-2 pb-1">
            <div className="mx-auto w-full max-w-[680px]">{topBar}</div>
          </header>
          <main
            className={`mx-auto w-full max-w-[680px] flex-1 px-6 pt-6 ${strip ? "pb-[120px]" : "pb-16"}`}
          >
            {children}
          </main>
          {strip && (
            <div className="fixed inset-x-0 bottom-0 z-20 lg:sticky">
              <div className="mx-auto w-full lg:max-w-[680px]">{strip}</div>
            </div>
          )}
        </div>
        <aside
          className="hidden border-l border-rule lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:overflow-y-auto lg:px-6 lg:pt-3 lg:pb-6"
          style={{ height: screen }}
        >
          {aside}
        </aside>
      </div>
    </div>
  );
}
