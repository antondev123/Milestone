# ElevenLabs agent configuration

## 0. Fastest path: run the script

Create a blank agent in the dashboard, paste its ID into `.env.local`, then:

```bash
npm run agent:configure
```

This creates the seven client tools and patches the agent with everything below. Rerun after editing the prompt in `scripts/configure-agent.ts`. Set `ELEVENLABS_LLM` to override the model. Note: English agents must use `eleven_flash_v2` (v2.5 is the multilingual variant), and Gemini rejects `reasoning_effort`.

## 1. How it works (read this before touching the prompt)

**The server owns the learner's position. The agent owns a voice.** `src/lib/cursor.ts` holds where the learner is (segment, block, question, detour, quiz). Every tool returns `{ kind, say, loc, more, ... }`; the browser client (`src/components/VoiceAgent.tsx`) forwards only `{ "t": "<say>" }` to the agent LLM. The agent never sees or sends an id, so it cannot get one wrong, and its context stays small (one ~150-word block per turn instead of a whole segment).

**Reading loop.** `next` returns one sentence-aligned block of about 150 words (~60 s of speech) with `more: true`. When the agent finishes speaking (`onModeChange → listening`) and nothing interrupted it, the client waits 700 ms and sends a text turn `"continue"`, so the agent calls `next` again. `sendContextualUpdate` does not trigger a turn, so it is not used for this. Barge-in (`onInterruption`, or any real user transcript) cancels the pending continue and POSTs `interrupted`; the server then re-reads the current block after the driver's command, prefixed "Back to it."

**Free-form questions** go to `ask` → `src/lib/ask.ts` → Claude Sonnet 5 (`ANTHROPIC_ASK_MODEL`) with the current part, section objectives, key terms and the table of contents (three cached prompt blocks). The answer is ≤ 3 sentences. The agent never answers from its own knowledge. The ElevenLabs knowledge base is deliberately not used (its snippets would sit in the agent context for the rest of the call).

**Navigation** goes to `goto` with the learner's words verbatim → `src/lib/navigate.ts` (chapter/section numbers, next/back/skip, quiz, then a lexical match over titles, key terms and objectives).

**Latency.** Lookup tools return in ~15 ms. `answer` (open questions, Sonnet 5) is ~3–4 s and `ask` (Sonnet 5, cached, low effort) ~2–4 s; the 2.5 s soft-timeout filler "One sec." and "Nearly there." cover them. A question asked *while a question is open* costs both (classify in `answer`, then `ask`).

## 2. First message

```
{{greeting}}
```

`greeting` is composed server-side by `src/lib/say.ts` from the cursor (fresh start / resume mid-part / resume at a checkpoint) and sent both as a dynamic variable and as a `firstMessage` override. The agent never computes position. The greeting no longer asks the learner to say go: reading starts as soon as it is spoken (see §6 step 2).

## 3. System prompt

The live text is `PROMPT` in `scripts/configure-agent.ts`. Its load-bearing lines:

- "Every tool returns a field `t`. Say `t` aloud, word for word, and nothing else."
- "You may only speak words that came from a tool's `t`, plus okay, holding and goodbye."
- "Anything else is a question, not a mishearing" → `ask`.
- After speaking, wait; never ask "shall I continue".

## 4. Tools (all type **Client**, wait for response ON)

| Tool | Params (agent-facing) | Server | Timeout |
|---|---|---|---|
| `next` | – | next block / next question / next part / return from a detour | 6 s |
| `explain` | `how`: `again` \| `simpler` \| `deeper` \| `example` | key points / altExplanation / deeper / example, zero LLM | 6 s |
| `answer` | `text` (verbatim) | whatever was said to an open question: unmistakable commands are dispatched locally, Claude classifies the rest (answer / question / command / give-up) and grades only an answer; hint on the first miss, answer on the second; questions and commands are routed and the question stays open | 20 s |
| `ask` | `question` (verbatim) | grounded answer from the book (Sonnet 5), records a detour | 20 s |
| `goto` | `target` (verbatim) | chapter N / N.M / next part / next chapter / skip / back / quiz / topic | 6 s |
| `where_am_i` | – | chapter, section, part, chapter %, commutes left, what is next | 6 s |
| `end_trip` | – | ends the trip, spoken summary | 6 s |

Everything the agent does not need (ids, options arrays, flags) stays in the client. The old `get_segment` / `grade_answer` / `complete_segment` still exist on `/api/tools` as adapters but are no longer configured on the agent.

## 5. Dynamic variables

`greeting`, `trip_id`. Nothing else.

## 6. Test checklist

Text-only rehearsal without a mic: open `/learn/voice?text=1` and tap the dial. Same agent, same tools, no TTS credits; it reads on its own but takes no commands (the Dial is hands-free, so there is no text box; use Read mode for a typed run).

1. `npm run dev`, open `/learn/voice`, pick 10 min, Start talking. Allow mic.
2. Agent greets with the server line ("Back in chapter one… Here we go") and starts reading by itself: the client arms auto-continue before the session, so the first `listening` sends "continue" and the agent calls `next`. No "go" needed.
3. It reads a block, pauses ~1 s, and continues on its own. Interrupt mid-block with "explain that differently". The tutor should go quiet within a syllable of you speaking and the orb should stop glowing at the same moment (local ducking, `src/components/useBargeInDucking.ts`); then it gives the analogy at full volume and continues reading the interrupted block ("Back to it."). Clap once while it reads: expect a ~1 s dip and a smooth return, not a stop. Add `?debug=1` to the URL to see the mic meter and duck phase.
4. At a question, answer with a letter or in your own words. Vague open answers are rejected with a nudge.
5. Ask something off-script ("how does this apply to a taxi business?"). Answer comes from the book; "continue" re-anchors.
6. "Where am I" → chapter, section, part, percent, commutes left.
7. "Go to chapter two" → jumps. "Take me to the chapter one quiz" → the book's review questions.
8. "I'm done" → spoken summary, then the app navigates to the summary page ~4 s later.
9. Watch the dev console: `[ctx] N/limit` per turn (agent context), `[ask] … cached=…` (cache hits after the first question in a section), `[tool] name ms`.

## 7. Study mode read-aloud (REST, not the agent)

`/api/tts` calls `POST /v1/text-to-speech/{ELEVENLABS_VOICE_ID}/with-timestamps` with `ELEVENLABS_TTS_MODEL` (default `eleven_flash_v2_5`; the agent stays on `eleven_flash_v2`). It is not a conversation: no agent id, no tools, plain credits per character. A ~150-word block is ~900 characters and is cached on disk after the first play, so replaying chapter 1 costs nothing. Pick the voice on the dashboard Voices page; the default in `.env.example` is Alice (`Xb7hH8MSUJpSbSDYk0k2`).

## 8. Study mode dictation (REST, not the agent)

`POST /api/stt` sends the recorded clip to `POST /v1/speech-to-text` with `ELEVENLABS_STT_MODEL` (default `scribe_v1`, `language_code=en`, audio-event tags off). Same `ELEVENLABS_API_KEY`; the key's plan must include speech-to-text. Nothing is cached, one call per clip, billed per audio hour.

## 9. Cost notes

ElevenLabs bills ~500 credits per minute of conversation regardless of tokens, plus LLM passthrough. Smaller tool returns cut only the passthrough line (~R0.20/min → ~R0.12/min); the reason for the block discipline is reliability and latency, not rands. Trips are open-ended (no planned length); the client hard-stops a forgotten tab after 2 hours (`HARD_STOP_MS` in `VoiceAgent.tsx`). `max_duration_seconds` is 7200 as the agent-side backstop (run `npm run agent:configure` after changing it).
