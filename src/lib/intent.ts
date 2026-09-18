// What a learner meant when a checkpoint question was open. Two cheap checks run before any model:
// `quickIntent` catches unmistakable commands (zero latency, no attempt burned), and
// `looksLikeQuestion` keeps the grader's local MCQ shortcut from treating "what does escalation of
// commitment mean?" as a pick. Everything else is decided by the grader's classify+grade call.

export type QuickIntent = "repeat" | "resume" | "skip" | "goto" | "hold" | "where" | "giveup";

function norm(s: string): string {
  return s.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9'?. ]/g, " ").replace(/\s+/g, " ").trim();
}

const RULES: [QuickIntent, RegExp][] = [
  ["repeat", /^(um |uh |sorry |wait |hang on |hold on |can you |could you |please |just )*(repeat|say (that|it) again|read (that|it|the options|the question|the choices) again|what (was|were) the (options|choices|question)|what was (option|choice|the)? ?[a-d]( again)?)\b/],
  // coming back from a chat: `next` re-asks the question ("Back to the question.") rather than grading the words
  ["resume", /^(um |uh |okay |ok |right |yes |yeah |no |let'?s |just )*(continue|carry on|go on|back to the (question|lesson)|(go |get )?back to it)( please| now)?\.?$/],
  ["skip", /^(um |uh |just )*(skip( this( one)?| it| that)?|move on|next question|pass on this)\b/],
  // whole utterance only: "wait, what was option B" is a repeat, "hold on, is it C?" is an answer
  ["hold", /^(um |uh |just )*(hold on|wait|pause|hang on|one (sec|second|moment|minute)|give me a (sec|second|moment|minute))( a (sec|second|moment|minute))?( please)?\.?$/],
  ["where", /^(um |uh )*(where am i|where are we|what'?s (next|left)|how (am i|are we) doing)\b/],
  ["giveup", /^(um |uh |sorry |honestly |no )*(i )?(don'?t|do not|dunno|have no idea|no idea|not sure|can'?t remember|just tell me)( know)?( that one| this one| it)?\.?$/],
  ["goto", /\b(go to|take me to|jump to|go back|next (part|section|chapter)|previous (part|section|chapter)|quiz me|start the quiz|(chapter|section) (\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve))\b/],
];

/** An unmistakable command while a question is open, or null to let the model decide. */
export function quickIntent(text: string): QuickIntent | null {
  const t = norm(text);
  if (!t) return null;
  for (const [kind, re] of RULES) if (re.test(t)) return kind;
  return null;
}

const WH = /^(um |uh |so |sorry |hey |okay |ok )*(what|why|how|when|where|who|which|is it|is that|isn'?t|does|do you|did|can you|could you|would|should|are|am i|do i|do we|mean|wait what)\b/;

/** Reads as a question or a request rather than an attempt at the answer. */
export function looksLikeQuestion(text: string): boolean {
  const t = norm(text);
  if (!t) return false;
  if (t.endsWith("?")) return true;
  if (WH.test(t)) return true;
  return false;
}

/** Short enough to be a spoken pick ("it's escalation of commitment") rather than a sentence about it. */
export function isShortPick(text: string): boolean {
  return norm(text).split(" ").length <= 12 && !looksLikeQuestion(text);
}
