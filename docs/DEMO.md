# DEMO script: the stage run (about 6 minutes, hands-free)

One fixed trip, the book's own words, the same every time. Section 2.5 of OpenStax *Principles of Management*, "Barriers to Effective Decision-Making": about a minute and a half on bounded rationality, two checks (one open, one multiple choice), two minutes on escalation of commitment with a live question in the middle, one more check, then the trip ends itself into the summary with the first milestones.

## Before

```bash
npm run demo:stage
npm run dev
```

`demo:stage` wipes progress, seeds the position (chapter 1 done, chapter 2 through 2.4, no trips, answers or streak) and arms the demo. Trips are open-ended everywhere else; the armed demo makes the **next Hands-off (Listen) trip** exactly 2.5 parts 1 and 2, ending on its own after part 2. It runs **once**: after the summary, Hands-off is an ordinary open-ended trip from 2.5 part 3. Run `demo:stage` again for the next person. Moving somewhere else in Hands-on (Study) or Read before the demo (cursor off 2.5 part 1) also disarms it.

Phone or narrow window, mic allowed in Chrome, speakers not headphones. Open `/`. Do not pre-open `/learn/voice`: it starts the trip the moment it opens.

## Beat 0, the line (12 s)
"Half of South Africa's workers commute by public transport, and most start courses they never finish. This is a real textbook, OpenStax Principles of Management, eighteen chapters, cut into commute-sized parts. We turn the trip into the lesson."

## Beat 1, land and go (10 s)
- `/` shows *Chapter 2: Managerial Decision-Making, 11 of 31 legs done* and the resume card. "Chapter one done, a third of chapter two. I'm driving, so: Hands-off."
- Tap **Hands-off**. The Dial: Topic, Section and the ring, no words. Tap the **dial**, the only tap.
- Tutor: "Back in chapter two, Managerial Decision-Making. Section two point five, part one of seven. Here we go." Then it starts reading on its own.

## Beat 2, the first minute (80 s)
- It reads the book: "There are a number of barriers to effective decision-making… Bounded rationality is the idea that for complex issues we cannot be completely rational…" One block, no breath: part 1 is read in one go. Nothing to read on screen. "Every word is the textbook's. Nothing is paraphrased."

## Beat 3, the checks (70 s)
- "Quick check. Why does the book say managers cannot make completely rational decisions on complex issues?"
  Answer in your own words, for example: **"Because you can't know every alternative or what each one leads to, and even if you could, you don't have the time or the head space to process it all."** Claude grades it (about 4 s, "One sec" covers it) and speaks one sentence back. Try a weak one in rehearsal ("because it's complicated") to see it rejected and offered once more.
- "According to the passage, why is nonrational decision-making especially common with nonprogrammed decisions? A, … B, … C, … D, …" The right one is **"New ground, so we do not know what to ask"**. Say the letter, or the words: **"the new ground one"**. Graded locally, instant. "That's right", then "Part done. Milestone: First trip. First hands-free trip." with the fanfare earcon and the label on the state line. Reading carries on.

## Beat 4, the second minute and the live question (2.5 min)
- It moves on by itself: "Part two of seven, Escalation of commitment. Given the lack of complete information, managers don't always make the right decision initially…"
- About ten seconds in, **interrupt mid-sentence**: **"Is that the same thing as the sunk cost fallacy?"**
  It stops. Two or three sentences from the book's context (the deeper note for this part links escalation of commitment to sunk costs), ending "Milestone: First question from the road." "It answered from the book, not the internet. And it still knows where we were."
- Say **"continue"**. "Back to Escalation of commitment." It re-reads the block from the top (blocks are ~250 words, so up to ~100 s) and carries on through the software-package story to "…willing to reevaluate decisions and change direction when appropriate."
- Optional, if time: **"where am I"** → "Chapter two… section two point five, part two of seven…".
- "Quick check. What is escalation of commitment, and why is it hard to avoid?" Answer: **"Sticking with a bad decision even as it keeps getting worse, because admitting you were wrong feels harder than staying the course."**

## Beat 5, arrival (30 s)
- Part 2 was the last planned leg, so the trip ends itself. Tutor: "Trip done. Two parts, three of three right. Chapter is forty-two percent finished. Milestone: day one of your streak. You explored escalation of commitment and sunk costs. Next leg picks up at two point five, Barriers to Effective Decision-Making."
- The summary lands: the gold **milestone card** on top (Day one of your streak, First trip, First hands-free trip, First question from the road, and Clean run if all three checks were right first time), then legs done, checks right, day streak, the chapter route line, "You explored", and *Next leg picks up at 2.5 …, Time constraints and uncertainty*.
- "You arrive with progress, not an episode. Curiosity counts as progress. And every one of those milestones came from what just happened on the road."

## Beat 6, how it's built (18 s)
- "A whole textbook goes in. Chapters one and two are the book's own text, cut on its headings; the rest is one Claude pass per section into spoken parts with checkpoints. At runtime the server owns your position and feeds the models only the block you're on; the ElevenLabs agent just talks. Claude Haiku answers questions from the book with cached context, Sonnet grades. Next.js."

## Extras if the room wants more
- **"go to chapter one"** → the Topic line and ring change. **"take me to the chapter one quiz"** → the book's own review questions, graded and spoken back. **"I'm done."** ends the trip from anywhere.
- Hands-on (`/learn/study`, the old Study mode): the same section as a page, read aloud with the words highlighted, tap a sentence and ask about it.
- Tap **Hands-off** again after the summary: an ordinary open-ended trip from 2.5 part 3. The demo does not repeat until `npm run demo:stage`.

## Fallbacks
- Mic or ElevenLabs fails: Read quietly is deleted, so the only fallback is `/learn/voice?text=1`, which runs the real agent without audio but takes no commands (the Dial is hands-free).
- Grading API down (no `ANTHROPIC_API_KEY`): MCQs grade locally; open answers fall back to keyword matching, which is lenient and accepts the answers above.
- `ask` slow: the "One sec" filler covers ~3 s; on a timeout the tutor says "I couldn't check that one, say go" and reading resumes.
- The trip does not end after part 2: the demo was not armed (someone browsed away or it already ran). Say "I'm done", run `npm run demo:stage`, reload.
- Timing: the run is about six minutes with unhurried answers. Answering briskly and interrupting early in part two keeps it near five.
