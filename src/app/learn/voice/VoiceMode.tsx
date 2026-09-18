"use client";
// Listen: dark, glanceable, big targets (docs/DESIGN.md §4.3). The ElevenLabs agent does the
// talking; this page frames it.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Plan, ToolReply } from "@/types/lesson";
import type { LegIndex } from "@/lib/view";
import { TripPicker } from "@/components/TripPicker";
import { VoiceAgent } from "@/components/VoiceAgent";
import { ModePill, Screen, SignalNotice, TopBar } from "@/components/carry/Chrome";
import { ChevronIcon } from "@/components/carry/Icons";
import { persist, postJSON } from "@/components/carry/net";

export default function VoiceMode({ legs, source, carriedFromReading, startId, carrying }: { legs: LegIndex; source: string; carriedFromReading: boolean; startId: string; carrying: boolean }) {
  const router = useRouter();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [busy, setBusy] = useState(false);
  const [trouble, setTrouble] = useState(false);
  const [segmentId, setSegmentId] = useState(startId);

  async function start(minutes: number) {
    setBusy(true);
    const p = await persist(() => postJSON<Plan>("/api/session", { minutes, mode: "voice" }), setTrouble);
    setPlan(p);
    setSegmentId(p.startAt.segmentId);
    setBusy(false);
  }

  // Arrived from Read mid-trip (?carry=1): keep that trip instead of asking its length again.
  const [carryFailed, setCarryFailed] = useState(false);
  const carried = useRef(false);
  useEffect(() => {
    if (!carrying || carried.current) return;
    carried.current = true;
    (async () => {
      setBusy(true);
      const p = await persist(() => postJSON<Plan | { error: string }>("/api/session", { carry: true, mode: "voice" }), setTrouble);
      if ("tripId" in p) {
        setPlan(p);
        setSegmentId(p.startAt.segmentId);
      } else setCarryFailed(true);
      setBusy(false);
    })();
  }, [carrying]);

  const leg = legs[segmentId];
  const back = (
    <button type="button" onClick={() => router.push("/")} aria-label="Back to course" className="-ml-2 flex h-11 w-11 items-center justify-center">
      <ChevronIcon />
    </button>
  );

  return (
    <Screen dark gap="gap-6">
      <TopBar left={back} title={leg ? `Leg ${leg.n} of ${leg.of}` : "Listen"} right={<ModePill to="read" dark onClick={() => router.push(plan ? "/learn/text?carry=1" : "/learn/text")} />} />

      {carriedFromReading && (
        <div className="flex items-center gap-2.5 self-start rounded-xl bg-ink-raised px-3.5 py-2.5 text-[15px]">
          <span className="h-2.5 w-2.5 rounded-full bg-gold" aria-hidden="true" />
          Your place carried over from reading
        </div>
      )}

      <SignalNotice show={trouble} dark />

      {!plan && carrying && !carryFailed ? (
        <p className="text-[17px] text-muted-on-ink">Carrying your trip over…</p>
      ) : !plan ? (
        <TripPicker label="Listen: audio, answer out loud" onStart={start} busy={busy} dark />
      ) : (
        <VoiceAgent
          plan={plan}
          source={source}
          legs={legs}
          onReply={(r: ToolReply) => r.segmentId && setSegmentId(r.segmentId)}
          // Full navigation, not router.push: a fresh document drops the WebRTC/audio session for
          // good and cannot race a client transition the SDK teardown may abort mid-flight.
          onTripEnd={(tripId) => window.location.assign(`/trip/${tripId}/summary`)}
        />
      )}
    </Screen>
  );
}
