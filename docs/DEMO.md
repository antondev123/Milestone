# DEMO script (target: 3 min, each beat < 60 s)

Before: `npm run demo:reset -- --seed` (position only: chapter 1 done, chapter 2 through 2.4; no trips, answers or streak), then `npm run dev`. The Progress screen and trip rows show logged trips only (docs/DESIGN.md §5), so after seeding do one real rehearsal trip **in Read mode** and end it (that earns "First trip" and keeps "First hands-free trip" for Beat 2). Phone or narrow window, mic allowed in Chrome. Tabs open: `/` (Resume) and `/course`; open `/learn/text` and `/learn/voice` from there when the beat calls for them (each starts a trip the moment it opens, so do not pre-open them). `/course` is one tap from Progress ("All chapters"). Rehearse once; the seed makes every run identical.

## Beat 0 — the line (12 s)
"Half of South Africa's workers commute by public transport, and most start courses they never finish. This is a real textbook, OpenStax Principles of Management, eighteen chapters, cut into commute-sized parts. We turn the trip into the lesson."

## Beat 1 — the map, then the taxi (45 s)
- `/course`. "Eighteen chapters, a hundred and forty-four sections. Nothing is locked. Chapter one done, chapter two thirty-one percent. You're here: 2.5, part one of three, about three more commutes to finish the chapter."
- Tap **Resume 2.5**. No trip-length screen: the tutor greets at once, "Back in chapter two… Section two point five, part one of three. Here we go." Tap **Continue** once.
- Type in the Ask box: **"is satisficing the same as being lazy?"** → grounded answer, ending "Milestone: First question from the road." Then tap **Continue**: "Back to Why We Can Never Fully Decide…" "That detour came from the book, and it resumed exactly where we were."
- Tap **Skip**, **Continue**, tap the answer (**Escalation of commitment**, the taxi-minibus story you just heard). Tap **End trip**. Don't dwell.

## Beat 2 — driving, voice mode (75 s) ← the heart
- Open `/learn/voice`. "Now I'm driving. Same book, same position." Tap the **dial**, that is the only tap. The screen shows Topic, Section and the ring only, no words: "Nothing to read while I drive. Two buttons."
- Agent (server-composed): "Back in chapter two, Managerial Decision-Making. Section two point five… Here we go." It starts reading on its own.
- Interrupt with **"where am I"** → "Chapter two… section two point five, part one of three. Chapter is thirty-one percent done, about three more commutes." "It knows. I never touched the screen."
- Say **"continue"**. It reads, pauses, keeps reading on its own. After ~10 s, **interrupt mid-sentence**: **"how does this apply to running a taxi business?"**
  - It stops. Three sentences from the book. "One sec" fills the gap while Claude thinks.
  - Say **"continue"** → "Back to Why We Can Never Fully Decide…" "It didn't lose its place. The server knows which block we were on; the agent only ever hears the words it should say."
- Say **"go to chapter one"** → "Going to chapter one, Managing and Performing…" The Topic line, dots and ring change on screen.
- Say **"take me to the chapter one quiz"** → "Chapter one quiz, six questions. First: according to Henry Mintzberg, what are the three major roles managers perform?" "That's the book's own review question." Answer in your own words. Graded by Claude, spoken back. (Milestones land as they happen: the first checkpoint you pass in this trip ends with "Milestone: First hands-free trip", a fanfare earcon and the label on the state line, then reading carries on. A section end is named aloud, "Section two point five, …, done. Next, …", with a rising earcon. Nothing stops.)
- Say **"I'm done, I've arrived."** (Or hold **End** for a second.)

## Beat 3 — the artefact (30 s)
- Summary lands: legs done, checks right, day streak, **Milestone reached: First hands-free trip**, the chapter route line, **You explored: decision-making in a taxi business**, quiz waiting, **Next leg picks up at 2.5 …**.
- "You arrive with progress, not an episode. Curiosity counts as progress too. And the milestones only come from what you actually did on the road."

## Beat 4 — how it's built (18 s)
- "A whole textbook goes in: one free parse, then one Claude pass per section turns it into spoken parts with checkpoints, and the book's own review questions become the chapter quizzes. At runtime the server owns your position and feeds the models only the block you're on; the ElevenLabs agent just talks. Claude Haiku answers questions from the book with cached context, Sonnet grades. Next.js."

## Fallbacks
- Mic or ElevenLabs fails: "let me show the taxi version" and do Beat 2 in Read mode with the chips (same tools, same position). Or `/learn/voice?text=1`: the same agent without audio, reading on its own (no way to give commands there; the Dial has no text box).
- `goto` picks the wrong section: use an exact number, "go to section two point five".
- `ask` slow: the "One sec" filler covers ~3 s; if it times out the tutor says "I couldn't check that one, say go" and reading resumes.
- Grading API down (or no `ANTHROPIC_API_KEY`): MCQs still grade locally, spoken picks included ("it's escalation of commitment"); open answers fall back to keyword matching, which is lenient and accepts the rehearsed answers.
- Reset between rehearsals: `npm run demo:reset -- --seed` (or `DELETE /api/progress` for a fresh start).
