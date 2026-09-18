// Script slicing shared by server screens and client modes. Positions are character
// offsets into segment.script, so Read and Listen mean exactly the same place.

export interface Sentence {
  start: number; // char offset of first char
  end: number; // char offset after last char
  text: string;
}

export function sentences(script: string): Sentence[] {
  const out: Sentence[] = [];
  const push = (from: number, to: number) => {
    const chunk = script.slice(from, to);
    const lead = chunk.length - chunk.trimStart().length;
    const text = chunk.trim();
    if (text) out.push({ start: from + lead, end: from + lead + text.length, text });
  };
  const re = /[.!?]+["')\]]*(?=\s|$)/g;
  let start = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(script))) {
    const before = script.slice(start, m.index);
    // not a boundary: initials and abbreviations such as "U.S." or "Dr."
    if (m[0] === "." && (/(?:^|[\s.(])[A-Z]$/.test(before) || /\b(?:Mr|Mrs|Ms|Dr|St|vs|etc|e\.g|i\.e|No)$/.test(before))) continue;
    push(start, m.index + m[0].length);
    start = m.index + m[0].length;
  }
  push(start, script.length);
  return out;
}

/** Index of the sentence containing (or starting after) the offset. */
export function sentenceAt(list: Sentence[], offset: number): number {
  const i = list.findIndex((s) => offset < s.end);
  return i < 0 ? list.length - 1 : i;
}

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

/** Group sentences into short paragraphs of about `target` words, starting at sentence `from`. */
export function paragraphs(list: Sentence[], from = 0, target = 40): Sentence[][] {
  const out: Sentence[][] = [];
  let cur: Sentence[] = [];
  let n = 0;
  for (let i = from; i < list.length; i++) {
    cur.push(list[i]);
    n += words(list[i].text);
    if (n >= target) {
      out.push(cur);
      cur = [];
      n = 0;
    }
  }
  if (cur.length) {
    // fold a short tail into the previous paragraph so nothing reads as an orphan
    if (out.length && n < target / 3) out[out.length - 1].push(...cur);
    else out.push(cur);
  }
  return out;
}

/** The last few words before `offset`, for the resume card: "…every rand has a job before the". */
export function fragmentBefore(script: string, offset: number, maxWords = 14): string {
  let head = script.slice(0, offset);
  if (/\w$/.test(head) && /^\w/.test(script.slice(offset))) head = head.replace(/\S+$/, ""); // never show half a word
  const w = head.trimEnd().split(/\s+/).filter(Boolean);
  return w.slice(-maxWords).join(" ");
}

/** The first few words from `offset`, for a leg that has not started yet. */
export function fragmentFrom(script: string, offset: number, maxWords = 14): string {
  const w = script.slice(offset).trim().split(/\s+/).filter(Boolean);
  return w.slice(0, maxWords).join(" ").replace(/[,;:]+$/, "");
}

/** True when the offset sits inside a sentence rather than on a boundary. */
export function isMidSentence(script: string, offset: number): boolean {
  const before = script.slice(0, offset).trimEnd();
  return before.length > 0 && !/[.!?]["')\]]*$/.test(before);
}

export function formatClock(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
