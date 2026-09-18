// Deploy to Fly.io using the values in .env.local. Usage:
//   npm run deploy:fly              → set secrets, build, deploy
//   npm run deploy:fly -- --secrets → only sync secrets (restarts the machine)
// First-time setup is in docs/DEPLOY.md (fly auth login, fly apps create, fly volumes create).
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const env = process.env;
if (!existsSync(".env.local")) throw new Error("no .env.local; copy .env.example and fill it in");

const toml = readFileSync("fly.toml", "utf8");
const app = /^app\s*=\s*"([^"]+)"/m.exec(toml)?.[1];
if (!app) throw new Error("fly.toml has no app name");

// Server-side only. NEXT_PUBLIC_* are inlined at build time and go in as build args below.
const SECRET_KEYS = [
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_MODEL",
  "ANTHROPIC_ASK_MODEL",
  "ELEVENLABS_API_KEY",
  "TOOL_WEBHOOK_SECRET",
  "COURSE_ID",
];
const secrets = SECRET_KEYS.filter((k) => env[k]).map((k) => `${k}=${env[k]}`);
if (!env.ANTHROPIC_API_KEY) console.warn("warning: ANTHROPIC_API_KEY unset; grading will use the keyword fallback");
if (!env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID) console.warn("warning: NEXT_PUBLIC_ELEVENLABS_AGENT_ID unset; voice mode will not connect");

const secretsOnly = process.argv.includes("--secrets");
const fly = (...args: string[]) => {
  console.log(`> fly ${args.map((a) => (a.includes("=") ? a.split("=")[0] + "=…" : a)).join(" ")}`);
  execFileSync("fly", args, { stdio: "inherit", shell: process.platform === "win32" });
};

if (secrets.length) fly("secrets", "set", "-a", app, ...(secretsOnly ? [] : ["--stage"]), ...secrets);
if (secretsOnly) process.exit(0);

const baseUrl = `https://${app}.fly.dev`;
fly(
  "deploy",
  "-a",
  app,
  "--build-arg",
  `NEXT_PUBLIC_ELEVENLABS_AGENT_ID=${env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID ?? ""}`,
  "--build-arg",
  `NEXT_PUBLIC_BASE_URL=${baseUrl}`,
);
console.log(`\ndeployed: ${baseUrl}\nreset progress: fly ssh console -a ${app} -C "node scripts/demo-reset.ts --seed"`);
