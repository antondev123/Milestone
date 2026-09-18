# Source

Chapter 1, "Managing and Performing", of *Principles of Management* (OpenStax, via LibreTexts), licensed CC BY 4.0.
Original: https://openstax.org/details/books/principles-management

- `chapter1.txt` is the PDF's text layer for chapter 1 (`pdftotext -layout`), unedited. Recreate it with
  `node scripts/pdf-course.ts extract "<path>/Principles of Management.pdf"`.
- `legs.json` says where each of the eight legs starts and ends in that text, which layout noise to strip
  (figure captions, exhibit references, footnote markers), and holds the authored parts: leg titles, key points,
  alternative explanation, "go deeper" note and check questions. Questions and answers are written from the leg's own text.
- `npm run course:build` turns both into `../lesson.json`. Leg scripts are the source's words; nothing is paraphrased.
