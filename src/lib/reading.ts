// Word and sentence index for one read-aloud block. Pure and client-safe. The word list is
// `text.split(/\s+/)`, which is exactly how /api/tts counts words, so timings line up by index.
import { sentences } from "./chunk";

export interface SentenceSpan {
  first: number; // word index, inclusive
  last: number;
  text: string;
}

export interface BlockIndex {
  words: string[];
  sentences: SentenceSpan[];
  sentenceOf: number[]; // word index → sentence index
}

export function indexBlock(text: string): BlockIndex {
  const words = text.split(/\s+/).filter(Boolean);
  const out: SentenceSpan[] = [];
  let at = 0;
  for (const s of sentences(text)) {
    const n = s.split(/\s+/).filter(Boolean).length;
    if (n === 0) continue;
    out.push({ first: at, last: at + n - 1, text: s });
    at += n;
  }
  // the splitter is deterministic, but if it ever disagrees with the word count, one sentence per block still works
  const spans = at === words.length ? out : [{ first: 0, last: words.length - 1, text }];
  const sentenceOf = new Array<number>(words.length);
  spans.forEach((s, si) => {
    for (let w = s.first; w <= s.last; w++) sentenceOf[w] = si;
  });
  return { words, sentences: spans, sentenceOf };
}

/** Sentence text with the tapped block's neighbours, for "Ask about this". */
export function sentenceAt(index: BlockIndex, wordIdx: number): SentenceSpan | undefined {
  return index.sentences[index.sentenceOf[wordIdx] ?? -1];
}
