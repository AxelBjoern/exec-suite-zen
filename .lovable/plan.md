# VDNX Probe — Current Status: BLOCKED on `agent-signin` deployment

## What happened

Smoke probe was executed against `ahb+sandbox@vdnx.app` on `https://vdnx.lovable.app`.
Harness works correctly (JWT minting, HMAC signing, Playwright launch), but VDNX's `agent-signin` edge function is not deployed — returns `404 NOT_FOUND`.

## Blocker

VDNX team needs to deploy `/functions/v1/agent-signin`. We have read-only GitHub access and cannot deploy it ourselves.

## Handoff message for VDNX team

Paste this into your VDNX channel (Slack / Linear / Lovable chat):

> **Subject: Deploy `agent-signin` edge function (unblocks VDNX Executive Command probe harness)**
>
> Our probe harness (`exec-suite-zen`) is wired and ready, but `POST https://qumqodukmflucvivblqx.supabase.co/functions/v1/agent-signin` returns `404 NOT_FOUND`. The function needs to be deployed on the VDNX Supabase project.
>
> **Contract the harness expects:**
>
> - **Path:** `/agent-signin` (public, no JWT verification — auth is the HS256 signature on the body).
> - **Method:** `POST`, `Content-Type: application/json`.
> - **Request body:** `{ "token": "<HS256-JWT>" }` where the JWT is signed with `VDNX_AGENT_HMAC_SECRET` (shared secret already exchanged) and carries the claims:
>   - `iss: "exec-command"`
>   - `aud: "vdnx-agent-signin"`
>   - `sub: <agent_id>` (e.g. `exec-command/smoke-01`)
>   - `email: <sandbox-operator-email>` (must resolve to a user with `app_metadata.env = 'sandbox'` AND a company row where `is_sandbox = true`)
>   - `nonce: <uuid>` (single-use; reject on replay)
>   - `iat`, `exp` (max 2-minute window)
>
> **Verification the function must do (refuse otherwise):**
> 1. Verify HS256 signature with `VDNX_AGENT_HMAC_SECRET`.
> 2. Check `iss`, `aud`, `exp`, `iat` skew (±30s).
> 3. Reject replay (store `nonce` for ≥ exp window; reject if seen).
> 4. Look up user by `email` via `auth.admin.getUserByEmail` (service role). Refuse if:
>    - user not found
>    - `app_metadata.env !== 'sandbox'`
>    - the user's `vdnx_company.is_sandbox !== true`
> 5. Pre-open the MFA session so `ProtectedRoute` lets the agent through (same mechanism as BETA-001 Phase 1 preflight).
>
> **Response on success:** `200 application/json`
> ```json
> { "token_hash": "<one-time-magic-link-token-hash>" }
> ```
> The harness then exchanges it via `supabase.auth.verifyOtp({ type: 'magiclink', token_hash })` to mint a real session and seeds it into `localStorage` under `sb-qumqodukmflucvivblqx-auth-token`.
>
> **Response on refusal:** non-2xx with `{ "error": "<reason>" }`. The harness does not retry — refusals are intentional.
>
> **Audit:** log every call (accepted + refused) with `agent_id`, `email`, `nonce`, `ip`, `status`, reason. Write to a VDNX-side audit table; do not write into our DB.
>
> **Secret needed in VDNX env:** `VDNX_AGENT_HMAC_SECRET` (same value already set on our side).
>
> Once deployed, ping back and we'll re-run the smoke probe against `ahb+sandbox@vdnx.app` on `https://vdnx.lovable.app/` and share the report.

## Next step (ours)

Once VDNX confirms deployment, re-run:

```bash
bun scripts/probe-vdnx.ts \
  --agent exec-command/smoke-01 \
  --email ahb+sandbox@vdnx.app \
  --app-url https://vdnx.lovable.app \
  --routes /,/dashboard \
  --verbs ""
```

If smoke passes, widen to full wizard inventory + edge verbs.

