import { NextResponse } from "next/server";
import { SttError, transcribe } from "@/lib/stt";

const MAX_BYTES = 10 * 1024 * 1024;

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
  try {
    const text = await transcribe(audio);
    return NextResponse.json({ text });
  } catch (e) {
    const status = e instanceof SttError ? e.status : 500;
    if (status >= 500) console.error(`[stt] ${(e as Error).message}`);
    return NextResponse.json({ reason: (e as Error).message }, { status });
  }
}
