# ElevenLabs agent configuration

## 0. Fastest path: run the script

Create a blank agent in the dashboard, paste its ID into `.env.local`, then:

```bash
npm run agent:configure
```

This creates the seven client tools and patches the agent with everything below. Rerun after editing the prompt in `scripts/configure-agent.ts`. Set `ELEVENLABS_LLM` to override the model. Note: English agents must use `eleven_flash_v2` (v2.5 is the multilingual variant), and Gemini rejects `reasoning_effort`.

## 1. How it works (read this before touching the prompt)

**The server owns the learner's position. The agent owns a voice.** `src/lib/cursor.ts` holds where the learner is (segment, block, question, detour, quiz). Every tool returns `{ kind, say, loc, more, ... }`; the browser client (`src/components/VoiceAgent.tsx`) forwards only `{ "t": "<say>" }` to the agent LLM. The agent never sees or sends an id, so it cannot get one wrong, and its context stays small (one ~250-word block per turn instead of a whole segment).

**Reading loop.** `next` returns one sentence-aligned block of about 250 words (~100 s of speech) with `more: true`. When the agent finishes speaking (`onModeChange → listening`) and nothing interrupted it, the client waits 300 ms and sends a text turn `"continue"`, so the agent calls `next` again. `sendContextualUpdate` does not trigger a turn, so it is not used for this. Barge-in (`onInterruption`, or any real user transcript) cancels the pending continue and POSTs `interrupted`; the server then re-reads the current block after the driver's command, prefixed "Back to it." Every turn boundary is ~1.5–2.5 s of silence (the agent LLM re-emits the block, then TTS starts); the `next` round trip is ~15 ms and the following block is peek-warmed, so the block size and the grace window are the only levers on those gaps.

**"listening" is not "finished".** `onModeChange → listening` also fires in the gaps between TTS chunks: most are under 300 ms, but two or three per session run 300–1500 ms, and each one used to fire "continue" mid-block. ElevenLabs then reported our own turn as an `interruption`, the client POSTed `interrupted`, and the block was re-read ("Back to it."), or the greeting was cut short. The client now knows how long the current utterance must take (its transcript arrives as speech starts; word count at `GATE_WPM` = 220, faster than the voice's measured 165–215 wpm) and treats an earlier "listening" as jitter: it waits out the remainder and only sends "continue" if the agent is still silent. An `interruption` inside 1.5 s of our own "continue" is logged as `synthetic` and does not mark the block unheard. Peeks (`next {peek:true}`) run on a clone of progress: a peek that mutated the live cursor was the other half of the "Again. <question>" bug (the phase had already flipped to `ask` behind the client's back).

**Chat (anything off-script)** goes to `ask` → `src/lib/ask.ts` → Claude Sonnet 5 (`ANTHROPIC_ASK_MODEL`) with the table of contents, the part read so far, the checkpoint questions asked here and the learner's answers to them, and the chat so far at this position (`Cursor.detour.history`, last 6 turns) — three cached prompt blocks. It is a conversation, not a lookup: the model uses the book first but may range beyond it (examples, opinions, "what did I get wrong"), stays under ~80 spoken words, and the server ends every turn with an offer ("Want to get back to the lesson, or keep chatting?" / "…or back to the question?"). The learner stays in the chat until a return command (continue, carry on, back to the lesson, back to the question) → `next`, which re-anchors ("Back to <part>." / "Back to the question."). The agent LLM never answers from its own knowledge. The ElevenLabs knowledge base is deliberately not used (its snippets would sit in the agent context for the rest of the call).

**No auto-continue across a learner turn.** The client arms "continue" only from a tool reply with `more: true`, and disarms it the moment a real learner transcript arrives or while a tool is in flight (`thinkingRef`). Before this, the agent's filler while `ask` ran ("Looking into your question now") ended, the 700 ms timer fired "continue", and the answer was spoken over by the next block. The prompt also forbids fillers; the soft-timeout "One sec." covers the wait.

**No pre-tool speech, ever.** Every tool is configured with `pre_tool_speech: "off"`. With the platform default (`auto`) the LLM adds a `system__message_to_speak` filler to the call ("Let me check on that for you"), and that filler is the agent's turn: if the tool result lands after the filler has finished playing, no LLM turn runs and the `t` is never spoken. In `trip-mu7f5dbm` three `ask` answers in a row went unsaid this way (the one time it worked, the result arrived while the filler was still playing). The soft-timeout filler is a different mechanism and keeps the turn open. Belt and braces: the client starts a 3 s watchdog after every tool reply with words; if the agent has not started speaking, it logs `reply_unspoken` and sends a "say it" turn, which the prompt answers with the pending `t`.

**Silence is not a prompt.** `turn_timeout` is 30 s (the API maximum; it was 10). On timeout the platform injects a user turn `"..."`, and the LLM used to improvise "Are you still there?" over the learner's thinking time, over a muted mic, and over a tool result that was about to be spoken. The prompt's SILENCE rule answers `"..."` with the built-in `skip_turn` tool and nothing else.

**Navigation** goes to `goto` with the learner's words verbatim → `src/lib/navigate.ts` (chapter/section numbers, next/back/skip, quiz, then a lexical match over titles, key terms and objectives).

**Latency.** Lookup tools return in ~15 ms. `answer` (open questions, Sonnet 5) is ~3–4 s and `ask` (Sonnet 5, cached, low effort) ~2–4 s; the 2.5 s soft-timeout filler "One sec." and "Nearly there." cover them. A question asked *while a question is open* costs both (classify in `answer`, then `ask`).

## 2. First message

```
{{greeting}}
```

`greeting` is composed server-side by `src/lib/say.ts` from the cursor (fresh start / resume mid-part / resume at a checkpoint) and sent both as a dynamic variable and as a `firstMessage` override. The agent never computes position. The greeting no longer asks the learner to say go: reading starts as soon as it is spoken (see §6 step 2).

## 2b. Voice override

The learner picks a voice on `/settings` (`Progress.voiceId`). Listen sends it as `overrides.tts.voiceId` on `startSession`; without a pick the agent's dashboard voice is used. `scripts/configure-agent.ts` enables `platform_settings.overrides.conversation_config_override.tts.voice_id`, without which the session is refused. The eight offered voices are frozen in `data/voices.json` by `npm run voices:sync` (`scripts/voices.ts`: top trending English library voices, added to the account, samples saved to `public/voices/`). Library voices must be added to the account before TTS or the agent can use them; a voice removed from the account breaks both surfaces for whoever picked it, so re-run the sync rather than deleting on the dashboard.

## 3. System prompt

The live text is `PROMPT` in `scripts/configure-agent.ts`. Its load-bearing lines:

- "Every tool returns a field `t`. Say `t` aloud, word for word, and nothing else."
- "You may only speak words that came from a tool's `t`, plus okay, holding and goodbye."
- "Anything else is chat, not a mishearing" → `ask`, and stays in `ask` until a return command → `next`.
- "While a tool is running, say nothing" (fillers used to trigger the client's auto-continue).
- "hold on, wait, pause, stop, hang on → Holding." — stop is a hold, never an end. Only "I'm done / I've arrived / end the trip / end the session" call `end_trip`.
- SILENCE → `skip_turn`; never ask whether they are still there.
- "say it" → say the last `t` not yet spoken (the client's unspoken-reply watchdog).
- After speaking, wait; never ask "shall I continue".

## 4. Tools (all type **Client**, wait for response ON, pre-tool speech **off**)

Plus the built-in `skip_turn` system tool (`built_in_tools.skip_turn`), used only for silence.

| Tool | Params (agent-facing) | Server | Timeout |
|---|---|---|---|
| `next` | – | next block / next question / next part / return from a detour | 6 s |
| `explain` | `how`: `again` \| `simpler` \| `deeper` \| `example` | key points / altExplanation / deeper / example, zero LLM | 6 s |
| `answer` | `text` (verbatim) | whatever was said to an open question: unmistakable commands are dispatched locally, Claude classifies the rest (answer / question / command / give-up) and grades only an answer; hint on the first miss, answer on the second; questions and commands are routed and the question stays open | 20 s |
| `ask` | `question` (verbatim) | chat turn in context (Sonnet 5): book first, general knowledge allowed, chat history at this position; ends with the "back to the lesson, or keep chatting?" offer; records a detour | 20 s |
| `goto` | `target` (verbatim) | chapter N / N.M / next part / next chapter / skip / back / quiz / topic | 6 s |
| `where_am_i` | – | chapter, section, part, chapter %, commutes left, what is next | 6 s |
| `end_trip` | – | ends the trip, spoken summary. Only on "I'm done / I've arrived / end the trip"; "stop" is a hold | 6 s |

Everything the agent does not need (ids, options arrays, flags) stays in the client. The old `get_segment` / `grade_answer` / `complete_segment` still exist on `/api/tools` as adapters but are no longer configured on the agent.

## 5. Dynamic variables

`greeting`, `trip_id`. Nothing else.

## 6. Test checklist

Text-only rehearsal without a mic: open `/learn/voice?text=1` and tap the dial. Same agent, same tools, no TTS credits; it reads on its own but takes no commands (the Dial is hands-free, so there is no text box; use Read mode for a typed run).

1. `npm run dev`, open `/learn/voice`, pick 10 min, Start talking. Allow mic.
2. Agent greets with the server line ("Back in chapter one… Here we go") and starts reading by itself: the client arms auto-continue before the session, so the first `listening` sends "continue" and the agent calls `next`. No "go" needed. Neither the greeting nor the first block should show `[interrupted]` in the session log, and no `interruption` row should precede the first "continue".
3. It reads a block (~100 s), pauses ~1–2 s, and continues on its own; the gold ring creeps while it reads. The first checkpoint arrives as "Quick check. …", never "Again. …".
3b. Say "stop" mid-block → "Holding." and silence; the trip stays open. Say "continue" → "Back to it. …". Stay silent for 15 s at a question → nothing; no "Are you still there". Interrupt mid-block with "explain that differently". The tutor should go quiet within a syllable of you speaking and the orb should stop glowing at the same moment (local ducking, `src/components/useBargeInDucking.ts`); then it gives the analogy at full volume and continues reading the interrupted block ("Back to it."). Clap once while it reads: expect a ~1 s dip and a smooth return, not a stop. Add `?debug=1` to the URL to see the mic meter and duck phase.
4. At a question, answer with a letter or in your own words. Vague open answers are rejected with a nudge.
5. Interrupt a block with something off-script ("how does this apply to a taxi business?"). No "continue" should appear in the session log between your words and the `ask` reply; no "Let me check on that" filler either; the answer is spoken within ~1 s of the `agent_tool_result` row and ends with the offer. Zero `reply_unspoken` rows in the log. Say "yes" or a follow-up → another `ask`, with memory of the last turn. After a wrong checkpoint answer, "what did I get wrong?" names your actual answer. "Back to the lesson" / "continue" re-anchors ("Back to <part>.").
6. "Where am I" → chapter, section, part, percent, commutes left.
7. "Go to chapter two" → jumps. "Take me to the chapter one quiz" → the book's review questions.
8. "I'm done" → spoken summary, then the app navigates to the summary page ~4 s later.
9. Watch the dev console: `[ctx] N/limit` per turn (agent context), `[ask] … cached=…` (cache hits after the first question in a section), `[tool] name ms`.

## 7. Study mode read-aloud (REST, not the agent)

`/api/tts` calls `POST /v1/text-to-speech/{ELEVENLABS_VOICE_ID}/with-timestamps` with `ELEVENLABS_TTS_MODEL` (default `eleven_flash_v2_5`; the agent stays on `eleven_flash_v2`). It is not a conversation: no agent id, no tools, plain credits per character. A ~250-word block is ~1500 characters and is cached on disk after the first play, so replaying chapter 1 costs nothing. `ELEVENLABS_VOICE_ID` is the fallback when the learner has not picked a voice on `/settings` (see §2b); the default in `.env.example` is Alice (`Xb7hH8MSUJpSbSDYk0k2`). The voice is part of the cache key, so each voice is synthesised once per block.

## 8. Study mode dictation (REST, not the agent)

`POST /api/stt` sends the recorded clip to `POST /v1/speech-to-text` with `ELEVENLABS_STT_MODEL` (default `scribe_v1`, `language_code=en`, audio-event tags off). Same `ELEVENLABS_API_KEY`; the key's plan must include speech-to-text. Nothing is cached, one call per clip, billed per audio hour.

## 9. Cost notes

ElevenLabs bills ~500 credits per minute of conversation regardless of tokens, plus LLM passthrough. Smaller tool returns cut only the passthrough line (~R0.20/min → ~R0.12/min); the reason for the block discipline is reliability and latency, not rands. Trips are open-ended (no planned length); the client hard-stops a forgotten tab after 2 hours (`HARD_STOP_MS` in `VoiceAgent.tsx`). `max_duration_seconds` is 7200 as the agent-side backstop (run `npm run agent:configure` after changing it).
