# STATUS

Updated: 2026-09-18 (Study checkpoint layout and leg/section navigation; Study desktop column tidy; Study assistant mic dictation)

## Done
- **Study checkpoint and navigation**: the inline checkpoint now scrolls under the top bar with a margin, the feedback box and "Next question" scroll clear of the pinned strip, the assistant FAB hides while a question is open, the section fades in, and only one `Checkpoint` mounts (phone inline *or* desktop column, chosen with `useMediaQuery`; before, both mounted and each POSTed `check`). "Next leg" left the checkpoint: a `LegNav` footer after the passage always offers Previous / Next leg (outlined; Next turns gold once the leg's checkpoint is done, so there is one primary per screen) and an "All chapters" link. The top-bar title ("Leg 1 of 8 · 1.1") is a button that opens a `SectionPicker` sheet (Text mode's Jump to… list with You are here / Done, chapter quiz links, All chapters) that posts `goto`. Verified on phone and desktop in the browser.
- **Study desktop column tidy (post #15)**: on short windows the assistant column clipped the empty-state line under the quoted sentence, hid the chips and drew stray scrollbars. Cause: nested `overflow-y-auto` flex regions plus a `-mx-1` chip row. Now only the thread scrolls (min 120px), quote/chips/composer sit below it at natural height, chips swipe without a scrollbar, and the aside itself scrolls as a last resort. The "Reading now" card is gone on desktop (the strip, the page highlight and the quoted context already show that sentence). The checkpoint gets an `inline` prop for the column (no top rule, smaller titles); the phone flow is unchanged. Verified at 1280×560, 1280×900 and 375×812.
- **App renamed to Milestone**: browser tab title and the Resume header. "Carry" stays as the name of the design palette and the `components/carry` folder.
- Task 1: docs/OUTLINE.md
- Task 2: docs/SCHEMA.md + src/types/lesson.ts (added `ActiveTrip` on Progress)
- Task 3: Next.js 16 + TS + Tailwind 4 scaffold, README, .env.example, npm scripts (`dev`, `ingest`, `demo:reset`, `typecheck`). Runs on Node 24 with no tsx.
- Task 4: scripts/ingest.ts (Claude Sonnet, structured JSON output, sanity checks). Sample course raw + a hand-authored lesson.json (4 segments, 9 questions) so the app runs before ingest. **Ingest run live with Sonnet 5: 4 segments, 12 questions, ~20 min. The committed lesson.json is now the ingested one.**
- Task 5: ElevenLabs wiring: `VoiceAgent` component (ConversationProvider + client tools), `/api/tools/[tool]` webhook route (same four tools), docs/ELEVENLABS.md with prompt, first message, tool schemas, Flash TTS. Agent configured via `scripts/configure-agent.ts` (Gemini 3.6 Flash, Flash v2, 4 client tools). Live voice test pending.
- Task 6: Text mode, verified end to end in the browser (plan → read → MCQ → open answer rejected/accepted → complete → summary).
- Session planner (`src/lib/planner.ts`), progress store (JSON file + memory fallback), grader (MCQ local, open via Claude, keyword fallback without key).
- Trip summary page `/trip/[id]/summary`, verified.
- Trip end on Fly fixed: `end_trip` is idempotent (no 0-minute phantom trip on a second call), voice mode ends the session once through one guarded path, and the hop to the summary is a full navigation. Verified on localhost with a double-clicked End trip: one `end_trip` POST, one summary load, no console errors.
- docs/DEMO.md first draft with the interruption beat.
- **Listen is a car-mode screen (the Dial).** No lesson text: Topic / Section / section dots (`WhereBlock`), a 220px pause/play dial with a topic-progress ring (`Dial`), a 96px mic button carrying listening / question / muted (`MicButton`), hold-to-end (`HoldButton`), a one-word state line, a 6px voice strip (`VoiceStrip`) and WebAudio earcons (`src/components/earcons.ts`). Pause = volume 0 + mic closed + `interrupted` + a "pause" turn; Continue re-reads the block ("repeat the question" if one is open). `Leg` now carries titles and section/part indices (`src/lib/view.ts`); no schema change. Verified end to end on `/learn/voice?text=1`: ready → connecting → reading → question (mic gold) → correct ("That's right") → pause/continue → goto (Where block + ring change) → hold-to-end → summary. Spec: docs/DESIGN.md §4.3 and the "Trip Car Mode" artifact.
- **Play button fix (post #11/#12)**: the Dial's progress-ring `<svg>` sat above the button and swallowed every tap (`pointer-events-none` added, button made `relative`). Study never left "Getting your place…" in `next dev`: Strict Mode's double effect run tripped the boot's cancel flag before the segment loaded (flag removed; the `booted` ref already keeps it to one run). The Next dev badge sat over the strip's play button (`devIndicators: false`). And `/api/tts` 503s without `ELEVENLABS_VOICE_ID`; the strip now shows that error in gold instead of muted text. **Everyone: add `ELEVENLABS_VOICE_ID` to `.env.local` and restart dev** (Study audio needs it).
- Fly.io deploy config: `fly.toml`, `Dockerfile` (Next standalone), `npm run deploy:fly`, `docs/DEPLOY.md`. One always-on machine in jnb with a volume for `data/progress`, so the file store works as on localhost. Standalone build verified locally (pages, `/api/session`, progress write, `demo-reset --seed`). Not yet pushed to Fly: needs `fly auth login` + `fly apps create` + volume, see DEPLOY.md.

- **Study mode** (`/learn/study`, third card on Resume, course-map section links): hands-on reader for when you are not travelling. The leg's verbatim text as a page; ElevenLabs read-aloud per block via `/api/tts` (with-timestamps, cached in `data/tts`) with the spoken word and sentence tracked on the page and mirrored in a pinned strip (play/pause, ±1 sentence, speed); tap a sentence to play from there; audio off = plain page. Assistant = the `ask` tool with the tapped sentence as context (bottom sheet on phones, right column at ≥1024px). Checkpoint = tap/type UI over the new `check` tool + existing `answer`. Reading `mark`s the cursor per block, so Listen mode says "Back to it." at the same block. Needs `ELEVENLABS_VOICE_ID` (see .env.example); without it the page works with audio off. Mockups and brief in `docs/mockups/study/` (`node docs/mockups/serve.mjs`).

## Verified with live keys (2026-09-18)
- Anthropic key + `claude-sonnet-5`: ingest and grading. Grader rejects vague answers, accepts paraphrase, handles spoken MCQ ("thirteen hundred rand"). ~3.5–4.5 s per grade; acceptable for voice, watch it in rehearsal.
- ElevenLabs key: valid, creator tier, 0 agents created yet.

- **Carry design applied** (docs/DESIGN.md, docs/CONTEXT.md): Resume `/` and Progress `/progress` are new; `/learn/text`, `/learn/voice`, `/course` and the trip summary are re-skinned with the same behaviour (Fraunces + Public Sans, Carry tokens, top bar with mode pill, route line per chapter, answer buttons, feedback box with "From Principles of Management by OpenStax, section X", lost-signal notice with retry, no emoji).
- **Chapter 1 is verbatim**: eight legs cut from the PDF text layer (`scripts/verbatim-chapter.ts`, `data/courses/pom/verbatim/`), 1/1/3/3 legs across 1.1–1.4, `model: "verbatim"`. Chapters 2–3 are still the ingested adaptations. Chapter 1 quiz unchanged.
- Seed is position-only (no fabricated trips, answers or streak).
- **Voice lessons start on their own**: the greeting no longer says "Say go"; `VoiceAgent.start()` arms auto-continue so the first block follows the greeting. Agent prompt (`scripts/configure-agent.ts`) updated to expect the synthetic "continue" as the start signal, so run `npm run agent:configure` after merging.
- **Mode switch keeps the trip**: tapping Listen instead / Read instead mid-trip opens the other mode with `?carry=1`, which calls `POST /api/session {carry: true}` (`actionCarryTrip`). Same trip id, plan and clock; only `activeTrip.mode` changes, and the opening line says the minutes left. No second "How long is this trip?". Verified both directions on localhost. Arriving from the home screen still shows the picker.
- **Study mode MCQ is hint-first**: a first wrong tap gets a one-sentence Claude nudge (`mcqHint` in `src/lib/grader.ts`, same model as open grading, fixed line without a key) instead of the answer, and the missed option is struck out; the second miss reveals the answer as before. Voice and Text modes are unchanged (`hintFirst` is only set for `mode === "study"` in `cursor.answer`).
- `chunk.ts` sentence splitter no longer breaks on initials ("U.S."), so block boundaries hold in 1.3.

## In progress / needs a human
- Dial screen with a real mic in Chrome: pause must actually silence the tutor (ducking is gated by `isPaused`), Continue re-reads the block, the mic outline goes gold while listening, earcons audible over the tutor. Squint test at arm's length.
- Voice mode mic test in Chrome per docs/ELEVENLABS.md §6: confirm the 700 ms auto-continue grace window feels right and barge-in mid-block re-reads the block. Chunked reading is now server-driven, so no prompt tuning for it.

## Not started
- Study mode follow-ups: word-level resume (the cursor is block-level). Chapters 2–3 are ingested paraphrases, so the "book as it is" promise only holds for chapter 1 until the parser fix below.
- Listen dial in landscape (dash mount): Where block left, dial centre, mute/End right. Portrait only for now.
- First real `npm run deploy:fly` and a phone test over HTTPS (mic needs a secure origin).
- **parse-book.ts drops real prose**: every `> **` line is treated as a figure caption, but pdftotext glues body text onto some of them. Lost from `source/`: most of Decisional Roles (1.3) and the levels-of-management paragraph (1.4); the ingested 1.3/1.4 lessons filled the gap from the model, not the book. Chapter 1 now bypasses this; chapters 2+ need a parser fix and a re-ingest check.
- Resume card precision is block-level (~150 words): the cursor has no word offset, so the card shows the end of the last fully heard block, not the exact word.
- Summary polish: mastered/revisit section only shows once topics have ≥2 attempts.

## Cut
- Maps API (duration picker instead)
- Slides ingestion (transcript + quiz.md only)
- Auth / Supabase (single demo user, JSON store)
- Multi-course catalogue (one course; the old `sample` course still loads with `COURSE_ID=sample`)

## Gotchas
- Hosting: Fly (one machine + volume) keeps the file store. Vercel/Netlify would fall back to memory per instance and drift between requests; not used.
- Grading latency: Sonnet 5 at low effort is ~4 s; the 2.5 s "One sec." filler covers it. If it drags, switch ANTHROPIC_MODEL to claude-haiku-4-5 for grading only. `ask` uses ANTHROPIC_ASK_MODEL (default claude-haiku-4-5).
- The in-app browser blocks the microphone. Use `/learn/voice?text=1` for a text-only session with the real agent (no TTS credits), or Chrome for the mic.
- Restart `npm run dev` after editing .env.local; Next does not hot-reload env.
- Study read-aloud: the word highlighter is a rAF loop that only the `<audio>` `play` event starts. Anything that re-binds the listener effect in `useReadAloud.ts` mid-playback cancels the loop, so `loadBlock`'s deps must stay stable (speed lives in a ref) and the effect resumes the loop itself if the element is already playing. Fixed 2026-09-18 after the speed pill froze the highlight.
- Client tools (browser) vs webhook tools (dashboard): the component uses client tools so localhost works without ngrok. Configure them as type Client in the dashboard.

## Costs (tracked 2026-09-18)
- ElevenLabs: first 71 s voice call = 597 credits, LLM passthrough $0.015. Budget ~500 credits/min of conversation. Check with the script in scratchpad or the dashboard's Conversations tab.
- Anthropic: ingest ~ $0.08 per run (3.7k in / 7.1k out on Sonnet 5). Each open-answer grade ~ $0.002; now logged to the dev console as `[grade] …`.
- Nothing runs unless someone is talking to it. Idle costs zero.

## Speech pickup tuning (applied via configure-agent.ts)
- ASR: Scribe v2 Realtime, quality high, 18 keyword boosts (commands + SA finance terms).
- Turn detection: turn_v3, eagerness eager, speculative turn on.
- VAD background voice filter on (radio, passengers).
- Backchannel words ("mm", "okay", "yeah") do not trigger barge-in.
- Untested levers left: `turn_eagerness: "patient"` if it cuts you off; headset mic in the car.
- **Local barge-in ducking** (`src/components/useBargeInDucking.ts`): the server takes ~0.5–1 s to confirm an interruption (needs transcribed words, then the WebRTC playout buffer drains; the SDK's client-side interrupt is a no-op on WebRTC). We watch the local mic meter while the tutor is talking and drop output volume to 10% after 150 ms of speech-band energy above the adaptive noise floor. Server `interruption` event → volume 0 until the next agent utterance. No confirmation within 1 s → fade back (false alarm: a bump or a passenger costs a ~1 s dip, nothing else). Constants at the top of the hook. Open `/learn/voice?debug=1` to see `in · floor · ratio · out · PHASE` while calibrating. Needs a live spoken test with speakers, not headphones, so echo cancellation is exercised.
