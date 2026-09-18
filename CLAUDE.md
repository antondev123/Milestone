# Team rules for this repo (read by Claude Code automatically)

Hackathon, 36 hours, 2026-09-18 to 2026-09-19. Theme: "Travel — the journey, not the destination". Product: turn commute time into course progress. Read `docs/OUTLINE.md` first, then `docs/STATUS.md` for what is done and what is open.

## Git workflow, non-negotiable

1. **Never commit to `main` directly.** `main` is the demo branch. It must run at all times. The repo is private on a free plan so GitHub cannot enforce this; it is on you.
2. **One branch per person per task**, named `<name>/<short-task>`, e.g. `anton/voice-prompt-tuning`, `thabo/summary-polish`. Branch from a fresh `main`:
   ```bash
   git checkout main && git pull && git checkout -b <name>/<task>
   ```
3. **Commit small and often** on your branch. Push at least every hour so work is not lost if a laptop dies.
4. **Rebase on `main` before opening a PR**, so conflicts are resolved on your branch, not on `main`:
   ```bash
   git fetch origin && git rebase origin/main
   ```
5. **Merge into `main` only via a pull request**, and only when all three hold:
   - `npm run typecheck` passes (`npx tsc --noEmit`).
   - `npm run build` passes.
   - You ran the thing you changed in the browser or with curl and it worked. Say what you tested in the PR body.
6. **Squash-merge** PRs (the GitHub button). One commit on `main` per feature keeps `git log` readable at 3 a.m.
7. **Anyone on the team can approve and merge** anyone else's PR. No waiting. If it is your own PR and nobody is awake, self-merge after the three checks above, and say so in the team chat.
8. **If `main` breaks, fixing it beats everything else.** Revert the PR (`gh pr revert` or the GitHub button) first, debug on a branch second.
9. **Delete branches after merge.**
10. **Do not commit secrets.** `.env.local` is gitignored. If you add a new env var, add an empty entry to `.env.example` and tell the team.

## Claude Code instructions

- Before starting a task, check `docs/STATUS.md` and the open PRs (`gh pr list`) so two people do not build the same thing.
- Always work on a branch named as above. If you are on `main`, create a branch before the first edit.
- Commit with a one-line imperative subject and, if useful, a short body. End commit messages with the attribution line your session was given.
- Open PRs with `gh pr create`. PR body: what changed, what you tested, and any env var or dashboard change a teammate needs to make.
- Update `docs/STATUS.md` in the same PR when you finish, cut, or start something. Move items between Done / In progress / Not started / Cut.
- Do not add dependencies beyond Next.js, React, Tailwind, `@anthropic-ai/sdk`, `@elevenlabs/react`. Ask the human first.
- Do not run `scripts/ingest.ts` or `scripts/parse-book.ts` on the request path. They are offline only. Ingest is per section and idempotent; run `npm run validate` after.
- Schema lives in `src/types/lesson.ts`. Changing it touches everything, so mention it loudly in the PR and update `docs/SCHEMA.md` in the same PR.
- The demo script `docs/DEMO.md` is the spec. If a change makes a demo beat impossible, say so in the PR.

## Stack facts that save time

- Node 24 runs `.ts` scripts directly. No tsx, no ts-node.
- Next.js 16 App Router. Route params are Promises: `const { id } = await params`.
- Restart `npm run dev` after editing `.env.local`. Env is not hot-reloaded.
- `npm run demo:stage` is the stage reset: wipes progress, seeds the position (chapter 1 and 2.1–2.4 done) and arms the fixed Listen demo (the next Listen trip is 2.5 parts 1–2 and ends itself; runs once). `npm run demo:reset` wipes; `-- --seed` seeds position only. Do one before every rehearsal.
- The course manifest (`course.json`) is always in memory; segment prose lives in `sections/*.json` and is loaded lazily. Never send whole sections to a model at runtime; the manifest `toc.md` is the LLM-facing table of contents.
- Grading: MCQ is local string match, open answers go to Claude via `src/lib/grader.ts`. `ANTHROPIC_MODEL` controls the model, default `claude-sonnet-5`.
- Voice tools are client tools in `src/components/VoiceAgent.tsx` calling `/api/tools/<name>`. The same route works as a webhook if someone reconfigures the agent.
- Progress store is JSON files in `data/progress/`, gitignored. On Vercel it falls back to memory.

## Where things live

| Thing | Path |
|---|---|
| Lesson + progress types | `src/types/lesson.ts` |
| Engine (planner, store, grader, progress) | `src/lib/` |
| Single entry for all engine actions | `src/lib/actions.ts` |
| API routes | `src/app/api/` |
| Design spec and brief | `docs/DESIGN.md`, `docs/CONTEXT.md` |
| Carry screens: Resume, Progress | `src/app/page.tsx`, `src/app/progress/page.tsx`, view models in `src/lib/view.ts` |
| Carry design components (top bar, mode pill, route line, feedback box, icons, retry) | `src/components/carry/` |
| Text mode (renderer over the speech tools) | `src/app/learn/text/TextMode.tsx` (server shell `page.tsx`) |
| Course map | `src/app/course/page.tsx` |
| Cursor engine (position state machine), spoken lines, goto resolver, grounded ask | `src/lib/cursor.ts`, `src/lib/say.ts`, `src/lib/navigate.ts`, `src/lib/ask.ts` |
| Speech tools (voice agent + text mode) | `src/app/api/tools/[tool]/route.ts` |
| Voice mode | `src/app/learn/voice/page.tsx`, `src/components/VoiceAgent.tsx` |
| Summary card | `src/app/trip/[id]/summary/page.tsx` |
| Verbatim legs: chapter 1 (PDF text layer) and 2.5 (section markdown), not ingested | `data/courses/pom/verbatim/cNN.json`, `scripts/verbatim-chapter.ts` (`npm run course:verbatim`) |
| Stage demo (fixed Listen trip, reset command) | `src/lib/demo.ts`, `scripts/demo-reset.ts --stage`, `docs/DEMO.md` |
| Course data (Principles of Management) | `data/courses/pom/` — see its README; `source/` markdown, `sections/` lessons, `course.json` manifest |
| Course loaders (manifest + lazy sections) | `src/lib/course.ts` |
| Book parser / ingest / validator | `scripts/parse-book.ts`, `scripts/ingest.ts`, `scripts/validate-course.ts` |
| Old sample course (kept, `COURSE_ID=sample`) | `data/courses/sample/` |
| ElevenLabs dashboard config | `docs/ELEVENLABS.md` |
