# DEMO script (target: 3 min, each beat < 60 s)

Before: `npm run demo:reset -- --seed` (chapter 1 done, chapter 2 through 2.4, 4-day streak), then `npm run dev`. Phone or narrow window, mic allowed in Chrome. Tabs open: `/course`, `/learn/text`, `/learn/voice` on the picker. Rehearse once; the seed makes every run identical.

## Beat 0 — the line (12 s)
"Half of South Africa's workers commute by public transport, and most start courses they never finish. This is a real textbook, OpenStax Principles of Management, eighteen chapters, cut into commute-sized parts. We turn the trip into the lesson."

## Beat 1 — the map, then the taxi (45 s)
- `/course`. "Eighteen chapters, a hundred and forty-four sections. Nothing is locked. Chapter one done, chapter two thirty-one percent. You're here: 2.5, part one of three, about three more commutes to finish the chapter."
- Tap **Resume 2.5**, pick **10 min**. The tutor greets in its own words: "Back in chapter two… two parts fit." Tap **Continue** once.
- Type in the Ask box: **"is satisficing the same as being lazy?"** → grounded answer, then tap **Continue**: "Back to Why We Can Never Fully Decide…" "That detour came from the book, and it resumed exactly where we were."
- Tap **Skip**, **Continue**, answer the question. Tap **End trip**. Don't dwell.

## Beat 2 — driving, voice mode (75 s) ← the heart
- Switch tab. "Now I'm driving. Same book, same position." Pick **10 min**, **Start talking**.
- Agent (server-composed): "Back in chapter two, Managerial Decision-Making. Section two point five… Say go."
- Say **"where am I"** → "Chapter two… section two point five, part one of three. Chapter is thirty-one percent done, about three more commutes." "It knows. I never touched the screen."
- Say **"go"**. It reads, pauses, keeps reading on its own. After ~10 s, **interrupt mid-sentence**: **"how does this apply to running a taxi business?"**
  - It stops. Three sentences from the book. "One sec" fills the gap while Claude thinks.
  - Say **"continue"** → "Back to Why We Can Never Fully Decide…" "It didn't lose its place. The server knows which block we were on; the agent only ever hears the words it should say."
- Say **"go to chapter one"** → "Going to chapter one, Managing and Performing…"
- Say **"take me to the chapter one quiz"** → "Chapter one quiz, six questions. First: according to Henry Mintzberg, what are the three major roles managers perform?" "That's the book's own review question." Answer in your own words. Graded by Claude, spoken back.
- Say **"I'm done, I've arrived."**

## Beat 3 — the artefact (30 s)
- Summary lands: parts done, checkpoints, 🔥 streak, chapter bar, **You explored: decision-making in a taxi business**, quiz waiting, **Next leg picks up at 2.5 …**.
- "You arrive with progress, not an episode. Curiosity counts as progress too."

## Beat 4 — how it's built (18 s)
- "A whole textbook goes in: one free parse, then one Claude pass per section turns it into spoken parts with checkpoints, and the book's own review questions become the chapter quizzes. At runtime the server owns your position and feeds the models only the block you're on; the ElevenLabs agent just talks. Claude Haiku answers questions from the book with cached context, Sonnet grades. Next.js."

## Fallbacks
- Mic or ElevenLabs fails: open `/learn/voice?text=1` and type the same commands into the box; it is the same agent and tools without audio. Or "let me show the taxi version" and do Beat 2 in text mode with the chips.
- `goto` picks the wrong section: use an exact number, "go to section two point five".
- `ask` slow: the "One sec" filler covers ~3 s; if it times out the tutor says "I couldn't check that one, say go" and reading resumes.
- Grading API down: MCQs still grade locally; open answers fall back to keyword matching.
- Reset between rehearsals: `npm run demo:reset -- --seed` (or `DELETE /api/progress` for a fresh start).
