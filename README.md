# Commute Course (working name)

Turn the trip into the lesson. One lesson engine, two delivery modes: voice (driving, ElevenLabs agent) and text (taxi/bus, low-data chat UI). Both share progress and resume state.

Docs: [OUTLINE](docs/OUTLINE.md) · [SCHEMA](docs/SCHEMA.md) · [STATUS](docs/STATUS.md) · [DEMO](docs/DEMO.md) · [ELEVENLABS](docs/ELEVENLABS.md)

## Team workflow

Branch per person per task, PR into `main`, squash-merge, never push to `main` directly. Full rules in [CLAUDE.md](CLAUDE.md), which Claude Code reads automatically when you open this repo. Quick start for a teammate:

```bash
git clone https://github.com/antondev123/commute-course.git
cd commute-course
npm install
cp .env.example .env.local   # ask Anton for the keys
git checkout -b <yourname>/<task>
npm run dev
```

## Setup

```bash
npm install
cp .env.example .env.local   # then fill in keys
npm run ingest               # chapters 1–3 of the textbook → data/courses/pom/sections (needs ANTHROPIC_API_KEY; already committed)
npm run dev                  # http://localhost:3000
```

The ingested lessons for chapters 1–3 are committed, so `npm run dev` works without running ingest. See `data/courses/pom/README.md` for the PDF → course pipeline.

## Scripts

| Script | What |
|---|---|
| `npm run dev` | Next.js dev server |
| `npm run parse:book` | Offline, free: pdftotext dump → `data/courses/pom/source/*.md` + `course.json` |
| `npm run ingest` | Offline: section markdown → spoken lessons via Claude, chapters 1–3 by default. Idempotent. Never runs on the request path. |
| `npm run validate` | Check the course data: manifest ↔ files, ids, questions, script hygiene |
| `npm run demo:reset` | Delete all progress files so the demo starts fresh (`-- --seed` for a mid-course rehearsal state) |
| `npm run agent:configure` | Push the ElevenLabs agent config (prompt, tools, ASR) from `scripts/configure-agent.ts` |
| `npm run ledger` | Spend and credits left, in rands. Log kept in `docs/LEDGER.md` |
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
