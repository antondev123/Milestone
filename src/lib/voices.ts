// The voices a learner can pick. Frozen offline by scripts/voices.ts (npm run voices:sync) into
// data/voices.json; the samples it references are static files under public/voices/.
import voicesJson from "../../data/voices.json";
import type { Progress } from "@/types/lesson";

export interface Voice {
  id: string;
  name: string;
  blurb: string;
  accent: string;
  sample: string; // /voices/<id>.mp3
}

export const VOICES: Voice[] = voicesJson as Voice[];

export function isVoiceId(id: string | null | undefined): id is string {
  return !!id && VOICES.some((v) => v.id === id);
}

/** Voice for read-aloud: the learner's pick if it is still on the list, else the env default. */
export function resolveVoice(progress: Progress): string | undefined {
  return isVoiceId(progress.voiceId) ? progress.voiceId : process.env.ELEVENLABS_VOICE_ID;
}

/** Voice override for the agent: only the learner's pick; undefined keeps the dashboard voice. */
export function agentVoice(progress: Progress): string | undefined {
  return isVoiceId(progress.voiceId) ? progress.voiceId : undefined;
}
