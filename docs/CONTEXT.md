# CONTEXT.md

Context for anyone — human or AI coding tool — working on this build.
Builders Table 2026 hackathon. Submission closes 11:59 Saturday 19 September.

---

## 1. What we are building

A commute learning app. Courses are cut into "legs" short enough for one trip,
so a learner starts whenever they sit down and stops whenever they get off.
The format follows the journey: audio through earphones on a taxi, hands-free
while driving, silent short text when listening isn't possible. Progress carries
across every leg and every mode — the next trip picks up mid-sentence where the
last one stopped.

Working name: [NAME]. Alternatives on the table: Mile, Onboard, Carry.

### One sentence
For someone who spends a long trip getting to work, it turns that trip into a
lesson they can pick up and put down at will, so dead time becomes progress on
something they chose to learn.

### Positioning lines (use verbatim in UI copy and pitch)
- "Learning that rides along — and picks up mid-sentence wherever your last trip ended."
- "It listens when you can talk, and reads when you can't."
- "The commute finishes the course."

---

## 2. The brief and how we are judged

Brief: travel — "building for the journey not the destination. More than where
you land, build for the moments in between."

Criteria, in the organisers' words:
- **Idea** — an original real-world problem
- **Execution** — does it work, how far did it go
- **Design** — clear, considered, good to use
- **Pitch** — did they prove its value in the time given
- **Impact** — what does it help, could it make a difference (commercial viability)
- Plus: **is the problem real** (evidence someone actually has it)

Implications for the build:
- A rough thing that runs beats a beautiful thing that doesn't. Working demo first.
- The judges are product, design and brand people, not engineers. One screen done
  beautifully beats four screens done adequately.
- Everything demoed must be checkable. No claims we can't show.

---

## 3. The user

Primary: a South African commuter, typically on a minibus taxi, bus or train,
travelling roughly an hour each way. Uses a mid or low-end Android phone. Data
is a real cost. In a taxi they will not talk to their phone or wave it around.

Secondary (funding, not using): an employer with frontline staff who must spend
on skills development and whose problem is course completion.

---

## 4. Scope for the demo

### Must work end to end
1. A learner opens a course mid-way and resumes exactly where the last leg ended.
2. A lesson leg is delivered in **text mode** (silent, short, tap answers).
3. A lesson leg is delivered in **voice mode** (audio out, spoken or tapped answer).
4. **Switching mode mid-course keeps progress intact.** This is the core proof.
5. A short check-for-understanding question at the end of a leg, with feedback.

### Nice to have, in this order
6. Ingesting a source document (employer handbook, PDF) and generating a course from it.
7. Progress summary screen with time learned in transit.
8. Trip-length awareness: "you have ~20 minutes, here's a leg that fits."

### Explicitly out of scope — do not build
- Accounts, sign-up, password reset. Hard-code one learner.
- Payments, employer dashboards, admin panels.
- Real-time location, transport APIs, journey detection.
- Offline mode. **The app needs a connection. Do not claim otherwise.**
- Multi-language delivery. Roadmap only.

---

## 5. Honesty rules (non-negotiable)

- **The app requires data today.** Never state or imply offline support in UI,
  pitch or README. Offline and zero-rating are roadmap items.
- **No invented statistics, quotes or partner names.** Bracketed placeholders only.
- **No claim of accreditation.** Say "course completion" or "progress you can
  report on". We are a delivery layer, not an accredited provider.
- **Lessons are grounded in a supplied source document**, not generated free-hand.
  Hallucinated safety or compliance content is a liability and a judge will test it.
- On the "how it works" slide, state plainly what is real and what is mocked.

---

## 6. Technical notes

- Stack: [FILL IN]. Model: [FILL IN].
- Seeded content: one course, [COURSE TOPIC], 8 legs, grounded in [SOURCE DOC].
- Progress state must persist server-side keyed to the learner, not in a live
  session — the whole promise is surviving interruption.
- Measure and record the data cost of one lesson leg in each mode. We need the
  number for the pitch.
- Target viewport: 390 x 844 (phone). Design phone-first, demo phone-first.
- Touch targets minimum 44px. Text contrast 4.5:1 (3:1 at 24px+).
- Assume patchy signal: handle a dropped request without losing progress.

---

## 7. Design direction

Chosen direction: [MILE / ONBOARD / CARRY]

- **Mile** — ground #FDF6EC, sand #F3E7D5, accent #C2451A, support #14614A,
  ink #17120E, muted #6E5F52. Bricolage Grotesque over Manrope.
- **Onboard** — ground #0D1014, surface #181D24, accent #F4B740, support #56A79B,
  text #EDEFF2, muted #949BA5. Space Grotesk over DM Sans.
- **Carry** — ground #F5F2EC, panel #EDE7DB, ink #16324F, accent #E0A419,
  muted #5C6570. Fraunces over Public Sans. Gold for fills and large text only.

Rules: one type scale, no gradients, no emoji, no Inter/Roboto/Arial. Voice mode
and text mode must feel designed for their moment, not the same screen with the
sound on.

---

## 8. Demo script (2 minutes, every click scripted)

1. Open on a course already in progress. "Thandi finished leg 2 on the way in."
2. Resume — it picks up mid-sentence. Show the text mode leg. Answer the check question.
3. Switch to voice mode. Show progress carried across, audio playing, answer out loud.
4. Show the progress summary: time learned in transit, legs completed.
5. If built: paste a source document, watch a new course appear.

Fallbacks: backup video recorded from the final build; screenshots for each step.

---

## 9. Pitch structure

Problem → evidence it's real → who it's for → live demo → how it works (real vs
mocked) → what's next and who pays → team. Repeat the name at the end.

Impact answer: employers must spend a share of payroll on skills development and
their problem is completion; learners can also come on their own. Verify before
stating on stage: whether this format counts toward the B-BBEE 6% target, and
whether the mandatory grant is 20% or 40%.

---

## 10. Open items

- [ ] Name locked, domain checked
- [ ] Data cost per lesson measured
- [ ] Two real commuter quotes collected for the evidence slide
- [ ] Backup demo video recorded
- [ ] Repo clean and submitted before 11:59
