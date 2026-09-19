"use client";
// Study mode: the book as a page, read aloud on request with the spoken word tracked, an assistant
// beside it, and a tap/type checkpoint. Hands-on, not a commute. The server still owns the place:
// every block the reader reaches is `mark`ed, so Listen and Read modes pick up there.
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BackLink, ModePill, Pill, SignalNotice, TopBar } from "@/components/carry/Chrome";
import { CheckIcon, SpeakerIcon, StopIcon } from "@/components/carry/Icons";
import { persist, postJSON } from "@/components/carry/net";
import { installErrorLog, setLogSession } from "@/lib/log/client";
import { AssistantFab, AssistantSheet } from "@/components/study/AssistantSheet";
import { AssistantThread, type Message } from "@/components/study/AssistantThread";
import { Checkpoint, type StudyQuestion } from "@/components/study/Checkpoint";
import { LegNav, type LegLink } from "@/components/study/LegNav";
import { PhoneButton, PhonePreview } from "@/components/study/PhonePreview";
import { ReadAloudStrip } from "@/components/study/ReadAloudStrip";
import { Reader } from "@/components/study/Reader";
import { SectionPicker, type PickerManifest } from "@/components/study/SectionPicker";
import { StudyLayout } from "@/components/study/StudyLayout";
import { useMediaQuery } from "@/components/study/useMediaQuery";
import { nextSpeed, useReadAloud, type Position } from "@/components/study/useReadAloud";
import { blocks as splitBlocks } from "@/lib/chunk";
import { indexBlock } from "@/lib/reading";
import type { LegIndex } from "@/lib/view";
import type { Progress, Segment, ToolReply } from "@/types/lesson";

type Manifest = { title: string } & PickerManifest;
type Loaded = { id: string; title: string; script: string; questions: StudyQuestion[] };

export interface StudyPageProps {
  legs: LegIndex;
  source: string;
  courseTitle: string;
  gotoTarget: string | null;
  carriedFrom: "voice" | "text" | null;
  voiceId?: string;
}

export default function StudyPage({ legs, source, courseTitle, gotoTarget, carriedFrom, voiceId }: StudyPageProps) {
  const router = useRouter();
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [seg, setSeg] = useState<Loaded | null>(null);
  const [startBlock, setStartBlock] = useState(0);
  const [audioOn, setAudioOn] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [checkOpen, setCheckOpen] = useState(false);
  const [checkDone, setCheckDone] = useState(false); // this leg's checkpoint finished: the footer's Next leg goes gold
  const [pickerOpen, setPickerOpen] = useState(false);
  const [completed, setCompleted] = useState<Set<string>>(() => new Set());
  const [asideTab, setAsideTab] = useState<"ask" | "check">("ask");
  const [thread, setThread] = useState<Message[]>([]);
  const [askContext, setAskContext] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [trouble, setTrouble] = useState(false);
  const [booting, setBooting] = useState(true);
  const [phone, setPhone] = useState(false); // desktop-only phone preview (iframe), remembered across reloads
  const lastMarked = useRef<string>("");
  const checkRef = useRef<HTMLDivElement>(null);
  // one Checkpoint instance: phone inline or desktop column, never both (each would POST `check`)
  const desktop = useMediaQuery("(min-width: 1024px)");

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
      if (!p0.activeTrip) await persist(() => postJSON("/api/session", { mode: "study" }), setTrouble);
      else if (p0.activeTrip.mode !== "study") await persist(() => postJSON("/api/session", { carry: true, mode: "study" }), setTrouble);
      if (gotoTarget) await tool("goto", { target: gotoTarget });
      const p = (await persist(() => fetch("/api/progress").then((r) => r.json() as Promise<Progress>), setTrouble)) as Progress;
      // session log: browser errors land in the trip's timeline (src/lib/log)
      installErrorLog();
      setLogSession(p.activeTrip?.tripId ?? null);
      const id = p.cursor?.segmentId ?? p.resume.segmentId;
      const block = p.cursor?.segmentId === id && p.cursor.phase === "read" ? p.cursor.blockIdx : 0;
      lastMarked.current = `${id}/${block}`;
      setStartBlock(block);
      setCompleted(new Set(p.segmentsCompleted));
      setCheckDone(p.segmentsCompleted.includes(id));
      await loadSegment(id);
      setBooting(false);
    })();
  }, [gotoTarget, tool, loadSegment]);

  const blockTexts = useMemo(() => (seg ? splitBlocks(seg.script) : []), [seg]);
  const index = useMemo(() => blockTexts.map(indexBlock), [blockTexts]);

  const player = useReadAloud({
    segmentId: seg?.id ?? null,
    blockCount: blockTexts.length,
    voiceId,
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
  const legLink = (id: string | undefined): LegLink | null => {
    const l = id ? legs[id] : undefined;
    return id && l ? { id, caption: `${l.section} · ${l.sectionTitle}${l.partCount > 1 ? `, part ${l.partIndex}` : ""}` } : null;
  };
  const at = seg ? order.indexOf(seg.id) : -1;
  const prevLeg = at > 0 ? legLink(order[at - 1]) : null;
  const nextLeg = at >= 0 ? legLink(order[at + 1]) : null;

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
    if (desktop) setAsideTab("ask");
    else {
      player.pause();
      setSheetOpen(true);
    }
  }

  function openCheck() {
    player.pause();
    setCheckOpen(true);
    if (desktop) setAsideTab("check");
    else setTimeout(() => checkRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  // restore an open preview on reload; never inside the preview frame itself (it shares localStorage)
  useEffect(() => {
    if (window.self !== window.top) return;
    try {
      if (localStorage.getItem(PHONE_KEY) === "1") setPhone(true);
    } catch {}
  }, []);

  function openPhone() {
    player.pause(); // the frame shares the server cursor; do not read aloud in both
    setPhone(true);
    try {
      localStorage.setItem(PHONE_KEY, "1");
    } catch {}
  }

  const closePhone = useCallback(() => {
    setPhone(false);
    try {
      localStorage.removeItem(PHONE_KEY);
    } catch {}
  }, []);

  const onCheckDone = useCallback(() => {
    setCheckDone(true);
    fetch("/api/progress")
      .then((r) => r.json() as Promise<Progress>)
      .then((p) => setCompleted(new Set(p.segmentsCompleted)))
      .catch(() => {});
  }, []);

  async function ask(question: string) {
    const ctx = askContext;
    setThread((t) => [...t, { who: "you", text: ctx ? `“${ctx.length > 60 ? ctx.slice(0, 57) + "…" : ctx}” — ${question}` : question }]);
    setAsking(true);
    const r = await tool("ask", { question, context: ctx ?? undefined });
    setAsking(false);
    setThread((t) => [...t, { who: "tutor", text: r.say, offer: r.offer }]);
  }

  // land on a segment after the server moved: fresh thread, closed panels, page top
  async function arrive(id: string, done: Set<string>) {
    lastMarked.current = `${id}/0`;
    setStartBlock(0);
    setCheckOpen(false);
    setCheckDone(done.has(id));
    setCompleted(done);
    setAsideTab("ask");
    setThread([]);
    setAskContext(null);
    setSheetOpen(false);
    setPickerOpen(false);
    await loadSegment(id);
    window.scrollTo({ top: 0 });
  }

  /** Section picker and the assistant's "Go there now": `goto` resolves "section N.M" to its first part. */
  async function jumpToSection(sectionNumber: string) {
    player.pause();
    await tool("goto", { target: `section ${sectionNumber}` });
    const p = (await fetch("/api/progress").then((r) => r.json())) as Progress;
    await arrive(p.cursor?.segmentId ?? p.resume.segmentId, new Set(p.segmentsCompleted));
  }

  function goThere(sectionId: string) {
    const m = sectionId.match(/.*\/c(\d+)\/s(\d+)$/);
    if (m) void jumpToSection(`${m[1]}.${m[2]}`);
  }

  /** Leg footer: `mark` moves the cursor without completing the leg being left ("get off any time"). */
  async function jumpToLeg(id: string) {
    player.pause();
    await tool("mark", { segmentId: id, blockIdx: 0 });
    await arrive(id, completed);
  }

  /** Hands-off carries this trip over (`?carry=1`); the Dial picks up at the block marked here. */
  function goHandsOff() {
    player.pause();
    router.push("/learn/voice?carry=1");
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

  const checkpoint = (inline = false) =>
    seg &&
    checkOpen && (
      <Checkpoint segmentId={seg.id} questions={seg.questions} source={source} section={section} legLabel={legLabel} tool={tool} onDone={onCheckDone} inline={inline} />
    );

  const legNav = seg && <LegNav prev={prevLeg} next={nextLeg} primaryNext={checkDone} disabled={!manifest} onGo={jumpToLeg} />;

  const topBar = (
    <TopBar
      left={<BackLink href="/" />}
      title={leg ? `Leg ${leg.n} of ${leg.of} · ${leg.section}` : courseTitle}
      onTitleClick={seg ? () => setPickerOpen(true) : undefined}
      right={
        <div className="flex items-center gap-2">
          {/* icon only on phones so the leg title keeps its room */}
          <ModePill to="hands-off" onClick={goHandsOff} compact />
          <Pill icon={<SpeakerIcon size={18} off={!audioOn} />} label={audioOn ? "Read aloud" : "Audio off"} pressed={audioOn} onClick={toggleAudio} compact />
        </div>
      }
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
      <div className="mb-4 flex shrink-0 gap-2">
        <button type="button" onClick={() => setAsideTab("ask")} aria-pressed={asideTab === "ask"} className={`min-h-10 rounded-full px-4 text-[14px] font-semibold whitespace-nowrap ${asideTab === "ask" ? "bg-ink text-ground" : "bg-panel text-ink"}`}>
          Ask
        </button>
        <button
          type="button"
          onClick={() => (checkOpen ? setAsideTab("check") : openCheck())}
          aria-pressed={asideTab === "check"}
          className={`min-h-10 rounded-full px-4 text-[14px] font-semibold whitespace-nowrap ${asideTab === "check" ? "bg-ink text-ground" : "bg-panel text-ink"}`}
        >
          Check my understanding
        </button>
        <PhoneButton onClick={openPhone} />
      </div>
      {/* the middle is one flex region; whatever is inside owns the single scroll (the thread, or the checkpoint) */}
      <div className="flex min-h-0 flex-1 flex-col">
        {desktop && asideTab === "check" && checkOpen ? <div className="min-h-0 flex-1 overflow-y-auto">{checkpoint(true)}</div> : assistant()}
      </div>
      <div className="mt-3 flex shrink-0 flex-col border-t border-rule pt-3">
        <button type="button" onClick={endSession} className={`${END_BUTTON} min-h-11 text-[15px]`}>
          <StopIcon size={18} /> End session
        </button>
      </div>
    </>
  );

  return (
    <>
      <StudyLayout topBar={topBar} aside={aside} strip={strip}>
        <SignalNotice show={trouble} />
        {booting || !seg ? (
          <p className="text-[17px] text-muted" role="status">
            Getting your progress…
          </p>
        ) : (
          <>
            {carriedFrom && startBlock > 0 && (
              <div className="mb-5 flex items-center gap-2.5">
                <span className="h-2.5 w-2.5 rounded-full bg-gold ring-2 ring-ink" aria-hidden="true" />
                <span className="text-sm font-semibold">Picked up where you stopped {carriedFrom === "voice" ? "listening" : "reading"}</span>
              </div>
            )}
            <Reader title={seg.title} label={leg ? `${leg.section} ${leg.sectionTitle}` : undefined} blocks={index} pos={audioOn ? pos : null} audioOn={audioOn} onTapSentence={(p) => player.seek(p, { play: true })} onAsk={(s) => openAsk(s)}>
              {!desktop && (
                <div ref={checkRef} className="mt-10 scroll-mt-[76px] border-t-2 border-ink pt-6 lg:hidden">
                  {checkOpen ? (
                    checkpoint()
                  ) : (
                    <div>
                      {/* gold until the leg's checkpoint is done; then the footer's Next leg is the one primary */}
                      <button
                        type="button"
                        onClick={openCheck}
                        className={`flex min-h-[60px] w-full items-center justify-center gap-3 rounded-2xl px-5 text-lg font-bold text-ink ${checkDone ? "border-2 border-ink" : "bg-gold"}`}
                      >
                        <CheckIcon size={22} /> Check my understanding
                      </button>
                      <p className="mt-3 text-center text-[14px] text-muted">Get off any time. Your progress is saved.</p>
                    </div>
                  )}
                </div>
              )}
              {legNav}
              <button type="button" onClick={endSession} className={`mt-4 ${END_BUTTON} min-h-[60px] text-[17px] lg:hidden`}>
                <StopIcon size={20} /> End session
              </button>
            </Reader>
          </>
        )}
        {seg && !sheetOpen && !checkOpen && <AssistantFab onClick={() => openAsk()} lifted={!!strip} />}
        <AssistantSheet open={sheetOpen} onClose={() => setSheetOpen(false)}>
          {assistant()}
        </AssistantSheet>
        <SectionPicker open={pickerOpen} onClose={() => setPickerOpen(false)} manifest={manifest} hereSection={section} completed={completed} busy={booting} onPick={jumpToSection} />
      </StudyLayout>
      <PhonePreview open={phone} onClose={closePhone} src={phoneSrc()} />
    </>
  );
}

const PHONE_KEY = "study:phone";

// Same route and query (keeps ?goto=), flagged so the embedded page can tell it is a preview.
function phoneSrc(): string {
  if (typeof window === "undefined") return "/learn/study?frame=1";
  const q = new URLSearchParams(window.location.search);
  q.set("frame", "1");
  return `/learn/study?${q}`;
}

/** Outlined, full width: ending is always one clear tap, never the primary (docs/DESIGN.md §3). */
const END_BUTTON = "flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-ink px-4 font-semibold";
