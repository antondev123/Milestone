# STATUS

Updated: 2026-09-18 (keys added, pipeline verified live)

## Done
- Task 1: docs/OUTLINE.md
- Task 2: docs/SCHEMA.md + src/types/lesson.ts (added `ActiveTrip` on Progress)
- Task 3: Next.js 16 + TS + Tailwind 4 scaffold, README, .env.example, npm scripts (`dev`, `ingest`, `demo:reset`, `typecheck`). Runs on Node 24 with no tsx.
- Task 4: scripts/ingest.ts (Claude Sonnet, structured JSON output, sanity checks). Sample course raw + a hand-authored lesson.json (4 segments, 9 questions) so the app runs before ingest. **Ingest run live with Sonnet 5: 4 segments, 12 questions, ~20 min. The committed lesson.json is now the ingested one.**
- Task 5: ElevenLabs wiring: `VoiceAgent` component (ConversationProvider + client tools), `/api/tools/[tool]` webhook route (same four tools), docs/ELEVENLABS.md with prompt, first message, tool schemas, Flash TTS. Agent configured via `scripts/configure-agent.ts` (Gemini 3.6 Flash, Flash v2, 4 client tools). Live voice test pending.
- Task 6: Text mode, verified end to end in the browser (plan → read → MCQ → open answer rejected/accepted → complete → summary).
- Session planner (`src/lib/planner.ts`), progress store (JSON file + memory fallback), grader (MCQ local, open via Claude, keyword fallback without key).
- Trip summary page `/trip/[id]/summary`, verified.
- docs/DEMO.md first draft with the interruption beat.

## Verified with live keys (2026-09-18)
- Anthropic key + `claude-sonnet-5`: ingest and grading. Grader rejects vague answers, accepts paraphrase, handles spoken MCQ ("thirteen hundred rand"). ~3.5–4.5 s per grade; acceptable for voice, watch it in rehearsal.
- ElevenLabs key: valid, creator tier, 0 agents created yet.

## In progress / needs a human
- Voice mode live test: create the agent per docs/ELEVENLABS.md, paste `NEXT_PUBLIC_ELEVENLABS_AGENT_ID`, run the test checklist. Expect prompt tuning on the "read the script in chunks" behaviour.

## Not started
- Vercel deploy (progress store will be memory-only there; fine for demo, or demo on localhost).
- Product name (5 options in the plan: Legroom, Enroute, Milestone, Kombi, Taxi Rank). Title/metadata still say "Commute Course".
- Summary polish: mastered/revisit section only shows once topics have ≥2 attempts.

## Cut
- Maps API (duration picker instead)
- Slides ingestion (transcript + quiz.md only)
- Auth / Supabase (single demo user, JSON store)
- Multi-course catalogue (one course)

## Gotchas
- Vercel FS is read-only: store falls back to memory per instance. Demo from localhost if cross-request state looks flaky.
- Grading latency: Sonnet 5 at low effort is ~4 s. If it drags in voice, switch ANTHROPIC_MODEL to claude-haiku-4-5 for grading only.
- Restart `npm run dev` after editing .env.local; Next does not hot-reload env.
- Client tools (browser) vs webhook tools (dashboard): the component uses client tools so localhost works without ngrok. Configure them as type Client in the dashboard.
