"use client";
// Listen mode: dark, glanceable, big targets. The phone reads the leg one sentence at a
// time; word boundaries move the place, so pausing or switching to Read keeps the exact
// word. At the end of the leg it asks the check questions and takes spoken answers.
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { GradeResponse, Mode } from "@/types/lesson";
import { formatClock, sentenceAt, sentences } from "@/lib/text";
import { ModePill, PrimaryButton, Screen, SignalNotice, TopBar } from "@/components/carry/Chrome";
import { ChevronIcon, MicIcon, PauseGlyph, PlayGlyph } from "@/components/carry/Icons";
import { Feedback, explain, type CheckQuestion } from "@/components/carry/Feedback";
import { persist, postJSON, usePlace } from "@/components/carry/usePlace";
import { useListener, useSpeaker } from "@/components/carry/speech";

type Result = { correct: boolean; text: string; heard: string };

function questionSpeech(q: CheckQuestion, i: number, n: number): string {
  const head = n > 1 ? `Question ${i + 1} of ${n}. ` : "";
  if (q.type !== "mcq" || !q.options.length) return `${head}${q.prompt}`;
  const opts = q.options.length > 1 ? `${q.options.slice(0, -1).join("? ")}? Or ${q.options.at(-1)}?` : q.options[0];
  return `${head}${q.prompt} Is it: ${opts}`;
}

export function ListenLeg(props: {
  segmentId: string;
  script: string;
  durationSec: number;
  legNumber: number;
  legTotal: number;
  offset: number;
  atCheck: boolean;
  lastMode: Mode | null;
  source: string;
  questions: CheckQuestion[];
}) {
  const { segmentId, script, durationSec, questions, legNumber } = props;
  const router = useRouter();
  const sents = useMemo(() => sentences(script), [script]);
  const tts = useSpeaker();
  const stt = useListener();
  const { save, flush, trouble, setTrouble } = usePlace("voice");

  const [phase, setPhase] = useState<"lesson" | "question">(props.atCheck ? "question" : "lesson");
  const [pos, setPos] = useState(props.atCheck ? script.length : props.offset);
  const [playing, setPlaying] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [qIdx, setQIdx] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [grading, setGrading] = useState(false);
  const [missed, setMissed] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const posRef = useRef(pos);
  const playingRef = useRef(false);
  const qRef = useRef(0);
  const started = useRef(false);

  const moveTo = (p: number) => {
    posRef.current = p;
    setPos(p);
  };
  const setPlay = (v: boolean) => {
    playingRef.current = v;
    setPlaying(v);
  };

  // ---------- lesson playback ----------

  function playFrom(offset: number) {
    if (offset >= script.length - 1) return lessonDone();
    setBlocked(false);
    setPlay(true);
    const run = (i: number, from: number) => {
      const s = sents[i];
      const start = Math.max(s.start, from);
      moveTo(start);
      save({ segmentId, position: "start", offset: start });
      tts.speak(script.slice(start, s.end), {
        onBoundary: (ci) => moveTo(start + ci),
        onEnd: () => (i + 1 < sents.length ? run(i + 1, sents[i + 1].start) : lessonDone()),
        onBlocked: () => {
          setPlay(false);
          setBlocked(true);
        },
      });
    };
    run(sentenceAt(sents, offset), offset);
  }

  function pause() {
    tts.cancel();
    setPlay(false);
    save({ segmentId, position: "start", offset: posRef.current });
  }

  function skip(sec: number) {
    const cps = script.length / Math.max(1, durationSec);
    const target = posRef.current + sec * cps;
    if (target >= script.length) {
      tts.cancel();
      return lessonDone();
    }
    const i = sentenceAt(sents, Math.max(0, target));
    let t = sents[i].start;
    if (sec > 0 && t <= posRef.current) {
      if (i + 1 >= sents.length) {
        tts.cancel();
        return lessonDone();
      }
      t = sents[i + 1].start;
    }
    if (playingRef.current) playFrom(t);
    else {
      moveTo(t);
      save({ segmentId, position: "start", offset: t });
    }
  }

  // ---------- questions ----------

  function lessonDone() {
    setPlay(false);
    moveTo(script.length);
    setPhase("question");
    save({ segmentId, position: "checkpoint", offset: script.length });
    ask(qRef.current);
  }

  function ask(i: number, thenAnswer = false) {
    setResult(null);
    setMissed(false);
    tts.speak(questionSpeech(questions[i], i, questions.length), {
      onEnd: () => {
        if (thenAnswer) answerOutLoud();
      },
      onBlocked: () => setBlocked(true),
    });
  }

  async function answerOutLoud() {
    if (stt.listening) return stt.stop();
    tts.cancel();
    setResult(null);
    setMissed(false);
    const heard = await stt.listen();
    if (!heard) return setMissed(true);
    await grade(heard);
  }

  async function grade(heard: string) {
    const q = questions[qRef.current];
    setGrading(true);
    try {
      const r = await persist(
        () => postJSON<GradeResponse>("/api/grade", { questionId: q.id, answer: heard, mode: "voice" }, 30_000),
        setTrouble,
        5,
      );
      const text = explain(q, r.correct, r.feedback);
      setResult({ correct: r.correct, text, heard });
      tts.speak(`${r.correct ? "That's right." : "Not quite."} ${text}`);
    } catch {
      setMissed(true);
    } finally {
      setGrading(false);
    }
  }

  function nextQuestion() {
    const i = qRef.current + 1;
    qRef.current = i;
    setQIdx(i);
    ask(i);
  }

  async function finish() {
    setLeaving(true);
    tts.cancel();
    try {
      await persist(() => postJSON("/api/segment", { segmentId }), setTrouble);
      router.push(`/progress?finished=${legNumber}`);
    } catch {
      setLeaving(false);
    }
  }

  async function leave(href: string) {
    setLeaving(true);
    tts.cancel();
    stt.abort();
    setPlay(false);
    if (phase === "lesson") save({ segmentId, position: "start", offset: posRef.current });
    await flush();
    router.push(href);
  }

  // Start playing as soon as a voice is ready. A browser that blocks autoplay gets a play button.
  useEffect(() => {
    if (!tts.ready || started.current) return;
    started.current = true;
    if (phase === "lesson") playFrom(posRef.current);
    else {
      save({ segmentId, position: "checkpoint", offset: script.length });
      ask(0);
    }
  }, [tts.ready]);

  // ---------- view ----------

  const carried = props.lastMode === "text" && (props.offset > 0 || props.atCheck);
  const si = sentenceAt(sents, Math.min(pos, script.length - 1));
  const s = sents[si];
  const spoken = s ? script.slice(s.start, Math.max(s.start, Math.min(pos, s.end))) : "";
  const rest = s ? script.slice(Math.max(s.start, Math.min(pos, s.end)), s.end) : "";
  const elapsed = (durationSec * Math.min(pos, script.length)) / script.length;
  const q = questions[qIdx];
  const loading = tts.supported === null || (tts.supported && !tts.ready);

  let label: string;
  if (phase === "question") label = questions.length > 1 ? `Question ${qIdx + 1} of ${questions.length}` : "Check question";
  else if (loading) label = "Getting the audio ready";
  else if (blocked) label = "Tap play to start";
  else if (playing) label = "Now playing";
  else label = pos > 0 ? "Paused" : "Ready to play";

  return (
    <Screen dark gap="gap-6">
      <TopBar
        left={
          <button type="button" onClick={() => leave("/")} aria-label="Back to course" className="-ml-2 flex h-11 w-11 items-center justify-center">
            <ChevronIcon />
          </button>
        }
        title={`Leg ${props.legNumber} of ${props.legTotal}`}
        right={<ModePill to="read" dark onClick={() => leave("/read")} />}
      />

      {carried && (
        <div className="flex items-center gap-2.5 self-start rounded-xl bg-ink-raised px-3.5 py-2.5 text-[15px]">
          <span className="h-2.5 w-2.5 rounded-full bg-gold" aria-hidden="true" />
          Your place carried over from reading
        </div>
      )}

      <SignalNotice show={trouble} dark />

      <div className="flex flex-1 flex-col justify-center gap-3.5" aria-live="polite">
        <div className="text-[15px] text-muted-on-ink">{label}</div>
        {phase === "lesson" ? (
          tts.supported === false ? (
            <p className="font-display text-[26px] leading-[1.3]">
              This browser can&apos;t read the lesson aloud. Read instead keeps your place.
            </p>
          ) : (
            <p className="font-display text-[30px] leading-[1.3]">
              {spoken}
              <span className={playing || pos > 0 ? "text-muted-on-ink" : ""}>{rest}</span>
            </p>
          )
        ) : (
          <>
            <p className="font-display text-[28px] leading-[1.25]">{q.prompt}</p>
            {q.type === "mcq" && !result && (
              <ul className="flex flex-col gap-1.5 text-[17px] text-muted-on-ink">
                {q.options.map((o) => (
                  <li key={o}>{o}</li>
                ))}
              </ul>
            )}
            {(stt.listening || stt.heard) && (
              <div className="flex flex-col gap-1">
                <span className="text-sm text-muted-on-ink">{stt.listening ? "Listening" : "Heard"}</span>
                <p className="font-display text-[22px] italic">{stt.heard ? `"${stt.heard}"` : "…"}</p>
              </div>
            )}
            {grading && <p className="text-[15px] text-muted-on-ink">Checking your answer…</p>}
            {missed && !stt.listening && (
              <p className="text-[15px] text-muted-on-ink">
                {stt.error === "mic-blocked"
                  ? "The mic is blocked for this page. Allow it in the browser, or tap to answer instead."
                  : stt.error === "network"
                    ? "Lost signal while listening. Your place is saved. Try again, or tap to answer."
                    : "I didn't catch that. Try again, or tap to answer."}
              </p>
            )}
            {result && <Feedback correct={result.correct} text={result.text} source={props.source} dark />}
          </>
        )}
      </div>

      {phase === "lesson" && tts.supported !== false && (
        <>
          <div className="flex flex-col gap-2">
            <div className="h-1.5 overflow-hidden rounded-[3px] bg-ink-track">
              <div className="h-1.5 bg-gold" style={{ width: `${(elapsed / durationSec) * 100}%` }} />
            </div>
            <div className="flex justify-between text-sm text-muted-on-ink">
              <span>{formatClock(elapsed)}</span>
              <span>{formatClock(durationSec)}</span>
            </div>
          </div>

          <div className="flex items-center justify-center gap-7">
            <button
              type="button"
              aria-label="Back 15 seconds"
              onClick={() => skip(-15)}
              className="h-[60px] w-[60px] rounded-full border-2 border-muted-on-ink text-[15px] font-semibold"
            >
              −15
            </button>
            <button
              type="button"
              aria-label={playing ? "Pause" : "Play"}
              disabled={loading}
              onClick={() => (playing ? pause() : playFrom(posRef.current))}
              className="flex h-[92px] w-[92px] items-center justify-center rounded-full bg-gold text-ink disabled:opacity-60"
            >
              {playing ? <PauseGlyph /> : <PlayGlyph />}
            </button>
            <button
              type="button"
              aria-label="Forward 15 seconds"
              onClick={() => skip(15)}
              className="h-[60px] w-[60px] rounded-full border-2 border-muted-on-ink text-[15px] font-semibold"
            >
              +15
            </button>
          </div>
        </>
      )}

      <div className="flex flex-col gap-1.5">
        {phase === "question" && result ? (
          <>
            {!result.correct && q.type === "open" && (
              <button type="button" onClick={answerOutLoud} className="min-h-11 text-[15px] font-semibold underline underline-offset-4">
                Try again
              </button>
            )}
            {qIdx < questions.length - 1 ? (
              <PrimaryButton onClick={nextQuestion}>Next question</PrimaryButton>
            ) : (
              <PrimaryButton onClick={finish} disabled={leaving}>
                Finish leg {legNumber}
              </PrimaryButton>
            )}
          </>
        ) : (
          <>
            {stt.supported === false ? (
              <p className="text-center text-[15px] text-muted-on-ink">Out-loud answers need Chrome on this phone.</p>
            ) : (
              <button
                type="button"
                disabled={grading || stt.supported === null}
                aria-pressed={stt.listening}
                onClick={() => {
                  if (phase === "lesson") {
                    // jump to the check and listen straight after the question
                    tts.cancel();
                    setPlay(false);
                    moveTo(script.length);
                    setPhase("question");
                    save({ segmentId, position: "checkpoint", offset: script.length });
                    ask(qRef.current, true);
                  } else answerOutLoud();
                }}
                className={`flex min-h-16 items-center justify-center gap-3 rounded-2xl text-lg font-bold disabled:opacity-60 ${
                  stt.listening ? "bg-gold text-ink" : "bg-ground text-ink"
                }`}
              >
                <MicIcon />
                {stt.listening ? "Listening. Tap when you're done" : "Answer out loud"}
              </button>
            )}
            <Link
              href={`/check?from=listen${phase === "question" ? `&q=${qIdx}` : ""}`}
              onClick={() => {
                tts.cancel();
                stt.abort();
                if (phase === "lesson") save({ segmentId, position: "start", offset: posRef.current });
              }}
              className="flex min-h-11 items-center justify-center text-[15px] font-semibold underline underline-offset-4"
            >
              Tap to answer instead
            </Link>
            {phase === "question" && !stt.listening && (
              <button type="button" onClick={() => ask(qIdx)} className="min-h-11 text-[15px] font-semibold text-muted-on-ink">
                Hear the question again
              </button>
            )}
          </>
        )}
      </div>
    </Screen>
  );
}
