"use client";
// Listen dial earcons: every state change has a sound so the screen is optional while driving.
// Synthesised with WebAudio (no files, no dependency). The context is created on the first user
// tap so autoplay rules are satisfied; everything is a no-op without WebAudio or when disabled.

let ctx: AudioContext | null = null;
let enabled = true;
const MASTER = 0.25;

export function setEarconsEnabled(on: boolean) {
  enabled = on;
}

/** Call from a user gesture (the Start tap) so later earcons are allowed to play. */
export function primeEarcons() {
  if (ctx || typeof window === "undefined") return;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  try {
    ctx = new AC();
  } catch {
    ctx = null;
  }
}

/** One sine note. `to` glides the pitch over the note's length. */
function tone(freq: number, ms: number, at = 0, to?: number, gain = 1) {
  if (!enabled || !ctx) return;
  if (ctx.state === "suspended") void ctx.resume();
  const t0 = ctx.currentTime + at / 1000;
  const t1 = t0 + ms / 1000;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, t0);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t1);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(MASTER * gain, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t1);
  osc.connect(g).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t1 + 0.02);
}

export const earcon = {
  pause: () => tone(440, 140, 0, 330),
  resume: () => tone(330, 140, 0, 440),
  mute: () => tone(200, 45, 0, undefined, 0.8),
  unmute: () => tone(300, 45, 0, undefined, 0.8),
  ask: () => {
    tone(523, 90);
    tone(659, 110, 100);
  },
  correct: () => tone(523, 220, 0, 784),
  tick: () => tone(880, 35, 0, undefined, 0.6),
  /** a section or chapter finished: rising pair, wider than `ask` */
  section: () => {
    tone(523, 90);
    tone(784, 140, 100);
  },
  /** a milestone earned: short rising fanfare (`end` is its falling mirror) */
  milestone: () => {
    tone(523, 100);
    tone(659, 100, 110);
    tone(784, 220, 220);
  },
  end: () => {
    tone(659, 120);
    tone(523, 120, 130);
    tone(392, 220, 260);
  },
};
