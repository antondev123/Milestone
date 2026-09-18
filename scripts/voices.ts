// Freeze the 8 voices the picker offers: top trending English voices from the ElevenLabs library.
// Adds each to our account (library voices are unusable by TTS/agent until added), downloads its
// sample to public/voices/<id>.mp3 (preview URLs are signed and expire), writes data/voices.json.
// Offline only, idempotent. Usage: npm run voices:sync
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const key = process.env.ELEVENLABS_API_KEY;
if (!key) {
  console.error("need ELEVENLABS_API_KEY in .env.local");
  process.exit(1);
}
const BASE = "https://api.elevenlabs.io/v1";
const H = { "xi-api-key": key, "content-type": "application/json" };
const WANT = 8;

type Shared = {
  voice_id: string;
  public_owner_id: string;
  name: string;
  description?: string;
  accent?: string;
  category: string;
  free_users_allowed: boolean;
  preview_url?: string;
};
type Own = { voices: { voice_id: string; name: string }[] };

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const r = await fetch(BASE + path, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status}: ${text.slice(0, 300)}`);
  return text ? (JSON.parse(text) as T) : ({} as T);
}

/** "Alistair – Clear, Neutral and Informative" → "Alistair" */
const shortName = (n: string) => n.split(/\s+[-–—]\s+/)[0].trim();

/** "Alistair – Clear, Neutral and Informative" → "Clear, neutral and informative"; else the description's first clause. */
function blurb(libraryName: string, description: string | undefined): string {
  const tail = libraryName.split(/\s+[-–—]\s+/).slice(1).join(" ").trim();
  const first = (description ?? "").split(/[.!?;]/)[0].trim();
  const s = tail || first || "Library voice";
  const cut = s.length > 44 ? s.slice(0, 41).replace(/\s+\S*$/, "") + "…" : s;
  return cut.charAt(0).toUpperCase() + cut.slice(1).toLowerCase();
}

const trending = await api<{ voices: Shared[] }>("GET", "/shared-voices?sort=trending&language=en&page_size=30");
const own = await api<Own>("GET", "/voices");
const owned = new Set(own.voices.map((v) => v.voice_id));

const outDir = join(process.cwd(), "public", "voices");
mkdirSync(outDir, { recursive: true });

const picked: { id: string; name: string; blurb: string; accent: string; sample: string }[] = [];
const seen = new Set<string>();
for (const v of trending.voices) {
  if (picked.length >= WANT) break;
  if (!v.free_users_allowed || v.category !== "high_quality" || !v.preview_url) continue;
  const name = shortName(v.name);
  if (seen.has(name.toLowerCase())) continue;
  try {
    if (!owned.has(v.voice_id)) {
      await api("POST", `/voices/add/${v.public_owner_id}/${v.voice_id}`, { new_name: v.name });
      console.log(`added   ${name} (${v.voice_id})`);
    } else {
      console.log(`have    ${name} (${v.voice_id})`);
    }
    const mp3 = await fetch(v.preview_url);
    if (!mp3.ok) throw new Error(`preview ${mp3.status}`);
    writeFileSync(join(outDir, `${v.voice_id}.mp3`), Buffer.from(await mp3.arrayBuffer()));
  } catch (e) {
    console.warn(`skip    ${name}: ${(e as Error).message}`);
    continue;
  }
  seen.add(name.toLowerCase());
  picked.push({ id: v.voice_id, name, blurb: blurb(v.name, v.description), accent: v.accent ?? "", sample: `/voices/${v.voice_id}.mp3` });
}

if (picked.length < WANT) console.warn(`only ${picked.length} of ${WANT} voices picked`);
writeFileSync(join(process.cwd(), "data", "voices.json"), JSON.stringify(picked, null, 2) + "\n");
console.log(`wrote data/voices.json with ${picked.length} voices`);
