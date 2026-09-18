"use client";
// Listen: the car-mode Dial (docs/DESIGN.md §4.3): dark, no lesson text, two big targets. The ElevenLabs agent does the
// talking; this page frames it.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Plan, ToolReply } from "@/types/lesson";
import type { LegIndex } from "@/lib/view";
import { VoiceAgent } from "@/components/VoiceAgent";
import { ModePill, Screen, SignalNotice, TopBar } from "@/components/carry/Chrome";
import { ChevronIcon } from "@/components/carry/Icons";
import { persist, postJSON } from "@/components/carry/net";

export default function VoiceMode({ legs, carriedFromReading, startId, carrying }: { legs: LegIndex; carriedFromReading: boolean; startId: string; carrying: boolean }) {
  const router = useRouter();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [trouble, setTrouble] = useState(false);
  const [segmentId, setSegmentId] = useState(startId);
  const [paused, setPaused] = useState(false); // the Screen goes one shade darker while paused

  // Trips are open-ended and start on arrival, no length to pick. Arrived from Read mid-trip
  // (?carry=1): keep that trip; if it is gone (404), start a fresh one. The Dial's tap is the only tap.
  const started = useRef(false); // Strict Mode runs effects twice; a second POST would start a second trip
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      let p: Plan | { error: string } = { error: "no active trip" };
      if (carrying) p = await persist(() => postJSON<Plan | { error: string }>("/api/session", { carry: true, mode: "voice" }), setTrouble);
      if (!("tripId" in p)) p = await persist(() => postJSON<Plan>("/api/session", { mode: "voice" }), setTrouble);
      setPlan(p);
      setSegmentId(p.startAt.segmentId);
    })();
  }, [carrying]);

  const leg = legs[segmentId];
  const back = (
    <button type="button" onClick={() => router.push("/")} aria-label="Back to course" className="-ml-2 flex h-11 w-11 items-center justify-center">
      <ChevronIcon />
    </button>
  );

  return (
    <Screen dark={paused ? "deep" : true} gap="gap-6">
      <TopBar left={back} title={leg ? `Leg ${leg.n} of ${leg.of}` : "Listen"} right={<ModePill to="read" dark onClick={() => router.push(plan ? "/learn/text?carry=1" : "/learn/text")} />} />

      {carriedFromReading && (
        <div className="flex items-center gap-2.5 self-start rounded-xl bg-ink-raised px-3.5 py-2.5 text-[15px]">
          <span className="h-2.5 w-2.5 rounded-full bg-gold" aria-hidden="true" />
          Your place carried over from reading
        </div>
      )}

      <SignalNotice show={trouble} dark />

      {!plan ? (
        <p className="text-[17px] text-muted-on-ink">{carrying ? "Carrying your trip over…" : "Getting your place…"}</p>
      ) : (
        <VoiceAgent
          plan={plan}
          leg={legs[segmentId]}
          paused={paused}
          onPausedChange={setPaused}
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
