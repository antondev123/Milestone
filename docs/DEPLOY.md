# Deploy (Fly.io)

One always-on machine in Johannesburg with a 1 GB volume for `data/progress`, so the JSON progress
store works exactly as it does locally. Config: `fly.toml`, `Dockerfile`, `scripts/deploy-fly.ts`.

## First time (once per Fly account, ~5 min)

```bash
fly auth login
fly apps create commute-course        # if the name is taken, pick another and change `app` in fly.toml
fly volumes create progress --region jnb --size 1 -a commute-course --yes
npm run deploy:fly
```

`deploy:fly` reads `.env.local`, pushes the server-side keys as Fly secrets
(`ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `ANTHROPIC_ASK_MODEL`, `ELEVENLABS_API_KEY`,
`ELEVENLABS_VOICE_ID`, `ELEVENLABS_TTS_MODEL`,
`TOOL_WEBHOOK_SECRET`, `COURSE_ID`), and passes `NEXT_PUBLIC_ELEVENLABS_AGENT_ID` and
`NEXT_PUBLIC_BASE_URL=https://<app>.fly.dev` as Docker build args (Next inlines `NEXT_PUBLIC_*`
at build time, so they cannot be secrets). The build runs on Fly's remote builder; no local Docker needed.

## Every deploy after that

```bash
npm run deploy:fly
```

Changed only `.env.local`? `npm run deploy:fly -- --secrets` syncs secrets and restarts without a rebuild.
Changing a `NEXT_PUBLIC_*` value needs a full deploy.

## Rehearsal reset

Same as local, but inside the machine:

```bash
fly ssh console -a commute-course -C "node scripts/demo-reset.ts --seed"
```

Drop `--seed` for a blank slate. Progress survives deploys and restarts (it lives on the volume).

## Useful

```bash
fly logs -a commute-course          # server logs, includes the [grade] lines
fly status -a commute-course
fly scale memory 2048 -a commute-course   # if the machine OOMs
```

## Cost

Not a free tier, but a `shared-cpu-1x` 1 GB machine plus a 1 GB volume is a few dollars per month and
prorated by the hour; Fly waives invoices under $5/month at the time of writing (check Billing).
Stop paying with `fly apps destroy commute-course`.

## Gotchas

- The `[mounts]` block pins the app to one machine. Do not `fly scale count 2`; the store is per-machine.
- `auto_stop_machines = "off"` and `min_machines_running = 1` keep it warm. Cold starts would break the
  demo's "One sec." timing.
- Mic needs HTTPS; `force_https` handles it. ElevenLabs runs client-side over WebRTC, nothing to open.
- If the ElevenLabs agent is switched from client tools to webhooks, the tool URL is
  `https://<app>.fly.dev/api/tools/<name>` with the `TOOL_WEBHOOK_SECRET` header (see docs/ELEVENLABS.md).
