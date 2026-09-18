# LEDGER

All amounts in rands. FX R16.26/USD on 2026-09-18. Refresh live numbers with `npm run ledger`.

## Balances

| Service | Plan | Used | Left | Resets |
|---|---|---|---|---|
| ElevenLabs | Creator, R358/month (US$22) for 100k credits, account shows 131k | 2,708 credits (R9.69) | 128,292 credits (R459) | 2026-10-18 |
| Anthropic | Pay as you go | see below | prepaid balance not visible via API, check console.anthropic.com | n/a |

Credit price: R0.0036 per credit. Voice runs about 500 credits per minute, so roughly **R1.80 per minute of conversation**, LLM included. **~262 minutes of voice left** this month.

## Spend log

| Date | What | Provider | Units | Rands |
|---|---|---|---|---|
| 2026-09-18 | Ingest sample course, Sonnet 5 | Anthropic | 3.7k in / 7.1k out | R1.27 |
| 2026-09-18 | Smoke tests + 5 grading tests, Sonnet 5 | Anthropic | ~1.5k in / 0.3k out | R0.10 |
| 2026-09-18 | Voice test call 1, 71 s | ElevenLabs | 597 credits | R2.14 |
| 2026-09-18 | TTS previews / misc | ElevenLabs | 219 credits | R0.78 |
| 2026-09-18 | Voice test call 2, 235 s (repeat, go deeper, skip, quiz, explain) | ElevenLabs | 1,892 credits | R6.77 |
| 2026-09-18 | Ingest Principles of Management ch 1–3 (19 sections, 35 parts, 3 chapter quizzes), Sonnet 5, 24 calls | Anthropic | ~94k in / 96k out | R18.86 |
| | **Running total** | | | **R29.92** |

## Rules of thumb for the event

- 3-minute rehearsal: R5.40. Twenty rehearsals: R108.
- Ingesting one textbook section (1–5 parts): R0.40–R1.90. Chapters 1–3: R19. The whole 18-chapter book: about R110 (R55 on the Batch API).
- A grade on Sonnet 5: about R0.03. Grading is never the cost problem.
- Hard cap to stay under on ElevenLabs: keep 20,000 credits (about 40 min) in reserve for demo day.

## How to update

- Anthropic: the dev server prints `[grade] … ~$x` per grade, and ingest prints token usage. Add a row when you do something non-trivial.
- ElevenLabs: run `npm run ledger`, copy the totals into the table.
