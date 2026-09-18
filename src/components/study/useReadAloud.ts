"use client";
// Read-aloud player for study mode. One <audio> element for the whole session (so the first tap
// unlocks playback on iOS and block-to-block continuation needs no further gesture), one block of
// audio at a time from /api/tts, and a requestAnimationFrame loop that turns currentTime into a
// word index. The audio URL alone triggers synthesis on the server, so we can set `src` and call
// play() synchronously inside the tap, then fetch the word timings in parallel.
import { useCallback, useEffect, useRef, useState } from "react";
import type { WordTiming } from "@/lib/tts";

export type Position = { block: number; word: number };

export interface ReadAloud {
  playing: boolean;
  loading: boolean; // audio requested, not yet playing
  error: string | null;
  speed: number;
  pos: Position | null; // null until a block has been loaded
  blockDuration: number; // seconds, 0 until known
  play: () => void;
  pause: () => void;
  toggle: () => void;
  seek: (pos: Position, opts?: { play?: boolean }) => void;
  setSpeed: (s: number) => void;
}

type Meta = { text: string; words: WordTiming[] };

const SPEEDS = [1, 1.25, 1.5, 0.8];

export function nextSpeed(s: number): number {
  return SPEEDS[(SPEEDS.indexOf(s) + 1) % SPEEDS.length];
}

function ttsUrl(segmentId: string, block: number, audio = false): string {
  return `/api/tts?segmentId=${encodeURIComponent(segmentId)}&blockIdx=${block}${audio ? "&audio=1" : ""}`;
}

export function useReadAloud(opts: {
  segmentId: string | null;
  blockCount: number;
  onBlockStart?: (block: number) => void;
  onFinished?: () => void;
}): ReadAloud {
  const { segmentId, blockCount, onBlockStart, onFinished } = opts;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const metas = useRef(new Map<string, Promise<Meta>>());
  const meta = useRef<Meta | null>(null); // timings for the block currently in the element
  const cur = useRef<Position | null>(null);
  const pendingSeek = useRef<number | null>(null); // seconds to seek to once the media is ready
  const raf = useRef(0);
  const speedRef = useRef(1); // mirrored in state for the UI; read here so loadBlock stays stable
  const cb = useRef({ onBlockStart, onFinished });
  cb.current = { onBlockStart, onFinished };

  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [speed, setSpeedState] = useState(1);
  const [pos, setPos] = useState<Position | null>(null);
  const [blockDuration, setBlockDuration] = useState(0);

  const fetchMeta = useCallback(
    (block: number): Promise<Meta> => {
      const key = `${segmentId}/${block}`;
      let p = metas.current.get(key);
      if (!p) {
        p = fetch(ttsUrl(segmentId!, block)).then(async (r) => {
          const j = (await r.json()) as Meta & { reason?: string };
          if (!r.ok) throw new Error(j.reason || `Read-aloud failed (${r.status})`);
          return { text: j.text, words: j.words };
        });
        p.catch(() => metas.current.delete(key));
        metas.current.set(key, p);
      }
      return p;
    },
    [segmentId],
  );

  const audio = useCallback((): HTMLAudioElement => {
    if (!audioRef.current) {
      const a = new Audio();
      a.preload = "auto";
      audioRef.current = a;
    }
    return audioRef.current;
  }, []);

  const tick = useCallback(() => {
    const a = audioRef.current;
    const m = meta.current;
    const c = cur.current;
    if (a && m && c && !a.paused) {
      const t = a.currentTime;
      let w = c.word;
      while (w > 0 && m.words[w].start > t) w--;
      while (w < m.words.length - 1 && m.words[w + 1].start <= t) w++;
      if (w !== c.word) {
        cur.current = { block: c.block, word: w };
        setPos(cur.current);
      }
    }
    raf.current = requestAnimationFrame(tick);
  }, []);

  /** Point the element at a block. Synchronous up to play(), so it can live inside a tap handler. */
  const loadBlock = useCallback(
    (block: number, word: number, autoplay: boolean) => {
      if (!segmentId) return;
      const a = audio();
      setError(null);
      meta.current = null;
      cur.current = { block, word };
      setPos(cur.current);
      setBlockDuration(0);
      pendingSeek.current = null;
      a.src = ttsUrl(segmentId, block, true);
      a.defaultPlaybackRate = speedRef.current;
      a.playbackRate = speedRef.current;
      a.load();
      cb.current.onBlockStart?.(block);
      if (autoplay) {
        setLoading(true);
        a.play().catch((e: Error) => {
          setLoading(false);
          setPlaying(false);
          if (e.name !== "AbortError") setError("Tap play to start");
        });
      }
      fetchMeta(block)
        .then((m) => {
          if (cur.current?.block !== block) return; // moved on
          meta.current = m;
          setBlockDuration(m.words.at(-1)?.end ?? 0);
          if (word > 0 && m.words[word]) {
            const at = m.words[word].start;
            if (a.readyState >= 1) a.currentTime = at;
            else pendingSeek.current = at;
          }
          if (block + 1 < blockCount) fetchMeta(block + 1).catch(() => {}); // warm the next block
        })
        .catch((e: Error) => {
          setError(e.message);
          setLoading(false);
          a.pause();
        });
    },
    [segmentId, blockCount, audio, fetchMeta],
  );

  // element events, bound once
  useEffect(() => {
    const a = audio();
    const onPlay = () => {
      setPlaying(true);
      setLoading(false);
      cancelAnimationFrame(raf.current);
      raf.current = requestAnimationFrame(tick);
    };
    const onPause = () => {
      setPlaying(false);
      cancelAnimationFrame(raf.current);
    };
    const onMeta = () => {
      if (pendingSeek.current != null) {
        a.currentTime = pendingSeek.current;
        pendingSeek.current = null;
      }
    };
    const onEnded = () => {
      const c = cur.current;
      if (!c) return;
      if (c.block + 1 < blockCount) loadBlock(c.block + 1, 0, true);
      else {
        setPlaying(false);
        cb.current.onFinished?.();
      }
    };
    const onError = () => {
      if (!a.src) return;
      setLoading(false);
      setPlaying(false);
      setError("Read-aloud unavailable");
    };
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("ended", onEnded);
    a.addEventListener("error", onError);
    // Re-bound mid-playback (deps changed): the cleanup below cancelled the loop and no `play`
    // event will restart it, so resume it here.
    if (!a.paused) {
      cancelAnimationFrame(raf.current);
      raf.current = requestAnimationFrame(tick);
    }
    return () => {
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
      a.removeEventListener("loadedmetadata", onMeta);
      a.removeEventListener("ended", onEnded);
      a.removeEventListener("error", onError);
      cancelAnimationFrame(raf.current);
    };
  }, [audio, tick, loadBlock, blockCount]);

  // new segment: stop and forget
  useEffect(() => {
    const a = audioRef.current;
    if (a) {
      a.pause();
      a.removeAttribute("src");
    }
    meta.current = null;
    cur.current = null;
    setPos(null);
    setPlaying(false);
    setLoading(false);
    setError(null);
    setBlockDuration(0);
  }, [segmentId]);

  const play = useCallback(() => {
    const a = audio();
    if (!cur.current) return loadBlock(0, 0, true);
    if (!a.src) return loadBlock(cur.current.block, cur.current.word, true);
    setLoading(true);
    a.play().catch(() => {
      setLoading(false);
      setError("Tap play to start");
    });
  }, [audio, loadBlock]);

  const pause = useCallback(() => audioRef.current?.pause(), []);

  const toggle = useCallback(() => {
    if (audioRef.current && !audioRef.current.paused) pause();
    else play();
  }, [play, pause]);

  const seek = useCallback(
    (p: Position, o: { play?: boolean } = {}) => {
      const a = audio();
      const wantPlay = o.play ?? !a.paused;
      if (cur.current?.block === p.block && meta.current && a.src) {
        const w = meta.current.words[p.word];
        if (w) a.currentTime = w.start;
        cur.current = p;
        setPos(p);
        if (wantPlay && a.paused) play();
        return;
      }
      loadBlock(p.block, p.word, wantPlay);
    },
    [audio, loadBlock, play],
  );

  const setSpeed = useCallback((s: number) => {
    speedRef.current = s;
    setSpeedState(s);
    if (audioRef.current) {
      audioRef.current.defaultPlaybackRate = s;
      audioRef.current.playbackRate = s;
    }
  }, []);

  return { playing, loading, error, speed, pos, blockDuration, play, pause, toggle, seek, setSpeed };
}
