# Probing VDNX from VDNX Executive Command

Sandbox-only. No passkey. MFA pre-bypassed for 60 minutes per sign-in.

## Endpoint

- POST `https://qumqodukmflucvivblqx.supabase.co/functions/v1/agent-signin`
- Supabase URL: `https://qumqodukmflucvivblqx.supabase.co`
- Anon key (public): `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF1bXFvZHVrbWZsdWN2aXZibHF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU5Nzg0OTYsImV4cCI6MjA2MTU1NDQ5Nn0.-qusc7ibJfkwKIdefcEsBWQ7gpE3z6vllUlUlqMCKvQ`
- App entry: `https://vdnx.app`

## Hard rules

- Sandbox accounts only (`app_metadata.env='sandbox'` AND `companies.is_sandbox=true`). Prod is refused — do not retry.
- JWT max age 5 min. Fresh `nonce` (UUIDv4) every call. Replays rejected.
- Every attempt audited (`agent_login_audit.agent_id`). Use stable descriptive ids per agent (e.g. `exec-command/governance-probe`).
- MFA bypass = 60 min per sign-in. Re-sign in; do not try to extend.

## JWT shape

```json
{ "sub": "<sandbox-email>", "agent_id": "<id>", "iat": <s>, "exp": <iat+120>, "nonce": "<uuid>" }
```
Header `{"alg":"HS256","typ":"JWT"}`. Secret: `VDNX_AGENT_HMAC_SECRET` (runtime env).

## Code

Implementation lives in:
- `src/server/vdnx-probe.server.ts` — `signInAsAgent(targetEmail, agentId)`
- `src/server/vdnx-probe-runner.server.ts` — Playwright probe runner
- `scripts/probe-vdnx.ts` — CLI entry
- `docs/probe-vdnx-agent-prompt.md` — system prompt for executive agents

## Runtime constraint

Playwright requires a Node host with Chromium installed. Cloudflare Worker SSR
**cannot** run the harness. Invoke only via:
- the CLI: `bun scripts/probe-vdnx.ts --agent <id> --email <sandbox@…> --routes /dashboard,/governance`
- or a separate Node worker / cron host
Never wire the runner into a `createServerFn` callable from the web app.

## Reporting

Reports persist in `public.vdnx_probe_reports` (owner-only). Screenshots upload
to private `vdnx-probe-screenshots` storage bucket. Never write back into the
VDNX database.
