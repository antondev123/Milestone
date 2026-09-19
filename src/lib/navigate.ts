// Resolve spoken navigation targets against the course manifest without embeddings.
// Stages: ordinal/numeral → relative → quiz → lexical (BM25-lite over titles/key terms/objectives).
import { allSegments, chapterOf, sectionOf, type Course, type SectionMeta } from "@/types/lesson";

export type Target =
  | { kind: "segment"; segmentId: string; via: string }
  | { kind: "quiz"; chapterId: string; via: string }
  | { kind: "back"; via: string }
  | { kind: "skip"; via: string }
  | { kind: "ambiguous"; candidates: { sectionId: string; title: string; number: string }[] }
  | { kind: "none" };

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, first: 1, second: 2, third: 3,
  fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
};
const numOf = (s: string): number | null => (/^\d+$/.test(s) ? Number(s) : (NUMBER_WORDS[s] ?? null));

const STOP = new Set("the a an of to in on for and or with about that this what is are be me my it its go take jump show tell part section chapter bit thing stuff please can you where".split(" "));
const stem = (w: string) => w.replace(/(ings?|ed|es|s)$/, "");
const tokens = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w && !STOP.has(w)).map(stem);

interface IndexEntry {
  section: SectionMeta;
  chapterId: string;
  fields: { terms: string[]; weight: number }[];
}
const indexCache = new Map<string, { entries: IndexEntry[]; df: Map<string, number> }>();

function index(course: Course) {
  const hit = indexCache.get(course.id);
  if (hit) return hit;
  const entries: IndexEntry[] = [];
  const df = new Map<string, number>();
  for (const ch of course.chapters) {
    const keyTerms = ch.sections.flatMap((s) => s.keyTerms.map((k) => k.term));
    for (const s of ch.sections) {
      if (s.kind === "summary") continue;
      const fields = [
        { terms: tokens(s.title), weight: 3 },
        { terms: tokens(ch.title), weight: 1 },
        { terms: tokens(s.objectives.join(" ")), weight: 1.5 },
        // key terms belong to the chapter; give them to every teachable section of the chapter at low weight,
        // and to the section whose title/objectives mention them at full weight
        { terms: tokens(keyTerms.join(" ")), weight: 0.4 },
        { terms: tokens(s.segments.map((g) => g.title).join(" ")), weight: 2 },
      ];
      const seen = new Set(fields.flatMap((f) => f.terms));
      for (const t of seen) df.set(t, (df.get(t) ?? 0) + 1);
      entries.push({ section: s, chapterId: ch.id, fields });
    }
  }
  const built = { entries, df };
  indexCache.set(course.id, built);
  return built;
}

function firstSegmentOf(section: SectionMeta): string | null {
  return section.segments[0]?.id ?? null;
}

/** First segment of the section before the one `segs[curIdx]` is in; null at the start of the course. */
function previousSectionStart(segs: ReturnType<typeof allSegments>, curIdx: number): string | null {
  if (curIdx < 0) return null;
  const cur = segs[curIdx].sectionId;
  let i = curIdx - 1;
  while (i >= 0 && segs[i].sectionId === cur) i--;
  if (i < 0) return null;
  const prev = segs[i].sectionId;
  while (i > 0 && segs[i - 1].sectionId === prev) i--;
  return segs[i].id;
}

/** The part before the current one in course order; null at the very first part. */
export function previousSegmentId(course: Course, currentSegmentId: string): string | null {
  const segs = allSegments(course);
  const i = segs.findIndex((s) => s.id === currentSegmentId);
  return i > 0 ? segs[i - 1].id : null;
}

export function resolveTarget(course: Course, currentSegmentId: string, spoken: string): Target {
  const q = spoken.toLowerCase().replace(/[^a-z0-9.\s]/g, " ").replace(/\s+/g, " ").trim();
  const segs = allSegments(course);
  const curIdx = segs.findIndex((s) => s.id === currentSegmentId);
  const curChapter = chapterOf(course, currentSegmentId);
  const curSection = sectionOf(course, currentSegmentId);

  // relative / flow. "previous section / part / chapter" is a place in the manifest, like "next section";
  // plain "go back" / "where I was" is the return stack (trip-mu81rfl5: "previous section" on a fresh trip
  // hit the empty stack and got "nowhere to go back to").
  if (/\b(previous|last|prior) section\b/.test(q)) {
    const id = previousSectionStart(segs, curIdx);
    if (id) return { kind: "segment", segmentId: id, via: "relative" };
  }
  if (/\b(previous|last|prior) (part|segment)\b/.test(q) && curIdx > 0) return { kind: "segment", segmentId: segs[curIdx - 1].id, via: "relative" };
  if (/\b(previous|last|prior) chapter\b/.test(q) && curChapter) {
    const ch = course.chapters.find((c) => c.number === curChapter.number - 1);
    const first = ch?.segments[0]?.id;
    if (first) return { kind: "segment", segmentId: first, via: "relative" };
  }
  if (/\b(back|previous|where i was|last part)\b/.test(q) && !/\bchapter \w+|section \w+/.test(q)) return { kind: "back", via: "relative" };
  if (/^(skip|move on|skip this|skip ahead)\b/.test(q)) return { kind: "skip", via: "flow" };
  if (/\bnext (part|segment)\b/.test(q) && curIdx >= 0 && segs[curIdx + 1]) return { kind: "segment", segmentId: segs[curIdx + 1].id, via: "relative" };
  if (/\bnext section\b/.test(q) && curSection) {
    const after = segs.slice(curIdx + 1).find((s) => s.sectionId !== curSection.id);
    if (after) return { kind: "segment", segmentId: after.id, via: "relative" };
  }
  if (/\bnext chapter\b/.test(q) && curChapter) {
    const ch = course.chapters.find((c) => c.number === curChapter.number + 1);
    const first = ch?.segments[0]?.id;
    if (first) return { kind: "segment", segmentId: first, via: "relative" };
  }
  if (/\b(start of|beginning of) (this|the) (section|part)\b/.test(q) && curSection) {
    return { kind: "segment", segmentId: firstSegmentOf(curSection)!, via: "relative" };
  }

  // quiz
  if (/\b(quiz|test me|questions for|exam)\b/.test(q)) {
    const m = q.match(/chapter (\w+)/);
    const n = m ? numOf(m[1]) : null;
    const ch = n ? course.chapters.find((c) => c.number === n) : curChapter;
    if (ch) return { kind: "quiz", chapterId: ch.id, via: "quiz" };
  }

  // section number "2.5" / "two point five" / "section two five"
  const dotted = q.match(/\b(\d{1,2})\.(\d{1,2})\b/) ?? q.match(/\b(\w+) point (\w+)\b/) ?? q.match(/\bsection (\w+) (\w+)\b/);
  if (dotted) {
    const c = numOf(dotted[1]);
    const s = numOf(dotted[2]);
    if (c && s) {
      const ch = course.chapters.find((x) => x.number === c);
      const sec = ch?.sections.find((x) => x.number === `${c}.${s}`);
      const first = sec ? firstSegmentOf(sec) : null;
      if (first) return { kind: "segment", segmentId: first, via: "ordinal" };
      if (sec) return { kind: "none" }; // exists but not ingested
    }
  }

  // chapter N
  const chapterM = q.match(/\bchapter (\w+)\b/);
  if (chapterM) {
    const n = numOf(chapterM[1]);
    const ch = n ? course.chapters.find((c) => c.number === n) : null;
    const first = ch?.segments[0]?.id;
    if (first) return { kind: "segment", segmentId: first, via: "ordinal" };
    if (ch) return { kind: "none" };
  }

  // lexical
  const { entries, df } = index(course);
  const N = entries.length;
  const qt = tokens(q);
  if (!qt.length) return { kind: "none" };
  const scored = entries
    .map((e) => {
      let score = 0;
      for (const t of new Set(qt)) {
        const idf = Math.log(1 + N / ((df.get(t) ?? 0) + 0.5));
        for (const f of e.fields) if (f.terms.includes(t)) score += idf * f.weight;
      }
      // bigram bonus
      for (let i = 0; i + 1 < qt.length; i++) {
        for (const f of e.fields) {
          const j = f.terms.indexOf(qt[i]);
          if (j >= 0 && f.terms[j + 1] === qt[i + 1]) score += 2 * f.weight;
        }
      }
      return { e, score };
    })
    .filter((x) => x.score > 0 && x.e.section.segments.length > 0)
    .sort((a, b) => b.score - a.score);
  if (!scored.length) return { kind: "none" };
  const [top, second] = scored;
  if (!second || top.score >= 1.6 * second.score || top.score - second.score > 4) {
    return { kind: "segment", segmentId: firstSegmentOf(top.e.section)!, via: "lexical" };
  }
  return {
    kind: "ambiguous",
    candidates: [top, second].map((x) => ({ sectionId: x.e.section.id, title: x.e.section.title, number: x.e.section.number })),
  };
}
