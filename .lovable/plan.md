# First VDNX Probe Run

Sandbox operator is provisioned. Plan is to execute one probe run end-to-end against `ahb+sandbox@vdnx.app`, confirm auth + report persistence work, then iterate.

## Step 1 — Preflight (sanity checks)
- Confirm `VDNX_AGENT_HMAC_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` are set (already in secrets list ✅).
- Confirm Chromium is installed for Playwright: `bunx playwright install chromium` (run once).
- Confirm `vdnx_probe_reports` table + `vdnx-probe-screenshots` bucket exist (already migrated ✅).

## Step 2 — Smoke probe (browser-only, minimal verbs)
Run the harness against one safe read-only route to validate the full flow:

```bash
bun scripts/probe-vdnx.ts \
  --agent exec-command/smoke-01 \
  --email ahb+sandbox@vdnx.app \
  --app-url https://app.vdnx.app \
  --routes /dashboard \
  --verbs ""
```

Expected:
1. `signInAsAgent` mints HS256 JWT → posts to `agent-signin` → exchanges `token_hash` via `verifyOtp` → returns real session.
2. Playwright launches Chromium, seeds session into `localStorage` under `sb-qumqodukmflucvivblqx-auth-token`, navigates `/dashboard`, screenshots.
3. Report row inserted into `vdnx_probe_reports`; screenshot uploaded to `vdnx-probe-screenshots/<agent_id>/<timestamp>.png`.

## Step 3 — Verify
- `select id, route, status, latency_ms, console_errors from vdnx_probe_reports order by created_at desc limit 1;`
- Inspect uploaded screenshot via signed URL.
- If `status != 'ok'`, read CLI stdout for the failure (signature rejected, MFA gate, RLS, etc.) and fix before widening scope.

## Step 4 — Widen
Once smoke passes, run a fuller sweep:

```bash
bun scripts/probe-vdnx.ts \
  --agent exec-command/governance-01 \
  --email ahb+sandbox@vdnx.app \
  --app-url https://app.vdnx.app \
  --routes /dashboard,/governance,/agents,/settings \
  --verbs command-catalog,list-agents
```

## Questions before I run

1. **App URL** — Is the VDNX frontend at `https://app.vdnx.app`, or a different host (e.g. `vdnx.lovable.app`)? The probe runner needs the exact origin where the Supabase session cookie/localStorage must be seeded.
2. **Routes** — Which routes should the first smoke probe hit? Default suggestion: just `/dashboard`. Confirm or override.
3. **Edge function verbs** — Any HTTP verbs (edge functions) you want exercised in the first run, or browser-only for now?

Once you answer 1–3, I'll switch to build mode and execute.
