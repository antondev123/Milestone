// Listen dial: the mic button carries every mic state. Outline at rest, gold outline while the
// tutor listens, gold fill when a question is waiting for you, ground fill + slash when muted.
import { MicIcon, MicOffIcon } from "./Icons";

export type MicState = "rest" | "listening" | "question" | "muted" | "off";

const LOOK: Record<MicState, string> = {
  rest: "border-[3px] border-muted-on-ink text-ground",
  listening: "border-[3px] border-gold text-gold",
  question: "bg-gold text-ink",
  muted: "bg-ground text-ink",
  off: "border-[3px] border-muted-on-ink text-ground opacity-40",
};

export function MicButton({ state, onTap }: { state: MicState; onTap: () => void }) {
  return (
    <button
      type="button"
      onClick={onTap}
      disabled={state === "off"}
      aria-label={state === "muted" ? "Unmute the mic" : "Mute the mic"}
      aria-pressed={state === "muted"}
      className={`grid h-24 w-24 place-items-center rounded-full ${LOOK[state]}`}
    >
      {state === "muted" ? <MicOffIcon size={38} /> : <MicIcon size={38} />}
    </button>
  );
}
