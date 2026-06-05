## Goal

Restore the working "centralized send" behavior: emails and LinkedIn posts go out via the **workspace** Gmail + LinkedIn connectors (the ones already linked via `LOVABLE_API_KEY` + `GMAIL_API_KEY` / `LINKEDIN_API_KEY`), exactly like before. No per-user OAuth required, no "Connect your Gmail/LinkedIn first" gate.

The per-user Connect flow in Settings can stay as an *optional* enhancement, but it must NOT block sending.

## Changes

### 1. `src/lib/outbound.functions.ts` — `performSend`

Revert the gating logic so it always falls back to the workspace connector when no per-user connection exists.

**Email path (`outbound_email`, `outbound_reminder`):**
- If the user has a personal Gmail connection → send as that user via `callAsAppUser`.
- Else → send via the workspace Gmail gateway (`GMAIL_GATEWAY` + `LOVABLE_API_KEY` + `GMAIL_API_KEY`) using the existing `sendOwnerDigestEmail`-style call. **Do NOT throw "Connect your Gmail first."**

**LinkedIn path (`outbound_linkedin`):**
- If the user has a personal LinkedIn connection → post as that user via `callAsAppUser`.
- Else → post via the workspace LinkedIn gateway using `LOVABLE_API_KEY` + `LINKEDIN_API_KEY` against `POST v2/ugcPosts` (the original centralized flow). **Do NOT throw "Connect your LinkedIn first."**

Keep the `status === "sent"` short-circuit added earlier (prevents "Already sent" crash on Retry).

### 2. `src/routes/_authenticated/settings/connections.tsx`

- Keep the LinkedIn + Gmail Connect buttons, but reframe copy: "Optional — connect your own account so posts/emails show as you instead of the shared workspace account." Default behavior without connecting = centralized send.
- No other logic changes.

### 3. Leave alone

- `src/lib/connections.functions.ts` — per-user OAuth helpers stay as-is for the optional flow.
- No DB migration, no secret changes (`GMAIL_API_KEY`, `LINKEDIN_API_KEY`, `LOVABLE_API_KEY` already present).
- No changes to retry/scheduler logic.

## Why this fixes the symptom

The previous send worked because it used the workspace LinkedIn/Gmail connector. Recent edits added a hard requirement that each user first complete per-user OAuth, and LinkedIn's app-user connector isn't registered on the gateway for this workspace (returns `connector_not_found`), so every send now throws. Reverting the gate restores centralized send while leaving the optional personal-connect path in place.
