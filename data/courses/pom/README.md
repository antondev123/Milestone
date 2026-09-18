# Principles of Management (OpenStax) — course data

Source: *Principles of Management*, OpenStax, LibreTexts PDF export (620 pages, 18 chapters, 144 sections), CC BY 4.0. See `LICENSE.md`.

## Regenerate from the PDF

```bash
pdftotext -layout "Principles of Management.pdf" data/courses/pom/raw/pom.txt   # poppler; on Git Bash it is at /mingw64/bin
npm run parse:book          # → source/, course.json, toc.md, chapters/*-review.json, parse-report.json. Free, deterministic.
npm run ingest              # chapters 1–3 → sections/*.json + chapters/*-quiz.json via Claude. ~R1 per chapter.
npm run validate            # manifest ↔ files, ids, question shapes, script hygiene
```

Ingest more: `node --env-file=.env.local scripts/ingest.ts pom --chapters 4-6` (or `--all`). Idempotent: unchanged sections are skipped; `--force` regenerates. `--section 2.5 --force` redoes one.

## What is where

- `source/cNN/cNN-sMM.md` — cleaned section text with learning objectives, concept checks (with the book's answers where it gives them), key terms on the summary section. Edit these if the parse is wrong, then re-ingest.
- `sections/cNN-sMM.json` — spoken lessons: 1–5 parts per section (`round(words/700)`), each with script, key points, alternative explanation, deeper dive, example, 2–3 checkpoint questions.
- `chapters/cNN-quiz.json` — chapter quiz from the book's review questions.
- `ingest.log.jsonl` — every Claude call with tokens and cost.
