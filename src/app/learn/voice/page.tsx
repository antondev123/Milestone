"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Plan } from "@/types/lesson";
import { TripPicker } from "@/components/TripPicker";
import { VoiceAgent } from "@/components/VoiceAgent";

export default function VoiceMode() {
  const router = useRouter();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [busy, setBusy] = useState(false);

  async function start(minutes: number) {
    setBusy(true);
    const p: Plan = await fetch("/api/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ minutes, mode: "voice" }),
    }).then((r) => r.json());
    setPlan(p);
    setBusy(false);
  }

  if (!plan) return <TripPicker label="Driving" onStart={start} busy={busy} />;

  return (
    <div className="flex flex-1 flex-col gap-3">
      <p className="text-xs text-slate-400">
        {plan.segmentIds.length} part{plan.segmentIds.length > 1 ? "s" : ""} planned · ~{plan.estMinutes} min · hands-free
      </p>
      <VoiceAgent plan={plan} onTripEnd={(tripId) => router.push(`/trip/${tripId}/summary`)} />
    </div>
  );
}
