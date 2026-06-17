# VDNX Wizard Sweep via Automate

Stress-tested by DeepSeek V4 Pro. Risks it flagged are addressed below; where I disagree with its rewrite (Cloudflare Browser Rendering, KV) I say so explicitly so you can override.

## Goal

A new Automate workflow signs into `vdnx.app` as `cmd-ai-test@vdnx.app`, probes every wizard's host route, records status + latency + a wizard-mounted check per route, then parks on a human-review summarizing failures. Sequential, HTTP-only, runs inside the Worker.

## What DeepSeek flagged + how this plan handles it

| # | Risk | Decision |
|---|---|---|
| 1 | **HTTP 200 only proves the SPA shell loaded** — not that the wizard actually mounted. | **ACCEPT (modified).** Don't use Cloudflare Browser Rendering (not wired into this project, adds a binding + cost, and you explicitly ruled out browser-based testing in Automate). Instead: after the fetch, scan the returned HTML for the wizard's known marker — the dialog component name as a string, or an `id`/`data-testid` we add to each WizardDialog in a follow-up. Mark `wizard_loaded: true/false/unknown` so a 200 with `unknown` is visibly weaker than a 200 with `true`. |
| 2 | **30 routes × 10s timeout = 300s, blows the 30s Worker wall clock.** | **ACCEPT.** Per-route timeout drops to 4s. Probe up to 6 routes concurrently via `Promise.allSettled`. Global abort at 25s — any unprobed routes are recorded as `status: "timeout_global"` and the run continues to human_review. If discovery returns >25 routes, the runner splits them across N sequential `vdnx_route_probe` nodes (each its own job_queue tick), so >25 routes still complete. |
| 3 | **Password in env risks lockout from repeated sign-ins.** | **ACCEPT (partial).** `VDNX_TEST_PASSWORD` stays as a server secret (project standard; no KV namespace is provisioned and adding one is out of scope). Cache the VDNX session in a new `vdnx_session_cache` row (single-row table keyed by email, server-only access) with `expires_at`. Sign-in only when cached session is missing or within 5 min of expiry. Refresh uses `supabase.auth.refreshSession` before falling back to password. |
| 4 | **GitHub filename heuristics will miss/mis-map routes.** | **ACCEPT.** Discovery parses VDNX's actual router config (TanStack Start route files under `src/routes/` or `src/pages/`) using `github.read_file` + `github.search_code`, not folder-name guessing. Anything unresolved goes into the returned list as `route: null` so we see the gap instead of probing a wrong URL. Static fallback manifest at `src/lib/vdnx-wizard-routes.ts` for hand-overrides. |
| 5 | **human_review node can't show dynamic results.** | **ACCEPT.** Probe node writes a summary string into the next node's config at runtime (workflow_runner already supports mutating downstream node config — see how `llm_step` passes its output). human_review's `payload` gets `{ failure_count, first_10_failures, run_id }` so `/approvals` shows it without DB lookup. |
| 6 | **30 concurrent requests look like a DoS to the VDNX CDN.** | **ACCEPT.** Concurrency capped at 6, 200ms gap between batches. Identifies itself via `User-Agent: VDNX-Automate-Probe/1.0` + `X-Probe-Run-Id: <run_id>` so VDNX logs can correlate. |
| 7 | **Hand-built `sb-<ref>-auth-token` cookie is fragile.** | **ACCEPT.** Don't construct the cookie. Sign in with the Supabase JS client (already a dep), keep the session object, send only `Authorization: Bearer <access_token>` on the probe fetches. VDNX SPA reads its session from the bearer on first paint; cookie isn't needed for SSR. |

## What I'm rejecting from DeepSeek's rewrite

- **Cloudflare Browser Rendering binding.** Adds infrastructure, costs, and contradicts your "Automate route-load smoke test" answer. We get ~80% of its value via the HTML-marker scan in Risk 1.
- **KV namespace for session cache.** This project uses Supabase, not Workers KV. A small table is the on-pattern choice here.

## Changes (final shape)

### 1. Secrets
- `VDNX_TEST_PASSWORD` (new, via `secrets--add_secret`).

### 2. Database
```sql
create table public.vdnx_session_cache (
  email text primary key,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);
revoke all on public.vdnx_session_cache from anon, authenticated;
grant all on public.vdnx_session_cache to service_role;
alter table public.vdnx_session_cache enable row level security; -- no policies = locked to service_role

create table public.vdnx_route_probe_results (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.workflow_runs(id) on delete cascade,
  route text not null,
  status text not null,                -- '200', '404', 'timeout', 'timeout_global', 'error', 'auth_redirect'
  http_status int,
  latency_ms int,
  wizard_loaded text not null default 'unknown', -- 'true' | 'false' | 'unknown'
  marker_checked text,                 -- which marker string we scanned for
  html_length int,
  error text,
  created_at timestamptz not null default now()
);
grant select, insert on public.vdnx_route_probe_results to authenticated;
grant all on public.vdnx_route_probe_results to service_role;
alter table public.vdnx_route_probe_results enable row level security;
create policy "owner reads own probe results"
  on public.vdnx_route_probe_results for select to authenticated
  using (exists (select 1 from public.workflow_runs r where r.id = run_id and r.user_id = auth.uid()));
```

### 3. Files to add
- `src/server/vdnx-session.server.ts` — `getVdnxSession({email,password})` reads cache, refreshes if near expiry, signs in only as last resort.
- `src/server/vdnx-route-probe.server.ts` — `runVdnxRouteProbe(node, run)` with 4s per-route timeout, concurrency 6, 25s global abort, marker scan, batch insert into `vdnx_route_probe_results`, summary written into the next node's config.
- `src/lib/vdnx-wizard-discovery.functions.ts` — owner-gated `discoverVdnxWizardRoutes` server fn; parses VDNX's `src/routes/` via `github.read_file`/`github.search_code`; returns `[{wizard, route, marker, source_file}]`.
- `src/lib/vdnx-wizard-routes.ts` — static override manifest (empty by default).
- `supabase/migrations/<ts>_vdnx_automate_sweep.sql` — both tables above.

### 4. Files to edit
- `src/lib/workflows.functions.ts` — add `vdnx_route_probe` to `NodeSchema` enum.
- `src/lib/workflow-templates.ts` — add node type + label + seed `"vdnx-wizard-sweep"` template.
- `src/server/workflow-runner.server.ts` — new `case "vdnx_route_probe":` dispatching to the helper above; on completion, mutate the next node's `config.payload` (failure summary) before enqueuing the next tick.
- `src/components/automate/NodeCard.tsx` — render route count + "Re-discover from repo" button (owner-only).
- `src/routes/_authenticated/automate.tsx` — toolbar "Seed: VDNX Wizard Sweep" button.

### 5. Workflow shape
```
trigger → vdnx_route_probe (×N if >25 routes) → human_review (auto-populated summary) → output
```

## Constraints honored

- No Playwright, no Browser Rendering binding, no KV — pure HTTP from the Worker.
- VDNX GitHub access stays read-only.
- Password stored as a server secret; never logged; cached session avoids login spam.
- Only allowed OpenRouter models touched (we don't change LLM config).

## Verification

1. `secrets--add_secret VDNX_TEST_PASSWORD` (you enter the value).
2. Click "Discover VDNX wizards" — confirm the returned routes look correct against the wizard list you pasted; gaps appear as `route: null`.
3. "Seed: VDNX Wizard Sweep" → Save → Run now.
4. Open the run: `vdnx_route_probe_results` should have one row per route. Inspect `wizard_loaded` per row — a route with `200`/`unknown` means the marker scan didn't find the wizard's identifier (TODO: tag that wizard's dialog).
5. `/approvals` shows summary card with failure count + first 10 failures.
6. Re-run within an hour — confirm `vdnx_session_cache` was hit (no fresh sign-in in logs).

## Out of scope

- Clicking wizards open / filling fields / submitting — needs Playwright via `scripts/probe-vdnx.ts` (separate task).
- Edge function verb sweep.
- Any write into VDNX.
- Cron-scheduled runs (use the existing `toggleWorkflowActive` if wanted later).
