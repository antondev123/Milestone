// Freeze the 8 voices the picker offers, in picker order. All are ElevenLabs library voices:
// each is added to our account if missing (library voices are unusable by TTS/agent until added),
// its sample downloaded to public/voices/<id>.mp3 (preview URLs are signed and expire), and
// data/voices.json written. Offline only, idempotent. Usage: npm run voices:sync
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const key = process.env.ELEVENLABS_API_KEY;
if (!key) {
  console.error("need ELEVENLABS_API_KEY in .env.local");
  process.exit(1);
}
const BASE = "https://api.elevenlabs.io/v1";
const H = { "xi-api-key": key, "content-type": "application/json" };

// Picker order. The first entry is the default voice (DEFAULT_VOICE_ID in src/lib/voices.ts).
// The search term must find the voice in the shared library so it can be added by owner + id.
const WANT: { id: string; search: string }[] = [
  { id: "UgBBYS2sOqTuMpoF3BR0", search: "Mark" },
  { id: "IRHApOXLvnW57QJPQH2P", search: "Adam" },
  { id: "4O1sYUnmtThcBoSBrri7", search: "Maya" },
  { id: "vChnJZ1Cu89g2XXumPfT", search: "Lara" },
  { id: "dfeOmy6Uay63tNhyO99j", search: "Kristen" },
  { id: "l30f87tf05uxyknGdDw6", search: "Alistair" },
  { id: "h2sm0NbeIZXHBzJOMYcQ", search: "Natasha" },
  { id: "D11AWvkESE7DJwqIVi7L", search: "Brian" },
];

type Shared = { voice_id: string; public_owner_id: string; name: string };
type VoiceInfo = {
  voice_id: string;
  name: string;
  description?: string;
  labels?: { accent?: string };
  preview_url?: string;
};

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

const outDir = join(process.cwd(), "public", "voices");
mkdirSync(outDir, { recursive: true });

const own = await api<{ voices: { voice_id: string }[] }>("GET", "/voices");
const owned = new Set(own.voices.map((v) => v.voice_id));

const picked: { id: string; name: string; blurb: string; accent: string; sample: string }[] = [];
for (const { id, search } of WANT) {
  try {
    if (!owned.has(id)) {
      const found = await api<{ voices: Shared[] }>("GET", `/shared-voices?search=${encodeURIComponent(search)}&page_size=100`);
      const shared = found.voices.find((v) => v.voice_id === id);
      if (!shared) throw new Error(`not in the shared library under "${search}"`);
      await api("POST", `/voices/add/${shared.public_owner_id}/${id}`, { new_name: shared.name });
      console.log(`added   ${shortName(shared.name)} (${id})`);
    }
    const v = await api<VoiceInfo>("GET", `/voices/${id}`);
    if (!v.preview_url) throw new Error("no preview_url");
    const mp3 = await fetch(v.preview_url);
    if (!mp3.ok) throw new Error(`preview ${mp3.status}`);
    writeFileSync(join(outDir, `${id}.mp3`), Buffer.from(await mp3.arrayBuffer()));
    const name = shortName(v.name);
    picked.push({ id, name, blurb: blurb(v.name, v.description), accent: v.labels?.accent ?? "", sample: `/voices/${id}.mp3` });
    console.log(`ok      ${name} (${id})`);
  } catch (e) {
    console.warn(`skip    ${id}: ${(e as Error).message}`);
  }
}

if (picked.length < WANT.length) console.warn(`only ${picked.length} of ${WANT.length} voices picked`);
writeFileSync(join(process.cwd(), "data", "voices.json"), JSON.stringify(picked, null, 2) + "\n");
console.log(`wrote data/voices.json with ${picked.length} voices`);
