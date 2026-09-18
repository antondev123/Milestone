# Commute Course (working name)

Turn the trip into the lesson. One lesson engine, two delivery modes: voice (driving, ElevenLabs agent) and text (taxi/bus, low-data chat UI). Both share progress and resume state.

Docs: [OUTLINE](docs/OUTLINE.md) · [SCHEMA](docs/SCHEMA.md) · [STATUS](docs/STATUS.md) · [DEMO](docs/DEMO.md) · [ELEVENLABS](docs/ELEVENLABS.md)

## Setup

```bash
npm install
cp .env.example .env.local   # then fill in keys
npm run ingest               # raw course → data/courses/sample/lesson.json (needs ANTHROPIC_API_KEY)
npm run dev                  # http://localhost:3000
```

`lesson.json` for the sample course is committed, so `npm run dev` works without running ingest.

## Scripts

| Script | What |
|---|---|
| `npm run dev` | Next.js dev server |
| `npm run ingest` | Offline: `data/courses/sample/raw/*` → `lesson.json` via Claude. Never runs on the request path. |
| `npm run demo:reset` | Delete all progress files so the demo starts fresh |
| `npm run typecheck` | `tsc --noEmit` |

Scripts are plain `.ts` run directly by Node 24 (type stripping). No `tsx`/`ts-node` needed.

## Layout

```
data/courses/<id>/raw/      transcript.md + quiz.md (input)
data/courses/<id>/lesson.json   ingested output (committed)
data/progress/<user>-<course>.json   runtime progress (gitignored)
docs/                        outline, schema, status, demo script
scripts/                     ingest.ts, demo-reset.ts
src/types/lesson.ts          THE schema
src/lib/                     engine: store, planner, grader
src/app/api/                 session, grade, progress, tools/* (ElevenLabs webhooks)
src/app/learn/text           text mode
src/app/learn/voice          voice mode
src/app/trip/[id]/summary    progress artefact
```

## Voice mode

Requires an ElevenLabs Conversational AI agent. Config checklist: [docs/ELEVENLABS.md](docs/ELEVENLABS.md). Tools run as client tools in the browser, so localhost works without a public URL. Only if you switch the dashboard tools to webhooks do you need `ngrok http 3000` and `NEXT_PUBLIC_BASE_URL`.
