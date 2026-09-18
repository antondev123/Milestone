// Print current spend and balances in rands. Usage: npm run ledger
// ElevenLabs credits come from the API. Anthropic has no usage endpoint on a
// normal key, so Claude spend is the running estimate kept in docs/LEDGER.md.
const key = process.env.ELEVENLABS_API_KEY!;
const agentId = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID!;
const H = { "xi-api-key": key };

const CREATOR_USD_PER_MONTH = 22;
const CREATOR_CREDITS = 100_000;
const USD_PER_CREDIT = CREATOR_USD_PER_MONTH / CREATOR_CREDITS;

const fx = (await (await fetch("https://open.er-api.com/v6/latest/USD")).json()) as { rates: { ZAR: number } };
const ZAR = fx.rates.ZAR;
const R = (usd: number) => `R${(usd * ZAR).toFixed(2)}`;

const u = (await (await fetch("https://api.elevenlabs.io/v1/user", { headers: H })).json()) as {
  subscription: { tier: string; character_count: number; character_limit: number; next_character_count_reset_unix: number };
};
const s = u.subscription;
const left = s.character_limit - s.character_count;

console.log(`FX: R${ZAR.toFixed(2)} per USD`);
console.log(`\nELEVENLABS (${s.tier})`);
console.log(`  used      ${s.character_count.toLocaleString()} credits  (${R(s.character_count * USD_PER_CREDIT)})`);
console.log(`  left      ${left.toLocaleString()} credits  (${R(left * USD_PER_CREDIT)})  resets ${new Date(s.next_character_count_reset_unix * 1000).toISOString().slice(0, 10)}`);

type Conv = { conversation_id: string; start_time_unix_secs: number; call_duration_secs: number };
const list = (await (await fetch(`https://api.elevenlabs.io/v1/convai/conversations?agent_id=${agentId}&page_size=50`, { headers: H })).json()) as { conversations: Conv[] };
let credits = 0, secs = 0;
console.log(`\n  calls:`);
for (const c of list.conversations ?? []) {
  const d = (await (await fetch(`https://api.elevenlabs.io/v1/convai/conversations/${c.conversation_id}`, { headers: H })).json()) as { metadata?: { cost?: number } };
  const cost = d.metadata?.cost ?? 0;
  credits += cost;
  secs += c.call_duration_secs;
  console.log(`    ${new Date(c.start_time_unix_secs * 1000).toISOString().replace("T", " ").slice(0, 16)}  ${String(c.call_duration_secs).padStart(4)} s  ${String(cost).padStart(6)} credits  ${R(cost * USD_PER_CREDIT)}`);
}
const perMin = secs ? Math.round((credits / secs) * 60) : 0;
console.log(`  total     ${credits} credits over ${secs} s  =  ${R(credits * USD_PER_CREDIT)}   (~${perMin} credits/min, ${R(perMin * USD_PER_CREDIT)}/min)`);
console.log(`  runway    ~${perMin ? Math.floor(left / perMin) : "?"} minutes of voice left this month`);

export {};
