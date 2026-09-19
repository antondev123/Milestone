import { NextResponse } from "next/server";
import { DEFAULT_COURSE_ID } from "@/lib/course";
import { blockAudio, TtsError } from "@/lib/tts";
import { actionProgress } from "@/lib/actions";
import { currentVoice, isVoiceId } from "@/lib/voices";

/**
 * GET /api/tts?segmentId=&blockIdx=          → { text, words, model, voice }   (generates + caches)
 * GET /api/tts?segmentId=&blockIdx=&audio=1  → audio/mpeg                      (from the same cache)
 * The client fetches the JSON first, then points an <audio> at the audio URL, which is then a cache hit.
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const segmentId = q.get("segmentId") ?? "";
  const blockIdx = Number(q.get("blockIdx") ?? 0);
  if (!segmentId || !Number.isInteger(blockIdx) || blockIdx < 0) return NextResponse.json({ reason: "segmentId and blockIdx required" }, { status: 400 });
  try {
    const asked = q.get("voice");
    const voice = isVoiceId(asked) ? asked : currentVoice(actionProgress());
    const a = await blockAudio(DEFAULT_COURSE_ID, segmentId, blockIdx, voice);
    if (q.get("audio")) {
      // Range support matters: browsers (Chrome above all) treat a media resource whose server
      // ignores Range as unseekable, and setting currentTime on it snaps back to 0. That breaks
      // "jump to this sentence" in study mode.
      const bytes = Buffer.from(a.audioBase64, "base64");
      const base = { "content-type": "audio/mpeg", "cache-control": "private, max-age=86400", "accept-ranges": "bytes" };
      const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
      if (range) {
        const start = range[1] ? Number(range[1]) : bytes.length - Number(range[2]);
        const end = range[1] && range[2] ? Math.min(Number(range[2]), bytes.length - 1) : bytes.length - 1;
        if (!(start >= 0 && start <= end && start < bytes.length)) {
          return new Response(null, { status: 416, headers: { ...base, "content-range": `bytes */${bytes.length}` } });
        }
        return new Response(bytes.subarray(start, end + 1), {
          status: 206,
          headers: { ...base, "content-range": `bytes ${start}-${end}/${bytes.length}`, "content-length": String(end - start + 1) },
        });
      }
      return new Response(bytes, { headers: { ...base, "content-length": String(bytes.length) } });
    }
    return NextResponse.json({ text: a.text, words: a.words, model: a.model, voice: a.voice });
  } catch (e) {
    const status = e instanceof TtsError ? e.status : 500;
    if (status >= 500) console.error(`[tts] ${(e as Error).message}`);
    return NextResponse.json({ reason: (e as Error).message }, { status });
  }
}
