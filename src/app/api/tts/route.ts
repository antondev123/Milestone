import { NextResponse } from "next/server";
import { DEFAULT_COURSE_ID } from "@/lib/course";
import { blockAudio, TtsError } from "@/lib/tts";
import { actionProgress } from "@/lib/actions";
import { isVoiceId, resolveVoice } from "@/lib/voices";

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
    const voice = isVoiceId(asked) ? asked : resolveVoice(actionProgress());
    const a = await blockAudio(DEFAULT_COURSE_ID, segmentId, blockIdx, voice);
    if (q.get("audio")) {
      return new Response(Buffer.from(a.audioBase64, "base64"), {
        headers: { "content-type": "audio/mpeg", "cache-control": "private, max-age=86400" },
      });
    }
    return NextResponse.json({ text: a.text, words: a.words, model: a.model, voice: a.voice });
  } catch (e) {
    const status = e instanceof TtsError ? e.status : 500;
    if (status >= 500) console.error(`[tts] ${(e as Error).message}`);
    return NextResponse.json({ reason: (e as Error).message }, { status });
  }
}
