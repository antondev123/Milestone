import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { SttError, transcribe } from "@/lib/stt";
import { audioDir } from "@/lib/log/db";
import { currentSessionId, logEvent, logLlm } from "@/lib/log/log";

const MAX_BYTES = 10 * 1024 * 1024;

/** Session log: keep the clip next to the trip's other recordings so a misheard question can be replayed. */
function keepClip(sessionId: string, audio: Blob, bytes: Buffer): string | null {
  try {
    const dir = audioDir(sessionId);
    mkdirSync(dir, { recursive: true });
    const n = readdirSync(dir).filter((f) => f.startsWith("dictation-")).length + 1;
    const ext = audio.type.includes("mp4") || audio.type.includes("m4a") ? "m4a" : audio.type.includes("ogg") ? "ogg" : audio.type.includes("wav") ? "wav" : "webm";
    const file = `dictation-${n}.${ext}`;
    writeFileSync(join(dir, file), bytes);
    return file;
  } catch {
    return null;
  }
}

/** POST /api/stt  multipart { audio: Blob } → { text }. One clip, one Scribe call, no cache. */
export async function POST(req: Request) {
  let audio: FormDataEntryValue | null;
  try {
    audio = (await req.formData()).get("audio");
  } catch {
    return NextResponse.json({ reason: "multipart form with an audio file required" }, { status: 400 });
  }
  if (!(audio instanceof Blob) || audio.size === 0) return NextResponse.json({ reason: "audio file required" }, { status: 400 });
  if (audio.size > MAX_BYTES) return NextResponse.json({ reason: "clip too long" }, { status: 413 });
  const sessionId = currentSessionId();
  const file = sessionId ? keepClip(sessionId, audio, Buffer.from(await audio.arrayBuffer())) : null;
  const t0 = Date.now();
  try {
    const text = await transcribe(audio);
    const ms = Date.now() - t0;
    logEvent("dictation", { text, bytes: audio.size, mime: audio.type, file, ms }, { sessionId });
    logLlm({ provider: "elevenlabs", purpose: "stt", model: process.env.ELEVENLABS_STT_MODEL || "scribe_v1", chars: text.length, ms, sessionId, meta: { bytes: audio.size, file } });
    return NextResponse.json({ text });
  } catch (e) {
    const status = e instanceof SttError ? e.status : 500;
    if (status >= 500) console.error(`[stt] ${(e as Error).message}`);
    logEvent("dictation", { error: (e as Error).message, status, bytes: audio.size, file }, { sessionId });
    return NextResponse.json({ reason: (e as Error).message }, { status });
  }
}
