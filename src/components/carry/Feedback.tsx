// Feedback box: verdict, one sentence, and the source line. The source line is required.
export function Feedback({
  correct,
  text,
  source,
  dark = false,
}: {
  correct: boolean;
  text: string;
  source: string;
  dark?: boolean;
}) {
  return (
    <div role="status" className={`flex flex-col gap-2 rounded-2xl border-2 p-[18px] ${dark ? "border-muted-on-ink" : "border-ink"}`}>
      <div className="font-display text-[22px] font-semibold">{correct ? "That's right." : "Not quite."}</div>
      {text && <p className="text-[17px] leading-normal">{text}</p>}
      <div className={`text-sm ${dark ? "text-muted-on-ink" : "text-muted"}`}>{source}</div>
    </div>
  );
}

/** The box already shows the verdict, so drop one the spoken reply leads with. */
export function stripVerdict(text: string): string {
  return text.replace(/^\s*(not quite|correct|that'?s (right|it)|right|yes|no|nope|exactly)\s*[.!,:]\s*/i, "");
}
