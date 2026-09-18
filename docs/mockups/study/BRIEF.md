# Study mode (hands-on) — mockup brief

Product: Milestone. Turns commute time into course progress. The EXISTING app has a hands-free
"Listen" mode (dark, big targets, voice agent) and a "Read quietly" text mode. Both are for the
commute. Do NOT redesign those.

We are exploring a THIRD, separate surface: **Study mode**. Not commuting. Phone (or tablet) in
hand, sitting down. The learner wants to see the ACTUAL course material (the textbook, as it is),
optionally hear it read aloud with the words being spoken visibly tracked, ask an AI assistant
questions about the passage, and answer checkpoint questions with a normal tap/type UI.

Hard requirements for the mockup:
1. Standalone HTML file. No build step. Google Fonts only (Fraunces 400/600 + italic 400, Public Sans 400/500/600/700). No other CDN. All CSS/JS inline.
2. Mobile-first, phone frame 390×844 rendered on the page (a rounded device frame on a neutral backdrop). If your direction also has a tablet/desktop layout, render a second frame next to it (e.g. 900×700).
3. Use REAL content: section 1.4 "Major Characteristics of the Manager's Job" from `source-1.4.txt` in this folder (the pdftotext of the LibreTexts/OpenStax PDF). Keep the book's structure visible: section number+title, "Learning Objectives" box, body paragraphs with the bold lead-ins ("Time is fragmented.", "Values compete…", "The job is overloaded.", "Efficiency is a core skill."), the "What Varies in a Manager's Job?" subheading, footnote marker 20, the page marker "10 (1.4.1)". Do not invent prose.
4. Interactive, not static:
   - **Play/pause read-aloud** that simulates TTS: advance through the text word by word (~2.6 words/s) with a visible highlight on the current word AND the current sentence. This is the core thing to nail: "a clean stream of where it's at in its sentence". The current sentence must never be lost when scrolling; think about a pinned "now reading" strip / mini-player. Auto-scroll the page to keep the spoken sentence in view. Tapping any sentence should jump playback there.
   - **Audio off** toggle: when off, ALL read-aloud chrome collapses and the page is just the material, clean, like a PDF viewer. The assistant and question UI must still work with audio off.
   - **AI assistant**: a way to open a chat about the passage. Seed it with one canned exchange grounded in the text, e.g. Q: "What does 'diminishing marginal returns' mean here?" A: an answer that quotes the passage and ends with a source line "From Principles of Management by OpenStax, section 1.4". Include a "Ask about this" affordance from a selected/tapped sentence (can be simulated by long-press or a small button on the current sentence).
   - **Checkpoint question UI**: at the end of the passage show the checkpoint. MCQ: "According to classical management theory, what is the most direct reports a manager can reasonably handle?" options Seven / Twelve / Thirty (answer Seven). Open: "Why does the chapter call efficiency the core management skill of the twenty-first century?" with a text box. Show the feedback box after answering: verdict (Fraunces 22), one sentence, and the required source line "From Principles of Management by OpenStax, section 1.4". Wrong-answer state too.
   - A "Switch to Listen mode" affordance somewhere unobtrusive (it's the commute mode; position is shared, so say "Your place carries over").
5. Design tokens (Carry, from docs/DESIGN.md). Study mode is a LIGHT mode:
   ground #F5F2EC (bg), panel #EDE7DB (cards/unselected answers), ink #16324F (text, dark fills), gold #E0A419 (fills, dots, bars, highlights ONLY — never gold text on light), muted #5C6570, rule #D6CCBA (hairlines), track #DDD4C4, ink-raised #22425F, ink-track #2E4E6C, muted-on-ink #B8C3CF.
   Fraunces for headings/verdicts/captions; Public Sans for body/UI. Sentence case everywhere, no all-caps, no emoji, no shadows, no gradients. Radii: 20 card, 16 primary button, 14 answer button, 22 pill, 12 chip. Touch targets ≥44px. Primary button: gold fill, ink label 18/700, ≥60px tall, one per screen.
   Top bar 44px: back chevron left, "1.4 · Leg 5 of 8" centre (15/600), mode pill right (44px, 2px ink outline).
   Icons: 24px stroke SVG, stroke 2, round caps, currentColor. chevron `M15 18l-6-6 6-6`, lines `M5 6h14M5 11h14M5 16h9`, headphones `M4 15v-3a8 8 0 0 1 16 0v3` + ear cups, check `M5 12l5 5 9-10`. Draw play/pause/speaker/chat icons in the same style.
   The word highlight: gold at ~35% behind the word, current sentence gets a subtle panel (#EDE7DB) background or a 3px gold left rule — your call, but it must read at arm's length and not look like a search-hit mess.
6. Put a small "Notes for the team" panel OUTSIDE the phone frame (below or beside) with 4–8 bullets: what this direction optimises for, what it costs, and what the engine needs (e.g. word timestamps from ElevenLabs TTS `with_timestamps`, cursor stays block-level, etc.).
7. Save to the file path you are given. Open nothing, install nothing. Write the file, check it for JS errors by reading it back carefully, done.

Engine facts you can rely on (for the notes):
- Server owns the cursor: segment → block (~150 words) → phase (read/ask/done). Speech tools: next, explain, answer, ask, goto, where_am_i, interrupted, end_trip. Text mode already renders these.
- Grading: MCQ local; open answers go to Claude via grader; ~4 s latency.
- `ask` is grounded on the manifest toc + the current segment text (Haiku 4.5).
- Chapter 1 is verbatim from the PDF text layer (`data/courses/pom/verbatim/`), so "the book as it is" is available as plain text per leg. No page images at runtime today; a PDF-facsimile view means rendering the text with book-like styling, OR shipping page PNGs (would need an offline rasterise step, none exists yet).
- ElevenLabs TTS can return character-level timestamps (`/v1/text-to-speech/{voice}/with-timestamps`), which is how word tracking would be driven for real.
