# DESIGN.md — Milestone

Design spec for the Builders Table 2026 demo build. Read alongside CONTEXT.md.
Visual reference (clickable in Play mode): https://claude.ai/artifact/HRYWE31W6koSGhpGwAfuNH

Name: **Milestone** (was Carry). Logo and colours: the Milestone brand kit in `docs/brand/milestone-brand/` (read its handoff for the logo rules). Type: Fraunces over Public Sans.

---

## 1. Principles

1. **The route line is the brand.** A course is a taxi route: 8 stops, one per leg. It appears on Resume and Progress. Do not invent other progress visuals.
2. **Show the promise, don't describe it.** The resume card shows the actual cut-off sentence. Listen mode opens with "Your progress carried over from reading." These two moments are the core proof. Protect them.
3. **Each mode is designed for its moment.** Read mode is light, calm and text-first. Listen mode is dark, glanceable, with big targets. They are not the same screen with sound on.
4. **Nothing on screen we can't back up.** Every number comes from logged data. Every lesson line comes from the source document.

---

## 2. Tokens

### Colour

Colours come from the Milestone brand kit (`docs/brand/milestone-brand/`, brand ink / sand / yellow); token names are unchanged, so components did not move.

| Token | Hex | Use |
|---|---|---|
| `ground` | `#F4EFE6` | Light screen background (brand sand) |
| `panel` | `#EAE3D6` | Unselected answers, Study button, fields (brand sand-deep) |
| `ink` | `#14201B` | Text, primary dark fill, Listen mode background (brand ink) |
| `ink-deep` | `#0C1511` | Listen mode while paused |
| `gold` | `#F2B705` | Primary button fill, current stop, progress fill (brand yellow) |
| `muted` | `#4A5550` | Secondary text on light grounds (brand muted) |
| `rule` | `#D9D0C0` | Hairlines between rows |
| `track` | `#DCD4C5` | Progress track on light grounds |
| `ink-raised` | `#22312A` | Chip background in Listen mode |
| `ink-track` | `#3A4A43` | Progress track and hairlines in Listen mode (brand road) |
| `muted-on-ink` | `#B7C2BB` | Secondary text, outlines and group rules in Listen mode |

**Contrast, checked:**
- ink on ground: about 14.6:1; ink on panel: about 13.1:1
- ink on gold: about 9.2:1 (every gold button carries ink text)
- muted on ground: about 6.8:1; muted on panel: about 6.1:1
- ground on ink: about 14.6:1; muted-on-ink on ink: about 9.1:1, on ink-raised about 7.4:1

**Hard rule:** never put gold text on ground or panel. It measures about 1.6:1 and fails. Gold is only for fills, dots and bars.

### Type

- Display: **Fraunces** (Google Fonts), weights 400 and 600, italic 400
- Body and UI: **Public Sans**, weights 400, 500, 600 and 700
- Fallbacks: `Fraunces, Georgia, serif` and `'Public Sans', 'Helvetica Neue', sans-serif`
- Banned: Inter, Roboto, Arial

| Role | Font | Size / line height | Weight |
|---|---|---|---|
| Big figure (Progress) | Fraunces | 60 / 1.0, tracking −0.02em | 600 |
| Screen heading (Resume) | Fraunces | 34 / 1.12, tracking −0.015em | 600 |
| Listen mode Topic (chapter title) | Fraunces | 34 / 1.12 | 600 |
| Listen mode Section title | Public Sans | 22 / 1.25 | 600 |
| Listen mode state word | Public Sans | 18 | 400 |
| Leg title, question | Fraunces | 28 / 1.15–1.2 | 600 |
| Wordmark | Fraunces | 26 | 600 |
| Resume fragment | Fraunces italic | 23 / 1.35 | 400 |
| Feedback heading | Fraunces | 22 | 600 |
| Course name | Fraunces | 20 | 600 |
| Lesson body | Public Sans | 19 / 1.6 | 400 |
| Button label | Public Sans | 18 | 700 |
| Body, answers | Public Sans | 17 / 1.35–1.6 | 400 |
| Secondary, top bar | Public Sans | 15 | 400 or 600 |
| Small | Public Sans | 13–14 | 500 or 600 |

Copy is sentence case everywhere: no all-caps labels, no emoji, no arrows tacked onto buttons.

### Space, shape, size

- Viewport: 390 × 844. Screen padding: 20px top, 24px sides, 32px bottom.
- Vertical gaps between blocks: 22–28px.
- Radii: 20 (resume card), 16 (primary buttons, feedback box), 14 (answer buttons), 22 (pill buttons), 12 (chip).
- No shadows, no gradients.
- Touch targets are at least 44px. Primary buttons are 60–68px tall. Listen mode is a driving screen: the pause/play dial is 220px, the mic button 96px, End 64px with a 700 ms hold (Android for Cars asks for 76dp targets and 24dp between them).

---

## 3. Components

**Logo.** `MilestoneLogo` (`src/components/carry/MilestoneLogo.tsx`, copied from the kit, artwork untouched): the full lockup, 36px tall, top left on Resume. `theme="dark"` on any dark surface, `mono` where only one colour works. Never recolour the pin, stretch it or retype the wordmark. Favicons, Apple touch icon and `site.webmanifest` live in `public/` and are wired in `src/app/layout.tsx`.

**Groups and separators ("timetable").** Light and dark screens are grouped like a printed timetable, not with cards. Every group opens with a **2px rule** (ink on light, muted-on-ink on dark) and, where it helps, a **group label** (14/600, muted) with an optional right-aligned note (14, muted, tabular numbers, e.g. "4 of 13 legs done"). Rows inside a group are split by **1px hairlines** (`rule`, `ink-track` on dark). Side-by-side figures (the summary's stats, Solid / Worth another look) share one ruled row split by vertical hairlines. Panel fills stay for things you tap (answer buttons, the Study mode button, the ask field), not for grouping. Built with `Group`, `GroupLabel` and `Hairline` in `src/components/carry/Group.tsx`. Kept as they are: the feedback box (outline, now with a hairline above the source line), the gold milestone card on the summary, and the outlined "Quiz waiting" link.

**Motion.** Nothing important waits for an animation: text, buttons and the resume fragment are on screen at first paint. The moving parts:
- **Route line, every load:** the route is drawn dotted with empty stops, then the ink line fills stop by stop to where you are (110 ms a leg), each finished stop pops ink, the current stop pops gold and sends out two soft gold rings. Pure CSS (`route-*` classes in `globals.css`), so it runs on server pages.
- **Leg just finished (summary):** the same fill; the furthest stop the trip finished pops a little bigger with a gold tick as the line passes it. No full-screen takeover.
- **Listen:** the dial's gold ring creeps forward while the tutor reads and holds on pause or barge-in (see screen 3). Alongside the voice strip, it is the only continuous motion.
- **Check / Study checkpoint:** feedback settles in (fade up, 220 ms).
- Reduced motion shows every end state at once.

**Top bar** (44px tall): back chevron on the left (44×44, `aria-label="Back to course"`), leg label in the centre ("Leg 3 of 8", 15/600), mode pill on the right.

**Mode pill:** 44px tall, 2px outline in the text colour, icon plus label. Read mode shows "Listen instead" with a headphones icon. Listen mode shows "Read instead" with a lines icon. Tapping it switches mode **without** changing the learner's position.

**Primary button:** gold fill, ink label at 18/700, radius 16, full width, 60px tall or more. There is one per screen. The dark alternative is an ink fill with a ground-coloured label.

**Mode choice buttons (Resume):** 68px tall, icon, label and a one-line description.
- "Hands-off" / "Just listen, answer out loud" (ink)
- "Hands-on" / "Read along with the book, tap any line to ask" (panel)

**Route line** (SVG, 342×48): one stop per leg, spaced to fit, y = 16. Animated fill on load: see Motion above.
- Finished stop: ink circle, radius 7, joined by a solid ink line (3px).
- Current stop: gold circle, radius 11, with a 3px ink ring, and a label below it (13/600).
- Upcoming stop: ground circle, radius 6, with a 2px muted ring, joined by a dashed line (2px, dash 4 6).
- Give it an `aria-label` that describes the state, e.g. "Legs 1 and 2 done, leg 3 in progress, 5 legs to go".

**Resume block:** a ruled group, no card. The context line is the group label ("Your last trip stopped here"), then the cut-off fragment in Fraunces italic starting with "…", a hairline, then the time left in the leg.

**Pick-up marker (Read mode):** a 10px gold dot with a 2px ink ring, followed by "Picked up where your last trip ended" (14/600). The sentence just before it is shown in muted at 17px, so the reader can find their place.

**Carried-over chip (Listen mode):** ink-raised fill, radius 12, gold dot, "Your progress carried over from reading". Show it whenever the learner arrives from the other mode.

**Answer button:** panel fill, 64px tall or more, radius 14, 17px left-aligned text. Selected and correct: ink fill, ground text at 600 weight, gold check icon, `aria-pressed="true"`.

**Feedback box:** 2px ink outline, radius 16. It holds a verdict (Fraunces 22), one sentence of explanation, and a source line: "From [SOURCE DOC], section [X]". **The source line is required.** It is our visible proof that lessons are grounded.

**Milestone card (Summary):** panel fill, radius 20, padding 18. "Milestone reached" (15, muted), then one row per milestone: the 10px gold dot with a 2px ink ring and the label at 17/600. On Progress, a "Milestones" list uses the trip-row layout (dot and label left, day right). Milestones are named stops earned from logged data (`src/lib/milestones.ts`), awarded once, only for what that trip did. No badges, no points, no emoji.

**Trip row (Progress):** 56px tall, with a hairline below (the group rule is above the first). The left side shows the day and part of day (16/600) over what was covered and in which mode (14, muted). The right side shows the minutes (16/600).

**Icons:** 24px inline stroke SVGs, stroke width 2, round caps and joins, using `currentColor`. There are five, with their paths:
- chevron: `M15 18l-6-6 6-6`
- lines (Read): `M5 6h14M5 11h14M5 16h9`
- headphones: `M4 15v-3a8 8 0 0 1 16 0v3` plus two small rectangles for the ear cups
- mic: a rectangle (x 9, y 3, 6×11, rx 3) plus `M5 11a7 7 0 0 0 14 0M12 18v3`
- check: `M5 12l5 5 9-10`

---

## 4. Screens

**1. Resume.** Wordmark with Settings and "Your progress" links. Three ruled groups: the chapter (label "Chapter 2: …", "n of N legs done", the route line), where you stopped (the resume block), and, pinned to the bottom, "How are you studying today?" with the Hands-off / Hands-on buttons. No greeting or screen heading: the route and the cut-off sentence are the headline. A finished course shows "You finished the course." in the middle group.

**2. Read mode.** Top bar, a 4px progress bar for the current leg, the leg title, the previous sentence in muted text, the pick-up marker, then the lesson in short paragraphs (about 40 words each). At the bottom: a "Check my understanding" button with "Get off any time. Your progress is saved." underneath.

**3. Listen mode: the Dial.** A driving screen, so no lesson text at all: the words are for the ears. Ink background (ink-deep while paused). Top bar ("Leg n of N", Read instead). The **Where block**: "Topic" then the chapter title in Fraunces 34, "Section" then the section title at 22. Centre: the **dial**, a 220px gold pause/play button inside an 8px ring that shows progress through the topic, notched at each section boundary so the ring also shows which section you are in; the ring creeps forward while the tutor reads (each block's slice of the part over its speaking time), holds on pause or barge-in, snaps on a "go back", and the button is only ever pause or play. Bottom row: the **mic button** (96px; outlined at rest, gold outline while the tutor listens, gold fill when a question is waiting for you, ground fill with a slashed mic when muted), the **state word** (one or two words at 18px: Speaking with a gold dot, Listening with four bars, Answer out loud, One sec, Paused, Mic off, a gold tick + That's right for three seconds), and **End** (64px, hold 700 ms, a gold arc fills while held). A 6px **voice strip** on the bottom edge: off when idle or paused, steady while speaking, dashed while listening, a sweep while connecting or thinking; the only animated element. Every state change has a short earcon so the screen is optional. Pause silences the tutor and closes the mic; Continue re-reads the interrupted block from its start. Mute closes the mic only; the lesson keeps going. There is no trip-length picker: the trip starts on arrival and the dial tap is the only tap; the carried-over chip shows above the dial until the session starts. A section or chapter finishing gets a rising earcon and is named aloud; a milestone gets a short fanfare and its label in the state word for three seconds. Layouts and the research behind them: the "Trip Car Mode" artifact.

**4. Check.** Top bar ("End of leg 3"), the question, three answer buttons, the feedback box after answering, and a "Finish leg 3" button.

**5. Progress.** "Learned in transit" with the big figure and trip count, then the route line with the next leg marked, the trip list (newest first), and a "Back to the course" button.

---

**6. Study mode (`/learn/study`).** Hands-on, not a commute; light. Sticky top bar with a "Read aloud / Audio off" pill instead of the mode pill. The leg title (Fraunces 34) and the verbatim text in 19/1.6 paragraphs, one per read-aloud block. While reading aloud: the spoken word carries a gold 35% highlight, the current sentence a 3px gold rule in the left gutter and `ink-deep` text, and a small outlined "Ask" chip. A 72px ink **read-aloud strip** is pinned at the bottom: play/pause (44px), the current sentence as a one-line teleprompter centred on the spoken word, a 3px gold block-progress bar, previous/next sentence, and a speed chip. Audio off removes the strip, rule, highlights and chip: just the page. The assistant is a 62% bottom sheet from a 56px ink FAB (phone) or a persistent 360px right column at `lg` (≥1024px) that also shows "Reading now". The checkpoint uses the answer buttons and feedback box above; on phones it is inline after the passage behind a gold "Check my understanding" button (the FAB hides while a question is open), on desktop it lives in the right column. Source line required, as everywhere. A **leg footer** follows the passage on every screen: outlined "Previous leg" / "Next leg" with the neighbouring section as a caption, and an "All chapters" link; once the leg's checkpoint is done, "Next leg" is the gold primary and the check button goes outlined, so the screen keeps one primary. The top-bar title ("Leg 3 of 8 · 1.3") is a button with a small down chevron that opens **Jump to**, a sheet (centred dialog at `lg`) listing every teachable section with "You are here" / "Done" and "All chapters". Reference: `docs/mockups/study/`.

**7. Settings (`/settings`).** Top bar with back chevron and "Settings". One section, "Voice" (Fraunces 34) with a one-line explanation. Eight rows: an answer-style button (panel fill, 64px, radius 14, hairline; 2px ink ring and a gold dot with an ink ring when chosen, `aria-pressed`) holding the name (17/600) and a one-line blurb (14, muted), and beside it a 56px square play/stop button (ink fill while its sample plays). Samples are static files, so the sample button never waits. A muted footnote says where the choice applies. Linked as an underlined text link from the Resume header and the Progress top bar.

## 5. Content rules

- Every bracketed slot is filled from the seeded course and SOURCE DOC. Nothing is written free-hand.
- Mock values on the canvas (47 min, 4 trips, 3:12, trip rows) are **for layout only**. In the build, these must be calculated from logged sessions.
- Never mention offline use, accreditation or statistics we can't show.
- Keep button labels the same through the flow. "Finish leg 3" leads to a screen that says the leg is finished.

---

## 6. Not designed yet — build must still handle these

These states have no screens yet, and CONTEXT.md requires some of them. Build them plainly using the tokens above.

1. **Dropped request or weak signal.** Say what happened and that progress is safe, e.g. "Lost signal. Your progress is saved. Retrying." Never say anything that implies offline support.
2. **Loading a leg**, especially audio on a slow connection.
3. **Listen mode, playing vs paused.** Paused: ink-deep ground, play glyph, strip off, mic dimmed, "Paused".
4. **Listen mode, answering.** No transcript on screen. The mic fills gold while the question is open; a right answer is a gold tick and "That's right" in the state line for three seconds; a wrong one changes nothing visually, the tutor explains and re-asks. The feedback box with the source line lives on the summary card and in Read mode.
5. **Wrong answer feedback.** Same box, a different verdict, and the correct answer shown.
6. **Course finished** (leg 8 done).
