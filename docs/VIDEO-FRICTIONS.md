# Judges' video: what the simulated user hit

Recorded 2026-09-19 on `main` at 5619a43 with a scripted mic (ElevenLabs TTS clips fed into `getUserMedia`, headless Chrome, tab capture). Four takes; take 4 is the video. Harness and takes live outside the repo in `C:\Dev\hackathon-video\` (README there). Session logs for every take are in `data/progress/logs` (`npm run sessions`).

Everything below happened to the agent and the app as shipped. None of it needed a code change to get the video; all of it is worth a look before the live stage run.

## Product frictions (fix candidates)

1. **Eager turn-taking splits a considered open answer.** The demo answer from DEMO.md ("Because you can't know every alternative or what each one leads to, and even if you could…") was cut at the first pause. The first half was graded on its own (✓), the second half then arrived as a *new* answer and was rejected with "Try once more". Seen in takes 1 and 2, identically. A real learner speaking in two breaths will hit this. Options: ignore user turns for ~2 s after a correct grade, or have the prompt treat a follow-on fragment as an addendum. For the video the answer was shortened to one breath.
2. **Agent stalls in "speaking" mode after a phantom `...` user transcript.** Takes 1 and 3: mid-block, ElevenLabs emitted a learner transcript of just `...` (silence), no interruption event, and the agent's mode stayed `speaking` with no audio for 60 s (take 1) and ~3 min (take 3). Nothing resumed until the user spoke. Take 4's fallback would have said "skip ahead" after 85 s. Reproduce with a quiet room and a long block; a watchdog that nudges "continue" when `speaking` has outlived the block's expected length would cover it.
3. **`end_trip` called twice by the agent** (take 2): the second call got the 409 stale reply, the agent hung up itself within a second, and the closing line was not heard in full. Takes 3 and 4 were fine (closing line ~20 s, then the summary). The prompt could say the tool is one-shot.
4. **State line stays on "Speaking" after an `ask` answer** (every take): the answer ends, the mic is open, but the word under the dial still says Speaking until the learner talks. Cosmetic, but on stage it reads as "it froze".
5. **"Explain that again, more simply" runs two tools**: the agent called `explain(again)`, interrupted itself, then `explain(simpler)`. Say one thing ("explain that more simply") or make the prompt pick one.
6. **Closing line is long for a video/stage** (~20 s: "Trip done. One part, two of two right. Chapter is … Milestone: … You explored … Next leg picks up at …"). Fine in a car, slow on stage. Consider a short spoken form with the detail left to the summary card.
7. **Hands-on answer is text only.** Dictation works (Scribe, ~1.1–1.5 s) but the tutor's reply is not spoken, so the desktop scene has 11 s of silence while the answer streams. Speaking the first sentence of the reply through `/api/tts` would close that gap.

## Worked well (numbers from take 4)

| Step | Latency |
|---|---|
| Dial tap → greeting speech | 3.3 s |
| Interrupt mid-block → "One sec" | 1.6 s; answer from the book, milestone "First question from the road" |
| "continue" → reading resumes | < 2 s ("Back to Bounded rationality…") |
| Open answer → Claude grade spoken | 3.8 s, ✓ |
| MCQ ("the new ground one") → "That's right", milestone earcon | 3.1 s |
| "take me back to section two point three" → Topic/Section line changes and 2.3 reads | 2.4 s (`goto` resolves "section 2.3" correctly) |
| "hold on a second" → "Holding." / "okay, carry on" → block from the top | ~1 s each |
| "I've arrived" → closing line → summary | 20 s (line heard in full) |
| Study dictation → text in the composer | 1.5 s |
| Study ask → reply visible | 3.7 s |

Summary card after the trip: First question from the road, First trip, First hands-free trip, Day one of your streak; 1 part, 2/2 checks, 1-day streak.

## Harness notes
- `goto` phrasing "go back to 2.3" was avoided (the `back` branch in `navigate.ts` wins); "take me back to section two point three" resolved to `section 2.3` every time.
- The fake mic must be plain silence between lines: a −100 dB keep-alive tone made Scribe emit `...` turns.
- Headless Chrome is required for a clean 1920×1080 tab capture; headed Chrome captured the real window size.
