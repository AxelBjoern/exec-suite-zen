# VDNX Probe Harness

Add a sandbox-only probing capability to this project so executive agents can sign into VDNX (no passkey, MFA pre-bypassed) and exercise routes/verbs, then persist structured reports here.

## 1. Secret
- Add runtime secret `VDNX_AGENT_HMAC_SECRET` (64-char HMAC string, supplied by VDNX edge function config).
- Reuses existing `VITE_SUPABASE_PUBLISHABLE_KEY` pattern for VDNX anon? No — VDNX is a separate Supabase project. Hardcode the VDNX Supabase URL + anon key as constants in the probe module (they are public anon, doc says so).

## 2. Server-only signin helper
`src/server/vdnx-probe.server.ts`
- `signAgentJwt(targetEmail, agentId)`: HS256 JWT, 2 min exp, fresh `randomUUID()` nonce, sub = email, payload `{ agent_id, nonce }`. Uses `jose`.
- `signInAsAgent(targetEmail, agentId)`: POSTs JWT to `https://qumqodukmflucvivblqx.supabase.co/functions/v1/agent-signin`, calls `verifyOtp({ type: 'magiclink', token_hash })` on a fresh `createClient(VDNX_URL, VDNX_ANON)`, returns `{ supabase, session }`.
- Throws clear errors on non-2xx (do not retry — endpoint refuses prod users and replays).
- Add `jose` dependency.

## 3. Probe harness (Playwright)
`src/server/vdnx-probe-runner.server.ts`
- Input: `{ agentId, targetEmail, routes: string[], verbs?: {path,body}[] }`.
- Flow:
  1. `signInAsAgent` to get session tokens.
  2. Launch Chromium headless (use existing browser tooling — Playwright via `playwright` npm; add dep).
  3. For each route: navigate to `https://vdnx.app`, `page.evaluate` to write `sb-qumqodukmflucvivblqx-auth-token` localStorage with `{access_token, refresh_token}`, navigate to route, collect `console` + `requestfailed` events, screenshot to `/tmp`, upload screenshot to existing `chat-uploads` bucket (or new `vdnx-probe-screenshots` bucket — see Q below).
  4. For each verb: HTTP POST through authed supabase client (no browser).
- Returns structured `ProbeReport[]`: `{agent_id, target_email, route, verb_or_action, status, latency_ms, console_errors, network_failures, screenshot_url}`.

> Note: Playwright requires a Node runtime with browsers installed. Cloudflare Worker SSR cannot run Playwright. This harness must run only from a Node context — exec script, cron worker on a Node host, or local dev. Document that constraint; do NOT expose it as a `createServerFn` callable from the Worker SSR.

## 4. Report storage
New table `vdnx_probe_reports` (migration):
- `id uuid pk default gen_random_uuid()`
- `agent_id text not null`
- `target_email text not null`
- `route text`, `verb text`, `status text`, `latency_ms int`
- `console_errors jsonb`, `network_failures jsonb`, `screenshot_url text`
- `created_at timestamptz default now()`
- `created_by uuid references auth.users(id)`
- GRANT to authenticated + service_role. RLS: owner-only read via `has_role(auth.uid(),'owner')`.
- New storage bucket `vdnx-probe-screenshots` (private), RLS allow owner read.

## 5. CLI entry
`scripts/probe-vdnx.ts` — Node script reading args `--agent <id> --email <sandbox@…> --routes /dashboard,/governance`, calling the harness, printing JSON, inserting into `vdnx_probe_reports`. Run via `bun scripts/probe-vdnx.ts ...`.

## 6. Agent system prompt
`docs/probe-vdnx-agent-prompt.md` — role, allowed verbs, hard refusal rules (no prod emails, no replay JWTs, no writeback to VDNX DB, screenshot redaction, max 60-min session, stop on first auth refusal).

## 7. Reference doc
Also save the original instructions as `docs/probe-vdnx.md` for human reference.

## Files
- new `docs/probe-vdnx.md`
- new `docs/probe-vdnx-agent-prompt.md`
- new `src/server/vdnx-probe.server.ts`
- new `src/server/vdnx-probe-runner.server.ts`
- new `scripts/probe-vdnx.ts`
- new migration: `vdnx_probe_reports` table + grants + RLS + storage bucket
- add deps: `jose`, `playwright`
- add secret: `VDNX_AGENT_HMAC_SECRET`

## Open question
Playwright cannot run inside the Cloudflare Worker SSR runtime that this app deploys to. Confirm you'll run the harness from a Node context (CLI / separate worker), not from a `createServerFn` invoked by the web app.
