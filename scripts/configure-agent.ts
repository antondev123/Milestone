// Push the full agent config from docs/ELEVENLABS.md to ElevenLabs via API.
// Idempotent: reuses tools with the same name, patches the agent in place.
// Usage: node --env-file=.env.local scripts/configure-agent.ts
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

const TOOLS = [
  {
    name: "get_segment",
    description: "Fetch the lesson segment to read and its checkpoint questions. Call with no segmentId for the first segment of the trip.",
    parameters: { type: "object", properties: { segmentId: str("Segment id like sample/m1/s2. Omit for the trip's first segment.") }, required: [] },
  },
  {
    name: "grade_answer",
    description: "Grade the learner's spoken answer to a checkpoint question. Returns correct (boolean) and feedback to read aloud.",
    parameters: {
      type: "object",
      properties: { questionId: str("From get_segment questions[].questionId"), answer: str("The learner's answer, verbatim") },
      required: ["questionId", "answer"],
    },
  },
  {
    name: "complete_segment",
    description: "Mark a segment finished after its questions. Returns the next segment id or tripDone.",
    parameters: { type: "object", properties: { segmentId: str("The segment that was just finished") }, required: ["segmentId"] },
  },
  {
    name: "end_trip",
    description: "End the trip and get a spoken progress summary. Call when the plan is finished or the learner says they are done.",
    parameters: { type: "object", properties: {}, required: [] },
  },
];

const FIRST_MESSAGE = `Ready when you are. {{trip_segments}} segments fit in this trip. Say "go" and I'll pick up where you left off.`;

const PROMPT = `You are a hands-free tutor for someone driving to work. They cannot look at a screen. Keep every turn short: 1–3 sentences unless you are reading a lesson segment.

TRIP: {{trip_segments}} segment(s), about {{trip_minutes}} minutes. First segment id: {{first_segment_id}}. Resume position: {{resume_position}} ("start" = read the segment, "checkpoint" = they already heard it, go straight to the questions).

LOOP, for each segment:
1. Call get_segment (with segmentId, or no argument for the first one). It returns script, keyPoints, altExplanation, deeper, and questions.
2. If position is "start": read the script aloud, naturally, in chunks. Do not summarise it. Do not add filler like "great question".
3. Then ask each question in order, one at a time. For mcq, read the options. Wait for the answer.
4. Call grade_answer with questionId and the learner's words verbatim. Speak the feedback it returns. If wrong on the first try, offer one retry; then move on.
5. After the last question call complete_segment with the segmentId. If tripDone is false, say "next up" and continue with nextSegmentId. If tripDone is true, call end_trip and read its "spoken" field, then say goodbye.

COMMANDS, at any moment, even mid-sentence:
- "repeat" / "say that again": read the keyPoints, then carry on.
- "explain differently" / "I don't get it": read altExplanation, then carry on.
- "go deeper" / "tell me more": read deeper, then carry on.
- "skip": skip the rest of this segment's script and go to its questions. If already in questions, skip to complete_segment.
- "I'm done" / "stop" / "I've arrived": call end_trip immediately, read its spoken summary, say goodbye.

RULES:
- Never grade an answer yourself. Always call grade_answer.
- Never invent lesson content. Only read what the tools return.
- If the learner is quiet for a while, ask "still with me?" once, then continue.
- No markdown, no lists, no emojis. This is speech.`;

// 1. tools: reuse by name, else create
type ToolRow = { id: string; tool_config: { name: string } };
const existing = await api<{ tools: ToolRow[] }>("GET", "/tools");
const toolIds: string[] = [];
for (const t of TOOLS) {
  const config = { type: "client", ...t, expects_response: true, response_timeout_secs: 20, disable_interruptions: false };
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
        dynamic_variable_placeholders: { trip_minutes: 10, trip_segments: 2, first_segment_id: "sample/m1/s1", resume_position: "start" },
      },
      prompt: {
        prompt: PROMPT,
        llm: LLM,
        temperature: 0.3,
        ...(/gpt-5|claude/.test(LLM) ? { reasoning_effort: "low" } : {}),
        enable_reasoning_summary: false,
        max_tokens: -1,
        tool_ids: toolIds,
        tools: [],
        enable_parallel_tool_calls: false,
      },
    },
    tts: { model_id: "eleven_flash_v2" }, // English agents must use flash v2; v2_5 is the multilingual variant
    turn: {
      mode: "turn",
      turn_timeout: 10,
      soft_timeout_config: {
        timeout_seconds: 5,
        message: "Let me check that.",
        additional_soft_timeout_messages: ["Nearly there."],
        use_llm_generated_message: false,
        randomize_fillers: false,
        disable_until_first_user_message: true,
      },
    },
    conversation: { max_duration_seconds: 3600 },
  },
});
console.log(`agent ${agentId}: configured with ${LLM}, ${toolIds.length} tools`);
