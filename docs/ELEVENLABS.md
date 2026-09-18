# ElevenLabs agent configuration

## 0. Fastest path: run the script

Create a blank agent in the dashboard, paste its ID into `.env.local`, then:

```bash
node --env-file=.env.local scripts/configure-agent.ts
```

This creates the four client tools and patches the agent with everything below. Rerun after editing the prompt in the script. Set `ELEVENLABS_LLM` to override the model. Note: English agents must use `eleven_flash_v2` (v2.5 is the multilingual variant), and Gemini rejects `reasoning_effort`.

## 0b. Manual dashboard steps (if you prefer)

1. Go to elevenlabs.io → **Agents** (left sidebar) → **New agent** → **Blank agent**. Name it **Commute Tutor**.
2. **Agent tab**: paste the **First message** from §2 and the **System prompt** from §3. Set language English.
3. Still on Agent tab, find **Dynamic variables** and add four placeholders with any default: `trip_minutes` = 10, `trip_segments` = 2, `first_segment_id` = sample/m1/s1, `resume_position` = start. The app overwrites these on connect; without placeholders the prompt shows raw `{{...}}`.
4. **Voice tab**: pick a voice. Set **TTS model** to **Eleven Flash v2.5**.
5. **LLM panel**: LLM = Gemini 3.6 Flash (else Gemini 2.5 Flash, GPT-4.1 mini, else Claude Haiku 4.5). Backup LLM = Default. Temperature ~0.3. Reasoning effort = Low. Reasoning summary off. Limit token usage = -1. **Parallel tool calling = OFF** (our tool loop is sequential). Soft timeout: enabled, 5 s, wait for first user message ON, LLM-generated message OFF, first message "Let me check that.", extra filler "Nearly there.", randomize off. Agent behavior: shortest/most direct preset if offered, else Default.
6. **Tools**: click **Add tool** four times. For each, set **Tool type = Client**, then Name, Description and Parameters exactly as in §4 (Data type, Identifier, Required, Description per parameter). Tick **Wait for response** on all four. Timeout 20 s.
7. **Advanced / Conversation**: enable **interruptions** (barge-in). Turn timeout 10 s. Max duration 3600 s.
8. **Security tab**: leave the agent **public** (no auth). Under **Allowlist**, add `localhost:3000` if a field is offered, otherwise leave empty.
9. Copy the **Agent ID** (top of the agent page or the code snippet in the **Widget** tab, looks like `agent_xxxx`).
10. Paste it into `.env.local` as `NEXT_PUBLIC_ELEVENLABS_AGENT_ID=agent_xxxx`, restart `npm run dev`, open http://localhost:3000/learn/voice, and run the checklist in §6.

If a tab or label has moved, the fields are the same; search the agent page for the label.

Everything you need to set in the dashboard (Conversational AI → Agents → Create). Once done, paste the agent ID into `.env.local` as `NEXT_PUBLIC_ELEVENLABS_AGENT_ID`.

## 1. Agent basics

| Setting | Value |
|---|---|
| Name | Commute Tutor |
| LLM | Whatever is fastest in the dashboard (Gemini Flash / GPT-4o-mini class). Latency > smarts here; grading is done by our own tool, not the agent LLM. |
| Voice | Any clear English voice. Try a South African-accented one if available. |
| TTS model | **Eleven Flash v2.5** (lowest latency). Not Multilingual v2. |
| Language | English |
| Max conversation duration | 3600 s |
| Turn timeout | 10 s (driver may take a moment) |
| Interruptions | **Enabled** (this is the barge-in demo) |
| Auth | Public agent (no signed URL needed). If you make it private, use `ELEVENLABS_API_KEY` and add a signed-URL route later. |

## 2. First message

```
Ready when you are. {{trip_segments}} segments fit in this trip. Say "go" and I'll pick up where you left off.
```

## 3. System prompt

Paste verbatim. `{{...}}` are dynamic variables the app sends on connect.

```
You are a hands-free tutor for someone driving to work. They cannot look at a screen. Keep every turn short: 1–3 sentences unless you are reading a lesson segment.

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
- No markdown, no lists, no emojis. This is speech.
```

## 4. Tools

Tools are **client tools** (executed in the browser by our React component, which calls our API). In the dashboard, add each as type **Client**. Names and parameter schemas must match exactly.

If you would rather use **Webhook** tools, the same four exist at `POST {NEXT_PUBLIC_BASE_URL}/api/tools/<name>` with header `x-tool-secret: <TOOL_WEBHOOK_SECRET>`. That needs a public URL (`ngrok http 3000`) for local dev.

### get_segment
Description: `Fetch the lesson segment to read and its checkpoint questions. Call with no segmentId for the first segment of the trip.`
Parameters:
```json
{
  "type": "object",
  "properties": {
    "segmentId": { "type": "string", "description": "Segment id like sample/m1/s2. Omit for the trip's first segment." }
  }
}
```
Returns: `{ segmentId, title, position, indexInTrip, tripLength, nextSegmentId, script, keyPoints[], altExplanation, deeper, questions: [{questionId, prompt, type, options[]}] }`

### grade_answer
Description: `Grade the learner's spoken answer to a checkpoint question. Returns correct (boolean) and feedback to read aloud.`
Parameters:
```json
{
  "type": "object",
  "properties": {
    "questionId": { "type": "string", "description": "From get_segment questions[].questionId" },
    "answer": { "type": "string", "description": "The learner's answer, verbatim" }
  },
  "required": ["questionId", "answer"]
}
```
Returns: `{ correct: boolean, feedback: string }`

### complete_segment
Description: `Mark a segment finished after its questions. Returns the next segment id or tripDone.`
Parameters:
```json
{
  "type": "object",
  "properties": {
    "segmentId": { "type": "string" }
  },
  "required": ["segmentId"]
}
```
Returns: `{ nextSegmentId: string | null, tripDone: boolean }`

### end_trip
Description: `End the trip and get a spoken progress summary. Call when the plan is finished or the learner says they are done.`
Parameters:
```json
{ "type": "object", "properties": {} }
```
Returns: `{ spoken: string, tripId, segmentIds[], correct, total, modulePct, streakDays, mastered[], weak[] }`

Tick **"Wait for response"** on all four. Timeouts: 20 s (grade_answer calls Claude).

## 5. Dynamic variables

Declare these in the agent's dynamic variables section (defaults don't matter, the app sends real values): `trip_minutes`, `trip_segments`, `first_segment_id`, `resume_position`.

## 6. Test checklist

1. `npm run dev`, open `/learn/voice`, pick 5 min, Start talking. Allow mic.
2. Agent should greet with the segment count. Say "go".
3. Interrupt mid-script with "explain differently". The tutor should go quiet within a syllable of you speaking and the orb should stop glowing at the same moment (local ducking); then it reads the analogy at full volume. Clap once while it reads: expect a ~1 s dip and a smooth return, not a stop. Add `?debug=1` to the URL to see the mic meter and duck phase.
4. Answer a question vaguely ("um, saving I think"). Should be rejected with a nudge.
5. Say "I'm done". Should read a summary, and the app should navigate to the summary page ~4 s later.
