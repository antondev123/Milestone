// Settings. One section for now: the reading voice (eight library voices, frozen by
// scripts/voices.ts). The pick lives on the demo user's progress record.
import { actionVoices } from "@/lib/actions";
import { BackLink, Screen, TopBar } from "@/components/carry/Chrome";
import { VoicePicker } from "@/components/VoicePicker";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const { voices, current } = actionVoices();
  return (
    <Screen gap="gap-[26px]">
      <TopBar left={<BackLink href="/" />} title="Settings" />
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-[34px] leading-[1.12] font-semibold tracking-[-0.015em]">Voice</h1>
        <p className="text-[17px] text-muted">Who reads to you on the road. Tap a name to choose it, or the button to hear a sample.</p>
      </div>
      <VoicePicker voices={voices} current={current} />
    </Screen>
  );
}
