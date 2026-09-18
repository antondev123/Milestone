// Split a spoken script into read-sized blocks (~150 words, ~60 s of speech) on sentence boundaries.
// Pure and deterministic, so the same script always yields the same block indices.

export const TARGET_WORDS = 150;
const MIN_TAIL_WORDS = 40;

export function sentences(text: string): string[] {
  const out: string[] = [];
  const re = /[.!?]+["”’')\]]*(?=\s|$)/g;
  let start = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const before = text.slice(start, m.index);
    // not a boundary: initials and abbreviations such as "U.S." or "Dr."
    if (m[0] === "." && (/(?:^|[\s.(])[A-Z]$/.test(before) || /\b(?:Mr|Mrs|Ms|Dr|St|vs|etc|e\.g|i\.e|No)$/.test(before))) continue;
    out.push(text.slice(start, m.index + m[0].length));
    start = m.index + m[0].length;
  }
  out.push(text.slice(start));
  return out.map((s) => s.trim()).filter(Boolean);
}

export function blocks(script: string, target = TARGET_WORDS): string[] {
  const sents = sentences(script.replace(/\s+/g, " ").trim());
  const out: string[] = [];
  let cur: string[] = [];
  let words = 0;
  for (const s of sents) {
    const w = s.split(/\s+/).length;
    if (words > 0 && words + w > target) {
      out.push(cur.join(" "));
      cur = [];
      words = 0;
    }
    cur.push(s);
    words += w;
  }
  if (cur.length) out.push(cur.join(" "));
  // merge a short trailing orphan into the previous block
  if (out.length > 1 && out[out.length - 1].split(/\s+/).length < MIN_TAIL_WORDS) {
    const tail = out.pop()!;
    out[out.length - 1] += " " + tail;
  }
  return out;
}
