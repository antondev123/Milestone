import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col justify-center gap-8">
      <div>
        <h1 className="text-3xl font-bold">Commute Course</h1>
        <p className="mt-2 text-slate-400">Turn the trip into the lesson.</p>
      </div>
      <div className="flex flex-col gap-3">
        <Link href="/learn/text" className="rounded-xl bg-slate-800 px-5 py-4 text-lg font-medium">
          🚐 Taxi / bus — text mode
        </Link>
        <Link href="/learn/voice" className="rounded-xl bg-slate-800 px-5 py-4 text-lg font-medium">
          🚗 Driving — voice mode
        </Link>
      </div>
      <p className="text-xs text-slate-500">Scaffold. Modes land in tasks 6–7.</p>
    </div>
  );
}
