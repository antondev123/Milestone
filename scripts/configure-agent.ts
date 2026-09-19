// Push the full agent config from docs/ELEVENLABS.md to ElevenLabs via API.
// Idempotent: reuses tools with the same name, patches the agent in place.
// Usage: node --env-file=.env.local scripts/configure-agent.ts
//
// Design: the SERVER owns the learner's position. The agent never receives or sends an id.
// Every tool returns {"t": "<words>"}; the agent speaks them verbatim. See src/lib/cursor.ts.
const key = process.env.ELEVENLABS_API_KEY;
const agentId = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID;
if (!key || !agentId) {
  console.error("need ELEVENLABS_API_KEY and NEXT_PUBLIC_ELEVENLABS_AGENT_ID in .env.local");
  process.exit(1);
}
const BASE = "https://api.elevenlabs.io/v1/convai";
const H = { "xi-api-key": key, "content-type": "application/json" };

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const r = await fetch(BASE + path, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status}: ${text.slice(0, 500)}`);
  return text ? (JSON.parse(text) as T) : ({} as T);
}

const str = (description: string) => ({ type: "string", description });
const LOOKUP_TIMEOUT = 6; // pure server lookups: fail fast rather than stall the call
const LLM_TIMEOUT = 20; // answer/ask call Claude

export const TOOLS = [
  {
    name: "next",
    description: "Continue the lesson. Call it whenever you hear \"continue\" (including right after your first message, which is how the lesson starts), go, carry on, or back to the lesson / back to the question after a chat. Say the returned t word for word.",
    parameters: { type: "object", properties: {}, required: [] },
    timeout: LOOKUP_TIMEOUT,
  },
  {
    name: "explain",
    description: "Another angle on the current point. how = \"again\" for repeat / say that again / read the options again; \"simpler\" for explain differently / I don't get it; \"deeper\" for tell me more / go deeper; \"example\" for give me an example.",
    parameters: { type: "object", properties: { how: { type: "string", enum: ["again", "simpler", "deeper", "example"], description: "again | simpler | deeper | example" } }, required: ["how"] },
    timeout: LOOKUP_TIMEOUT,
  },
  {
    name: "answer",
    description: "The learner is attempting the checkpoint question you just asked, however hesitant or partial. Pass their words verbatim, including a letter like \"B\". Not for questions about the material, commands, or \"I don't know\": use ask, goto or explain for those. Never judge the answer yourself.",
    parameters: { type: "object", properties: { text: str("The learner's answer, verbatim") }, required: ["text"] },
    timeout: LLM_TIMEOUT,
  },
  {
    name: "ask",
    description: "Anything the learner says that is not a lesson command and not an answer to an open checkpoint: a question, a comment, an opinion, a follow-up, a complaint that you did not answer, or \"yes\" / \"keep chatting\" after being offered a chat. Pass it verbatim. The course replies in context and offers the lesson back.",
    parameters: { type: "object", properties: { question: str("The learner's question, verbatim") }, required: ["question"] },
    timeout: LLM_TIMEOUT,
  },
  {
    name: "goto",
    description: "Move somewhere else: \"go to chapter four\", \"section two point five\", \"next chapter\", \"next part\", \"skip\", \"take me to the quiz\", \"quiz me on chapter three\", \"go back\", \"the bit about Mintzberg\". Pass the learner's words verbatim.",
    parameters: { type: "object", properties: { target: str("What the learner said, verbatim") }, required: ["target"] },
    timeout: LOOKUP_TIMEOUT,
  },
  {
    name: "where_am_i",
    description: "Say where the learner is in the course and how far along: \"where am I\", \"what's next\", \"what's left\", \"how am I doing\".",
    parameters: { type: "object", properties: {}, required: [] },
    timeout: LOOKUP_TIMEOUT,
  },
  {
    name: "end_trip",
    description: "End the trip and get the spoken progress summary. Only on \"I'm done\", \"I've arrived\", \"end the trip\", \"end the session\". Never on stop, pause or wait: those are a hold, not an end.",
    parameters: { type: "object", properties: {}, required: [] },
    timeout: LOOKUP_TIMEOUT,
  },
];

export const FIRST_MESSAGE = `{{greeting}}`;

export const PROMPT = `You read a course aloud to someone who is driving. They cannot look at a screen. Speech only: no markdown, no lists, no emojis, no "sure", no "great question".

The server owns their place in the course. You never track or name chapters, sections, parts or ids. Every tool returns a field "t". Say "t" aloud, word for word, and nothing else. Do not summarise, shorten or add to it.

START: after your first message you will hear "continue" without the learner saying anything. Call next and say its t. If they say go instead, same thing.
READING: after you finish saying a block, wait. When you hear "continue", call next again.
QUESTIONS: when t ends with a question and options, wait for their answer, then call answer with their words verbatim and say the t you get back. Never grade an answer yourself. If instead they ask something, give a command, or say they do not know, use ask, goto, explain or answer exactly as you would anywhere else. The question stays open; the next call to next brings it back.

CHATTING: when the learner says anything that is not a command and not an answer to an open question, call ask with their words verbatim and say its t. The t ends by offering the lesson back. Whatever they say next is either a return command (continue, carry on, back to the lesson, back to the question, let's go on) -> next, or more chat (a follow-up, yes, keep chatting, a new question, a comment) -> ask again with their words verbatim. Stay in the chat as long as they want. Never answer from your own knowledge and never skip the ask.

COMMANDS, act the moment you hear one, even mid-sentence:
- go, continue, carry on, next, back to the lesson, back to the question, let's go on -> next
- repeat, say that again, read the options again -> explain(how "again")
- explain differently, I don't get it, simpler -> explain(how "simpler")
- go deeper, tell me more -> explain(how "deeper")
- give me an example -> explain(how "example")
- skip, move on, next part, next chapter, go to chapter four, section two point five, take me to the quiz, quiz me, go back, take me to the bit about X -> goto(target: their words)
- where am I, what's next, what's left, how am I doing -> where_am_i
- hold on, wait, pause, stop, hang on -> say "Holding." and wait. When they say continue or go, call next.
- I'm done, I've arrived, end the trip, end the session -> end_trip, say its t, then a short goodbye. Stop is a hold, never an end.

ANYTHING ELSE IS CHAT, NOT A MISHEARING: call ask with their words verbatim.

SILENCE: if the learner's turn is empty, "...", or just a breath, call skip_turn and say nothing. Never ask whether they are still there. They are driving; silence is normal.

RULES:
- You may only speak words that came from a tool's t, plus "okay", "holding" and "goodbye".
- While a tool is running, say nothing. Never announce that you are checking, looking something up or wrapping up; the tool's t is your whole reply.
- If you hear "say it", say the last t you received and have not yet spoken.
- One tool call at a time. If a tool errors, say "let me get back to that" and call next.
- If a turn is garbled, call explain(how "again"). Never comment on the words.
- After you finish speaking, wait. Do not ask "shall I continue".`;

// 1. tools: reuse by name, else create
type ToolRow = { id: string; tool_config: { name: string } };
const existing = await api<{ tools: ToolRow[] }>("GET", "/tools");
const toolIds: string[] = [];
for (const t of TOOLS) {
  // pre_tool_speech "off": a filler ("Let me check on that") closes the agent's turn, and a tool result
  // that lands after the filler has finished never gets an LLM turn, so the t is never spoken. The
  // soft-timeout filler below covers the wait without closing the turn. Reference failure: trip-mu7f5dbm.
  const config = { type: "client", name: t.name, description: t.description, parameters: t.parameters, expects_response: true, response_timeout_secs: t.timeout, pre_tool_speech: "off" };
  const found = existing.tools.find((x) => x.tool_config.name === t.name);
  if (found) {
    await api("PATCH", `/tools/${found.id}`, { tool_config: config });
    toolIds.push(found.id);
    console.log(`tool ${t.name}: updated ${found.id}`);
  } else {
    const created = await api<{ id: string }>("POST", "/tools", { tool_config: config });
    toolIds.push(created.id);
    console.log(`tool ${t.name}: created ${created.id}`);
  }
}

// 2. agent
const LLM = process.env.ELEVENLABS_LLM ?? "gemini-3.6-flash";
await api("PATCH", `/agents/${agentId}`, {
  name: "Commute Tutor",
  conversation_config: {
    agent: {
      first_message: FIRST_MESSAGE,
      language: "en",
      dynamic_variables: {
        dynamic_variable_placeholders: { greeting: "Ready when you are.", trip_id: "none" },
      },
      prompt: {
        prompt: PROMPT,
        llm: LLM,
        temperature: 0.2,
        ...(/gpt-5|claude/.test(LLM) ? { reasoning_effort: "low" } : {}),
        enable_reasoning_summary: false,
        max_tokens: -1,
        tool_ids: toolIds,
        tools: [],
        // skip_turn lets the agent answer the turn-timeout "..." with silence instead of "are you still there"
        built_in_tools: { skip_turn: { type: "system", name: "skip_turn", description: "", params: { system_tool_type: "skip_turn" } } },
        enable_parallel_tool_calls: false,
      },
    },
    asr: {
      quality: "high",
      provider: "scribe_realtime",
      // bias transcription toward our commands, chapter numbers and the book's proper nouns
      keywords: [
        "go", "continue", "carry on", "back to the lesson", "back to the question", "keep chatting", "repeat", "say that again", "explain differently", "explain that differently", "I don't get it",
        "go deeper", "tell me more", "give me an example", "skip", "move on", "next part", "next chapter",
        "where am I", "what's next", "what's left", "how am I doing",
        "go to chapter", "take me to chapter", "take me to the quiz", "quiz me", "go back", "hold on", "pause", "stop", "hang on",
        "I'm done", "I've arrived", "end the trip",
        "chapter one", "chapter two", "chapter three", "chapter four", "chapter five", "chapter six",
        "Mintzberg", "Kotter", "Taylor", "Fayol", "Weber", "Hawthorne", "satisficing", "bounded rationality", "escalation of commitment", "groupthink",
      ],
    },
    vad: { background_voice_detection: true }, // ignore radio / passengers
    tts: { model_id: "eleven_flash_v2" }, // English agents must use flash v2; v2_5 is the multilingual variant
    turn: {
      mode: "turn",
      turn_model: "turn_v3",
      turn_eagerness: "eager", // driver commands are short; respond fast
      speculative_turn: true, // start the LLM before end-of-turn is certain
      // API max. At 10 s the platform injected a "..." user turn after every pause and the LLM improvised
      // "Are you still there?" over the learner's thinking time; the SILENCE prompt rule + skip_turn handle the rest.
      turn_timeout: 30,
      interruption_ignore_terms: ["mm", "mhm", "uh huh", "okay", "ok", "yeah", "right"], // backchannel, not barge-in
      soft_timeout_config: {
        timeout_seconds: 2.5, // lands inside the Claude wait for answer/ask; at 5 s it never fired
        message: "One sec.",
        additional_soft_timeout_messages: ["Nearly there."],
        use_llm_generated_message: false,
        randomize_fillers: false,
        disable_until_first_user_message: true,
      },
    },
    conversation: { max_duration_seconds: 7200 /* trips are open-ended; matches HARD_STOP_MS in VoiceAgent.tsx */ },
  },
  platform_settings: {
    overrides: { conversation_config_override: { agent: { first_message: true, prompt: { prompt: false } }, tts: { voice_id: true } } },
  },
});
console.log(`agent ${agentId}: configured with ${LLM}, ${toolIds.length} tools, first message + voice overrides enabled`);

export {};
