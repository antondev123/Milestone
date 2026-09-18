"use client";
// The assistant: a short thread over the `ask` tool, grounded on the current leg. A tapped
// sentence rides along as context and is shown quoted above the composer until cleared.
import { useEffect, useRef, useState } from "react";
import { CloseIcon, MicIcon } from "@/components/carry/Icons";
import { useDictation } from "./useDictation";
import type { ToolReply } from "@/types/lesson";

export type Message = { who: "you" | "tutor"; text: string; offer?: ToolReply["offer"] };

export function AssistantThread({
  messages,
  context,
  busy,
  source,
  section,
  onSend,
  onClearContext,
  onQuiz,
  onGoThere,
  dark = false,
}: {
  messages: Message[];
  context: string | null;
  busy: boolean;
  source: string;
  section: string;
  onSend: (question: string) => void;
  onClearContext: () => void;
  onQuiz: () => void;
  onGoThere: (sectionId: string) => void;
  dark?: boolean;
}) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const mic = useDictation((text) => {
    setInput((cur) => (cur ? `${cur} ${text}` : text));
    inputRef.current?.focus();
  });
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length, busy]);

  const submit = (q: string) => {
    const t = q.trim();
    if (!t || busy) return;
    setInput("");
    onSend(t);
  };
  const muted = dark ? "text-muted-on-ink" : "text-muted";
  const chip = `min-h-9 rounded-full border px-3 text-[14px] font-semibold whitespace-nowrap disabled:opacity-60 ${dark ? "border-muted-on-ink" : "border-ink"}`;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pb-3">
        {messages.length === 0 && <p className={`text-[15px] ${muted}`}>Ask anything about this passage. Answers come from the book and say where.</p>}
        {messages.map((m, i) =>
          m.who === "you" ? (
            <div key={i} className="max-w-[88%] self-end rounded-2xl bg-panel px-4 py-2.5 text-[16px] leading-[1.45] text-ink">
              {m.text}
            </div>
          ) : (
            <div key={i} className="flex flex-col gap-2">
              <p className="text-[17px] leading-[1.55] whitespace-pre-wrap">{m.text}</p>
              <div className={`text-[13px] italic ${muted}`}>
                From {source}, section {section}
              </div>
              {m.offer && i === messages.length - 1 && (
                <button type="button" onClick={() => onGoThere(m.offer!.sectionId)} className="self-start rounded-full bg-ink px-4 py-2 text-[14px] font-semibold text-ground">
                  Go there now
                </button>
              )}
            </div>
          ),
        )}
        {busy && (
          <div className={`text-[15px] ${muted}`} role="status">
            Checking the book…
          </div>
        )}
        <div ref={endRef} />
      </div>

      {context && (
        <div className="mb-2 flex items-start gap-2 rounded-xl bg-panel px-3 py-2 text-ink">
          <div className="min-w-0 flex-1 font-display text-[15px] leading-[1.4] italic">“{context}”</div>
          <button type="button" onClick={onClearContext} aria-label="Clear the selected sentence" className="-mr-1 flex h-8 w-8 shrink-0 items-center justify-center">
            <CloseIcon size={18} />
          </button>
        </div>
      )}

      <div className="-mx-1 mb-2 flex gap-2 overflow-x-auto px-1 py-0.5">
        <button type="button" disabled={busy} className={chip} onClick={() => submit(context ? "Explain this sentence in plain words" : "Explain this passage in plain words")}>
          {context ? "Explain this sentence" : "Explain this"}
        </button>
        <button type="button" disabled={busy} className={chip} onClick={() => submit("Give me a concrete example")}>
          Give me an example
        </button>
        <button type="button" className={chip} onClick={onQuiz}>
          Quiz me on this
        </button>
      </div>

      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit(input);
        }}
      >
        <div className="relative min-w-0 flex-1">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={mic.state === "recording" ? "Listening…" : mic.state === "transcribing" ? "Transcribing…" : context ? "Ask about this sentence" : "Ask about this passage"}
            aria-label="Ask a question"
            className={`min-h-11 w-full rounded-xl border-2 bg-transparent pl-3 text-[16px] ${mic.supported ? "pr-11" : "pr-3"} ${dark ? "border-muted-on-ink placeholder:text-muted-on-ink" : "border-rule placeholder:text-muted"}`}
          />
          {mic.supported && (
            <button
              type="button"
              onClick={mic.toggle}
              disabled={busy || mic.state === "transcribing"}
              aria-label={mic.state === "recording" ? "Stop and transcribe" : "Speak your question"}
              aria-pressed={mic.state === "recording"}
              className={`absolute top-1/2 right-1 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full disabled:opacity-60 ${
                mic.state === "recording" ? "animate-pulse bg-gold text-ink" : dark ? "text-ground" : "text-ink"
              }`}
            >
              <MicIcon size={20} />
            </button>
          )}
        </div>
        <button type="submit" disabled={busy || !input.trim()} className="min-h-11 rounded-xl bg-ink px-4 text-[15px] font-bold text-ground disabled:opacity-60">
          Ask
        </button>
      </form>
      {mic.error && (
        <p className={`mt-1.5 text-[13px] ${muted}`} role="status">
          {mic.error}
        </p>
      )}
    </div>
  );
}
