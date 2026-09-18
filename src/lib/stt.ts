// Dictation for the study assistant: one ElevenLabs Scribe call per recorded question. Nothing is
// cached (every clip is different). Same error shape as tts.ts so the route maps statuses alike.

export class SttError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

function config() {
  const key = process.env.ELEVENLABS_API_KEY;
  const model = process.env.ELEVENLABS_STT_MODEL || "scribe_v1";
  if (!key) throw new SttError("Dictation is not configured (ELEVENLABS_API_KEY)", 503);
  return { key, model };
}

function extension(mime: string): string {
  if (mime.includes("mp4") || mime.includes("m4a")) return "m4a";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("wav")) return "wav";
  return "webm";
}

export async function transcribe(audio: Blob): Promise<string> {
  const { key, model } = config();
  const form = new FormData();
  form.append("file", audio, `question.${extension(audio.type)}`);
  form.append("model_id", model);
  form.append("language_code", "en");
  form.append("tag_audio_events", "false");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 30_000);
  const t0 = Date.now();
  let res: Response;
  try {
    res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: { "xi-api-key": key },
      body: form,
      signal: ctrl.signal,
    });
  } catch (e) {
    throw new SttError(`ElevenLabs unreachable: ${(e as Error).message}`, 502);
  } finally {
    clearTimeout(t);
  }
  if (!res.ok) throw new SttError(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 200)}`, 502);
  const data = (await res.json()) as { text?: string };
  const text = (data.text ?? "").trim();
  console.log(`[stt] ${audio.size} bytes → ${text.length} chars, ${Date.now() - t0}ms`);
  return text;
}
