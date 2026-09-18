# DEMO script (target: 3 min, each beat < 60 s)

Before: `npm run demo:reset`, `npm run dev`, phone or narrow browser window, mic allowed, `/learn/text` open. Have `/learn/voice` in a second tab already on the picker.

## Beat 0 — the line (10 s)
"Half of South Africa's workers commute by public transport, and most of them start courses they never finish. We turn the trip into the lesson."

## Beat 1 — taxi, text mode (50 s)
- Tap **10 min**. Show the plan line: "2 segments fit in 10 minutes."
- Tap Continue through 2–3 bubbles of the budgeting segment. "Low data, silent, one thumb."
- Checkpoint: tap the right MCQ. Then the open question: type a **lazy answer** ("to be safe") → rejected with a reason. Type a real one → accepted.
- "Same lesson JSON that the voice agent reads. Nothing here is a mockup."
- Tap **End trip** after the first segment → summary page. Don't dwell, go to beat 2.

## Beat 2 — driving, voice mode (60 s) ← the interruption moment
- Switch tab. "Now I'm driving. Same course, same progress." Pick **5 min**, Start talking.
- Agent: "1 segment fits… say go." Say **"go"**. It picks up at *Interest*, the segment after the one we finished by text. Point that out: "It resumed. Cross-mode."
- Let it read for ~8 s, then **interrupt mid-sentence**: "wait, explain that differently." It stops instantly and gives the mielie-field analogy. "That's real barge-in, not a pause button."
- Say **"skip"**. It goes to the question. Answer the compound interest question in your own words. Graded by Claude, spoken back.
- Say **"I'm done, I've arrived."**

## Beat 3 — the artefact (30 s)
- Summary page lands: segments done, checkpoints, streak, module bar, mastered/revisit topics, "next leg picks up at…".
- "You arrive with progress, not just an episode. Every trip ends with this. That's the product."

## Beat 4 — how it's built (20 s)
- "Any course goes in: transcript plus quiz, one offline Claude pass, out comes commute-shaped lesson JSON. Planner fits segments to your minutes. ElevenLabs Flash for voice, Claude for grading. Next.js on Vercel."

## Fallbacks
- Voice fails to connect: say "let me show the taxi version of the same segment" and continue in text mode; the summary still works.
- Grading API down: MCQs still grade locally; open answers fall back to keyword matching.
- Reset between rehearsals: `npm run demo:reset` (or `DELETE /api/progress`).
