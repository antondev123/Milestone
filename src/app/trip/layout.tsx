// Pre-Carry screens (chat text mode, ElevenLabs agent, trip summary) keep their original dark shell.
export default function LegacyLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-slate-950 text-slate-100 [color-scheme:dark]">
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 py-6">{children}</main>
    </div>
  );
}
