// Study mode frame. Phone: a single column with a sticky top bar and a pinned strip at the bottom.
// Desktop (lg, ≥1024px): the page column on the left and a persistent assistant column on the right;
// the strip pins to the bottom of the page column only.
export function StudyLayout({ topBar, aside, strip, children }: { topBar: React.ReactNode; aside: React.ReactNode; strip: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-ground text-ink">
      <div className="mx-auto lg:grid lg:max-w-[1100px] lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-h-dvh flex-col">
          <header className="sticky top-0 z-20 border-b border-rule bg-ground px-6 pt-2 pb-1">
            <div className="mx-auto w-full max-w-[680px]">{topBar}</div>
          </header>
          <main className={`mx-auto w-full max-w-[680px] flex-1 px-6 pt-6 ${strip ? "pb-[120px]" : "pb-16"}`}>{children}</main>
          {strip && (
            <div className="fixed inset-x-0 bottom-0 z-20 lg:sticky">
              <div className="mx-auto w-full lg:max-w-[680px]">{strip}</div>
            </div>
          )}
        </div>
        <aside className="hidden border-l border-rule lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:overflow-y-auto lg:px-6 lg:pt-3 lg:pb-6">{aside}</aside>
      </div>
    </div>
  );
}
