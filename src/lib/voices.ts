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

/** Alistair. What everyone hears until they pick on /settings, and what every demo reset goes back to. */
export const DEFAULT_VOICE_ID = "l30f87tf05uxyknGdDw6";

export function isVoiceId(id: string | null | undefined): id is string {
  return !!id && VOICES.some((v) => v.id === id);
}

/** The learner's pick if it is still on the list, else the default. Used by Study read-aloud and the Listen agent override. */
export function currentVoice(progress: Progress): string {
  return isVoiceId(progress.voiceId) ? progress.voiceId : DEFAULT_VOICE_ID;
}
