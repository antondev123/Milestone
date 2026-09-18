"use client";
// Study mode: the book as a page, read aloud on request with the spoken word tracked, an assistant
// beside it, and a tap/type checkpoint. Hands-on, not a commute. The server still owns the place:
// every block the reader reaches is `mark`ed, so Listen and Read modes pick up there.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BackLink, Pill, SignalNotice, TopBar } from "@/components/carry/Chrome";
import { CheckIcon, HeadphonesIcon, SpeakerIcon } from "@/components/carry/Icons";
import { persist, postJSON } from "@/components/carry/net";
import { AssistantFab, AssistantSheet } from "@/components/study/AssistantSheet";
import { AssistantThread, type Message } from "@/components/study/AssistantThread";
import { Checkpoint, type StudyQuestion } from "@/components/study/Checkpoint";
import { ReadAloudStrip } from "@/components/study/ReadAloudStrip";
import { Reader } from "@/components/study/Reader";
import { StudyLayout } from "@/components/study/StudyLayout";
import { nextSpeed, useReadAloud, type Position } from "@/components/study/useReadAloud";
import { blocks as splitBlocks } from "@/lib/chunk";
import { indexBlock } from "@/lib/reading";
import type { LegIndex } from "@/lib/view";
import type { Progress, Segment, ToolReply } from "@/types/lesson";

type Manifest = { title: string; chapters: { sections: { id: string; number: string; segments: { id: string }[] }[] }[] };
type Loaded = { id: string; title: string; script: string; questions: StudyQuestion[] };

export interface StudyPageProps {
  legs: LegIndex;
  source: string;
  courseTitle: string;
  gotoTarget: string | null;
  carriedFrom: "voice" | "text" | null;
}

export default function StudyPage({ legs, source, courseTitle, gotoTarget, carriedFrom }: StudyPageProps) {
  const router = useRouter();
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [seg, setSeg] = useState<Loaded | null>(null);
  const [startBlock, setStartBlock] = useState(0);
  const [audioOn, setAudioOn] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [checkOpen, setCheckOpen] = useState(false);
  const [asideTab, setAsideTab] = useState<"ask" | "check">("ask");
  const [thread, setThread] = useState<Message[]>([]);
  const [askContext, setAskContext] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [trouble, setTrouble] = useState(false);
  const [booting, setBooting] = useState(true);
  const lastMarked = useRef<string>("");
  const checkRef = useRef<HTMLDivElement>(null);

  const tool = useCallback(
    (name: string, body: Record<string, unknown> = {}): Promise<ToolReply> =>
      persist(() => postJSON<ToolReply>(`/api/tools/${name}`, { ...body, mode: "study" }), setTrouble),
    [],
  );

  const loadSegment = useCallback(async (id: string) => {
    const r = await fetch(`/api/segment?id=${encodeURIComponent(id)}`);
    const j = (await r.json()) as { segment: Segment };
    const s = j.segment;
    setSeg({ id: s.id, title: s.title, script: s.script, questions: s.checkpoint.map((q) => ({ id: q.id, prompt: q.prompt, type: q.type === "mcq" ? "mcq" : "open", options: q.options })) });
  }, []);

  // boot: a study session, optional goto from the course map, then the segment under the cursor
  // Strict Mode runs effects twice: the ref keeps this to one run (a second goto would push the return stack
  // again). No per-run cancel flag: the first run's cleanup fires straight away in dev and would abort the boot.
  const booted = useRef(false);
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    (async () => {
      fetch("/api/course").then((r) => r.json()).then((m: Manifest) => setManifest(m));
      const p0 = (await persist(() => fetch("/api/progress").then((r) => r.json() as Promise<Progress>), setTrouble)) as Progress;
      // mid-trip from Listen or Read: keep that trip (same id and clock); otherwise open a study session
      if (!p0.activeTrip) await persist(() => postJSON("/api/session", { minutes: 45, mode: "study" }), setTrouble);
      else if (p0.activeTrip.mode !== "study") await persist(() => postJSON("/api/session", { carry: true, mode: "study" }), setTrouble);
      if (gotoTarget) await tool("goto", { target: gotoTarget });
      const p = (await persist(() => fetch("/api/progress").then((r) => r.json() as Promise<Progress>), setTrouble)) as Progress;
      const id = p.cursor?.segmentId ?? p.resume.segmentId;
      const block = p.cursor?.segmentId === id && p.cursor.phase === "read" ? p.cursor.blockIdx : 0;
      lastMarked.current = `${id}/${block}`;
      setStartBlock(block);
      await loadSegment(id);
      setBooting(false);
    })();
  }, [gotoTarget, tool, loadSegment]);

  const blockTexts = useMemo(() => (seg ? splitBlocks(seg.script) : []), [seg]);
  const index = useMemo(() => blockTexts.map(indexBlock), [blockTexts]);

  const player = useReadAloud({
    segmentId: seg?.id ?? null,
    blockCount: blockTexts.length,
    onBlockStart: (b) => {
      if (!seg) return;
      const key = `${seg.id}/${b}`;
      if (lastMarked.current === key) return;
      lastMarked.current = key;
      setCheckOpen(false); // reading again closes an open question; check() reopens it
      tool("mark", { segmentId: seg.id, blockIdx: b });
    },
    onFinished: () => openCheck(),
  });

  const pos: Position | null = player.pos;
  const curIndex = pos ? index[pos.block] : undefined;
  const curSi = pos && curIndex ? curIndex.sentenceOf[pos.word] : -1;
  const curSentence = curIndex && curSi >= 0 ? curIndex.sentences[curSi] : undefined;
  const stripWords = curSentence && curIndex ? curIndex.words.slice(curSentence.first, curSentence.last + 1) : [];
  const stripWordIdx = curSentence && pos ? pos.word - curSentence.first : -1;
  const blockProgress = pos && curIndex ? pos.word / Math.max(1, curIndex.words.length - 1) : 0;

  const leg = seg ? legs[seg.id] : undefined;
  const section = leg?.section ?? "";
  const legLabel = leg ? `Leg ${leg.n}` : "Leg";

  const order = useMemo(() => manifest?.chapters.flatMap((c) => c.sections.flatMap((s) => s.segments.map((g) => g.id))) ?? [], [manifest]);
  const nextId = seg ? order[order.indexOf(seg.id) + 1] ?? null : null;

  function toggleAudio() {
    if (audioOn) player.pause();
    setAudioOn(!audioOn);
  }

  function togglePlay() {
    if (!pos && !player.playing) player.seek({ block: startBlock, word: 0 }, { play: true });
    else player.toggle();
  }

  function stepSentence(delta: 1 | -1) {
    if (!pos || !curIndex) return player.seek({ block: startBlock, word: 0 }, { play: true });
    const si = curSi + delta;
    if (si >= 0 && si < curIndex.sentences.length) return player.seek({ block: pos.block, word: curIndex.sentences[si].first });
    const b = pos.block + delta;
    if (b < 0 || b >= index.length) return;
    const target = delta > 0 ? index[b].sentences[0] : index[b].sentences[index[b].sentences.length - 1];
    player.seek({ block: b, word: target.first });
  }

  function scrollToSpoken() {
    if (!pos) return;
    const el = document.querySelector(`[data-s="${pos.block}:${curSi}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function openAsk(sentence?: string) {
    if (sentence) setAskContext(sentence);
    if (window.matchMedia("(min-width: 1024px)").matches) setAsideTab("ask");
    else {
      player.pause();
      setSheetOpen(true);
    }
  }

  function openCheck() {
    player.pause();
    setCheckOpen(true);
    if (window.matchMedia("(min-width: 1024px)").matches) setAsideTab("check");
    else setTimeout(() => checkRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  async function ask(question: string) {
    const ctx = askContext;
    setThread((t) => [...t, { who: "you", text: ctx ? `“${ctx.length > 60 ? ctx.slice(0, 57) + "…" : ctx}” — ${question}` : question }]);
    setAsking(true);
    const r = await tool("ask", { question, context: ctx ?? undefined });
    setAsking(false);
    setThread((t) => [...t, { who: "tutor", text: r.say, offer: r.offer }]);
  }

  async function goThere(sectionId: string) {
    const m = sectionId.match(/.*\/c(\d+)\/s(\d+)$/);
    if (!m) return;
    player.pause();
    await tool("goto", { target: `section ${m[1]}.${m[2]}` });
    setThread([]);
    setAskContext(null);
    setSheetOpen(false);
    const p = (await fetch("/api/progress").then((r) => r.json())) as Progress;
    const id = p.cursor?.segmentId ?? p.resume.segmentId;
    lastMarked.current = `${id}/0`;
    setStartBlock(0);
    setCheckOpen(false);
    await loadSegment(id);
    window.scrollTo({ top: 0 });
  }

  async function nextLeg() {
    if (!nextId) return;
    player.pause();
    await tool("mark", { segmentId: nextId, blockIdx: 0 });
    lastMarked.current = `${nextId}/0`;
    setStartBlock(0);
    setCheckOpen(false);
    setAsideTab("ask");
    setThread([]);
    setAskContext(null);
    await loadSegment(nextId);
    window.scrollTo({ top: 0 });
  }

  async function endSession() {
    player.pause();
    const r = await tool("end_trip");
    router.push(r.tripId ? `/trip/${r.tripId}/summary` : "/progress");
  }

  const assistant = (dark = false) => (
    <AssistantThread
      messages={thread}
      context={askContext}
      busy={asking}
      source={source}
      section={section}
      onSend={ask}
      onClearContext={() => setAskContext(null)}
      onQuiz={() => {
        setSheetOpen(false);
        openCheck();
      }}
      onGoThere={goThere}
      dark={dark}
    />
  );

  const checkpoint = seg && checkOpen && (
    <Checkpoint segmentId={seg.id} questions={seg.questions} source={source} section={section} legLabel={legLabel} tool={tool} onNextLeg={nextLeg} hasNextLeg={!!nextId} />
  );

  const topBar = (
    <TopBar
      left={<BackLink href="/" />}
      title={leg ? `Leg ${leg.n} of ${leg.of} · ${leg.section}` : courseTitle}
      right={<Pill icon={<SpeakerIcon size={18} off={!audioOn} />} label={audioOn ? "Read aloud" : "Audio off"} pressed={audioOn} onClick={toggleAudio} />}
    />
  );

  const strip = audioOn && seg && (
    <ReadAloudStrip
      words={stripWords}
      wordIdx={stripWordIdx}
      progress={blockProgress}
      playing={player.playing}
      loading={player.loading}
      error={player.error}
      speed={player.speed}
      onToggle={togglePlay}
      onPrev={() => stepSentence(-1)}
      onNext={() => stepSentence(1)}
      onSpeed={() => player.setSpeed(nextSpeed(player.speed))}
      onTapText={scrollToSpoken}
    />
  );

  const aside = (
    <>
      <div className="mb-3 flex gap-2">
        <button type="button" onClick={() => setAsideTab("ask")} aria-pressed={asideTab === "ask"} className={`min-h-10 rounded-full px-4 text-[14px] font-semibold ${asideTab === "ask" ? "bg-ink text-ground" : "bg-panel"}`}>
          Ask
        </button>
        <button
          type="button"
          onClick={() => (checkOpen ? setAsideTab("check") : openCheck())}
          aria-pressed={asideTab === "check"}
          className={`min-h-10 rounded-full px-4 text-[14px] font-semibold ${asideTab === "check" ? "bg-ink text-ground" : "bg-panel"}`}
        >
          Check my understanding
        </button>
      </div>
      {audioOn && (
        <div className="mb-4 rounded-2xl bg-panel px-4 py-3">
          <div className="text-[12px] font-semibold text-muted">Reading now</div>
          <div className="font-display text-[16px] leading-[1.4] italic">{curSentence ? curSentence.text : player.error ?? "Press play to hear this leg."}</div>
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{asideTab === "check" && checkOpen ? checkpoint : assistant()}</div>
      <div className="mt-4 flex flex-col gap-2 border-t border-rule pt-4 text-[14px]">
        <Link href="/learn/voice?carry=1" className="flex min-h-10 items-center gap-2 font-semibold">
          <HeadphonesIcon size={18} /> Switch to Listen mode
        </Link>
        <span className="text-muted">Listening on the go? Your place carries over.</span>
        <button type="button" onClick={endSession} className="self-start text-muted underline underline-offset-4">
          End session
        </button>
      </div>
    </>
  );

  return (
    <StudyLayout topBar={topBar} aside={aside} strip={strip}>
      <SignalNotice show={trouble} />
      {booting || !seg ? (
        <p className="text-[17px] text-muted" role="status">
          Getting your place…
        </p>
      ) : (
        <>
          {carriedFrom && startBlock > 0 && (
            <div className="mb-5 flex items-center gap-2.5">
              <span className="h-2.5 w-2.5 rounded-full bg-gold ring-2 ring-ink" aria-hidden="true" />
              <span className="text-sm font-semibold">Picked up where you stopped {carriedFrom === "voice" ? "listening" : "reading"}</span>
            </div>
          )}
          <Reader title={seg.title} blocks={index} pos={audioOn ? pos : null} audioOn={audioOn} onTapSentence={(p) => player.seek(p, { play: true })} onAsk={(s) => openAsk(s)}>
            <div ref={checkRef} className="lg:hidden">
              {checkOpen ? (
                checkpoint
              ) : (
                <div className="mt-8 border-t border-rule pt-6">
                  <button type="button" onClick={openCheck} className="flex min-h-[60px] w-full items-center justify-center gap-3 rounded-2xl bg-gold px-5 text-lg font-bold text-ink">
                    <CheckIcon size={22} /> Check my understanding
                  </button>
                  <p className="mt-3 text-center text-[14px] text-muted">Get off any time. Your place is saved.</p>
                </div>
              )}
            </div>
            <div className="mt-10 flex flex-col gap-2 border-t border-rule pt-5 text-[14px] lg:hidden">
              <Link href="/learn/voice?carry=1" className="flex min-h-10 items-center gap-2 font-semibold">
                <HeadphonesIcon size={18} /> Switch to Listen mode
              </Link>
              <span className="text-muted">Listening on the go? Your place carries over.</span>
              <button type="button" onClick={endSession} className="self-start text-muted underline underline-offset-4">
                End session
              </button>
            </div>
          </Reader>
        </>
      )}
      {seg && !sheetOpen && <AssistantFab onClick={() => openAsk()} lifted={!!strip} />}
      <AssistantSheet open={sheetOpen} onClose={() => setSheetOpen(false)}>
        {assistant()}
      </AssistantSheet>
    </StudyLayout>
  );
}
