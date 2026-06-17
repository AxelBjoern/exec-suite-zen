## Approach: Playwright-driven web sign-in

Drive the live VDNX web app with a real headless browser. Sign in through the UI like a human, capture the Supabase session out of `localStorage`, then reuse that session for the route probes. The legacy-vs-publishable API key question goes away — the browser uses whatever key VDNX's own bundle ships.

## Where Playwright runs

Playwright cannot run inside Cloudflare Workers (no Chromium, no native binaries). It will run in a **separate Node-based worker process** invoked from a server function, not inside the Worker SSR runtime itself.

Two viable hosts; I'll pick (a) by default and only fall back to (b) if you don't want to add the secret:

(a) **Browserless.io (or any remote Playwright CDP endpoint)** — connect via `chromium.connectOverCDP(BROWSERLESS_WS_URL)` from inside a server fn. No binaries shipped, works from the Worker, pay-per-use. Requires one new secret: `BROWSERLESS_WS_URL` (you create the account; I'll prompt for the URL via the secrets tool).

(b) **Self-hosted via a tiny Supabase Edge Function** that runs Deno + `npm:playwright-core` against a remote Chromium — same idea, just the launcher lives in an Edge Function instead of a server fn. More moving parts. Skip unless (a) is off the table.

## Step 1 — VDNX browser sign-in helper

New file: `src/server/vdnx-browser-signin.server.ts`

- Exports `signInVdnxViaBrowser({ email, password }): Promise<VdnxSession>`.
- Connects to the remote Chromium, opens `https://app.vdnx.com/auth` (env-overridable `VDNX_APP_URL`).
- Fills the email + password fields (role/name selectors, not brittle CSS), clicks Sign in, waits for the post-login redirect.
- Reads `localStorage.getItem("sb-qumqodukmflucvivblqx-auth-token")`, parses it, returns `{ access_token, refresh_token, expires_at, email }`.
- Hard timeout per step (10s nav, 5s field, 15s post-submit). On failure, captures a screenshot to the `vdnx-probe-screenshots` bucket so the run-history row links to visual evidence.
- Closes the context every time — no session reuse across runs, that's what the cache table is for.

Never logs the password or the captured tokens.

## Step 2 — Swap it into the existing session flow

Edit `src/server/vdnx-session.server.ts`:

- Keep the `vdnx_session_cache` table and the 5-minute refresh window — they're independent of sign-in mechanism.
- Replace the `signInWithPassword` cold-sign-in path with a call to `signInVdnxViaBrowser`.
- Replace the `refreshSession` path: if the cached session is within the refresh window, just re-run browser sign-in. Refresh requires the gotrue REST endpoint and a valid `apikey` header — exactly the thing we're stepping away from.
- Delete the legacy `VDNX_SUPABASE_ANON` import.

Edit `src/server/vdnx-probe.server.ts`:

- Stop calling the `agent-signin` edge function entirely. That path also needs `apikey`, and the browser-derived session is strictly more capable (it's an actual user session, not an OTP exchange).
- `signInAsAgent(targetEmail, agentId)` now delegates to `getVdnxSession({ email: targetEmail })` and wraps the access token into a `supabase-js` client built without an `apikey` (just `Authorization: Bearer …`) — RLS sees the real user.
- `VDNX_AGENT_HMAC_SECRET` becomes unused; leave the secret in place but stop referencing it. (Removing the secret would also work; safer to keep it for now in case we need agent-signin back.)

## Step 3 — Plumbing

- Add `playwright-core` to dependencies (lightweight; no browser download because we connect over CDP).
- New secret prompt: `BROWSERLESS_WS_URL` — I'll trigger the add-secret form after you approve this plan; the value looks like `wss://chrome.browserless.io?token=…`. If you'd rather use Playwright's own grid, the URL format is the same.
- Read both `BROWSERLESS_WS_URL` and `VDNX_TEST_PASSWORD` inside `.handler()` bodies only — never at module scope.

## Step 4 — Carry-over: full wizard route inventory

Once sign-in is reliable, expand `src/lib/vdnx-wizard-discovery.functions.ts` (`KNOWN_WIZARDS`) and `src/lib/vdnx-wizard-routes.ts` (overrides) from the current 9 entries to all ~28 wizards across `vdnx-gov`, `vdnx-sales` / `agreements`, the remaining `shares-wizards` (Dividend, NoCashIssue, CapitalReduction, AnnualReturn, OptionGrant, SafeInvestment, etc.), contracts, onboarding, and user management. Routes pulled from the VDNX repo's actual `<Route path>` registrations.

## What I won't touch

- No Chromium binaries, no `puppeteer`, no `child_process` — strictly `playwright-core` over CDP.
- No changes to the probe runner, schema, log writer, or UI.
- No mutating writes to the VDNX repo.
- No edits to the legacy `agent-signin` edge function on VDNX's side.

## Validation

After Steps 1–3: **Run now** on the VDNX Route Probe node:
- Run log: `vdnx browser sign-in ok in <N>ms` line; no "Legacy API keys" error.
- A screenshot URL appears in the log entry on failure (none on success).
- 9 routes probed (existing override list).

After Step 4: **Re-discover from repo** → ~28 routes → **Save** → **Run now**. Per-route results land in `vdnx_route_probe_results` with `wizard_loaded: true/false/unknown`.

## Fallback if you'd rather skip Browserless

If you don't want to provision a remote Chromium, the simplest alternative is the previous plan: scrape the live `sb_publishable_*` key from VDNX's own JS bundle and use REST sign-in. Slightly more fragile (depends on VDNX's bundle layout) but zero new infra and zero new secrets. Say the word and I'll pivot.
