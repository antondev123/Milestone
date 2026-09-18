// Read-aloud for study mode: one ElevenLabs TTS call per block, with character timestamps folded
// into per-word start/end times. Results are cached on disk (data/tts, or TTS_CACHE_DIR) so a block
// is billed once; in-flight requests are deduped so prefetch and play never double-bill.
// Falls back to memory on a read-only filesystem, like store.ts.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { blocks } from "./chunk";
import { loadSegmentFull } from "./course";
import { logLlm } from "./log/log";

export interface WordTiming {
  start: number; // seconds
  end: number;
}

export interface BlockAudio {
  text: string; // the exact block text; split on /\s+/ to get one entry per `words` item
  words: WordTiming[];
  audioBase64: string; // mp3
  model: string;
  voice: string;
}

export class TtsError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

const memory = new Map<string, BlockAudio>();
const inflight = new Map<string, Promise<BlockAudio>>();
let fsWritable: boolean | null = null;

function config(voice: string | undefined) {
  const key = process.env.ELEVENLABS_API_KEY;
  const model = process.env.ELEVENLABS_TTS_MODEL || "eleven_flash_v2_5";
  if (!key || !voice) throw new TtsError("Read-aloud is not configured (ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID)", 503);
  return { key, voice, model };
}

function cacheDir(): string {
  return process.env.TTS_CACHE_DIR || join(process.cwd(), "data", "tts");
}

export function blockText(courseId: string, segmentId: string, blockIdx: number): string {
  const seg = loadSegmentFull(courseId, segmentId);
  if (!seg) throw new TtsError(`unknown segment ${segmentId}`, 404);
  const bl = blocks(seg.script);
  const text = bl[blockIdx];
  if (text === undefined) throw new TtsError(`segment ${segmentId} has ${bl.length} blocks, asked for ${blockIdx}`, 404);
  return text;
}

function cachePath(courseId: string, segmentId: string, blockIdx: number, hash: string): string {
  return join(cacheDir(), courseId, segmentId.replace(/[^a-z0-9]+/gi, "_"), `${blockIdx}-${hash}.json`);
}

/** Fold ElevenLabs character alignment into one {start,end} per whitespace-separated word. */
export function wordTimings(text: string, chars: string[], starts: number[], ends: number[]): WordTiming[] {
  const out: WordTiming[] = [];
  let open = -1;
  for (let i = 0; i < chars.length; i++) {
    const ws = /\s/.test(chars[i]);
    if (!ws && open < 0) open = i;
    if (ws && open >= 0) {
      out.push({ start: starts[open], end: ends[i - 1] });
      open = -1;
    }
  }
  if (open >= 0) out.push({ start: starts[open], end: ends[chars.length - 1] });
  const expected = text.split(/\s+/).filter(Boolean).length;
  if (out.length === expected) return out;
  // Alignment drifted (dropped or merged characters). Keep playback usable: spread words evenly.
  console.warn(`[tts] alignment gave ${out.length} words, text has ${expected}; using proportional timings`);
  const total = ends[ends.length - 1] ?? 0;
  return Array.from({ length: expected }, (_, i) => ({ start: (total * i) / expected, end: (total * (i + 1)) / expected }));
}

async function synthesize(text: string, voiceId: string | undefined): Promise<BlockAudio> {
  const { key, voice, model } = config(voiceId);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 30_000);
  const t0 = Date.now();
  let res: Response;
  try {
    res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}/with-timestamps?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": key, "content-type": "application/json" },
      body: JSON.stringify({ text, model_id: model }),
      signal: ctrl.signal,
    });
  } catch (e) {
    throw new TtsError(`ElevenLabs unreachable: ${(e as Error).message}`, 502);
  } finally {
    clearTimeout(t);
  }
  if (!res.ok) throw new TtsError(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 200)}`, 502);
  const data = (await res.json()) as {
    audio_base64: string;
    alignment: { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[] } | null;
  };
  const a = data.alignment;
  const words = a ? wordTimings(text, a.characters, a.character_start_times_seconds, a.character_end_times_seconds) : [];
  console.log(`[tts] ${text.length} chars, ${words.length} words, ${Date.now() - t0}ms`);
  // billed per character; only real synthesis lands here, cache hits are free
  logLlm({ provider: "elevenlabs", purpose: "tts", model, chars: text.length, credits: text.length, usd: (text.length * 22) / 100_000, ms: Date.now() - t0, requestId: res.headers.get("request-id") ?? undefined, meta: { voice, words: words.length } });
  return { text, words, audioBase64: data.audio_base64, model, voice };
}

/** `voiceId` is the resolved voice (src/lib/voices.ts resolveVoice); it is part of the cache key. */
export async function blockAudio(courseId: string, segmentId: string, blockIdx: number, voiceId: string | undefined): Promise<BlockAudio> {
  const text = blockText(courseId, segmentId, blockIdx);
  const { voice, model } = config(voiceId);
  const hash = createHash("sha1").update(`${text}\n${voice}\n${model}`).digest("hex").slice(0, 10);
  const p = cachePath(courseId, segmentId, blockIdx, hash);
  const mem = memory.get(p);
  if (mem) return mem;
  if (existsSync(p)) {
    try {
      const parsed = JSON.parse(readFileSync(p, "utf8")) as BlockAudio;
      memory.set(p, parsed);
      return parsed;
    } catch {
      // corrupt cache entry: regenerate
    }
  }
  const pending = inflight.get(p);
  if (pending) return pending;
  const job = synthesize(text, voice)
    .then((audio) => {
      memory.set(p, audio);
      if (fsWritable !== false) {
        try {
          mkdirSync(join(p, ".."), { recursive: true });
          writeFileSync(p, JSON.stringify(audio));
          fsWritable = true;
        } catch {
          fsWritable = false;
        }
      }
      return audio;
    })
    .finally(() => inflight.delete(p));
  inflight.set(p, job);
  return job;
}
