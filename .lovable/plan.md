The retry failed because the LinkedIn Connect button is disabled (`Connect your LinkedIn in Settings first.` — confirmed in `approvals.notes` for the failed row). The send path requires a per-user LinkedIn connection, but the UI/server still has the "unsupported" gate.

### Changes

**`src/lib/connections.functions.ts`**
- Delete `PROVIDER_CONNECT_SUPPORT` and the `if (!support.supported) return { unsupported: true, ... }` branch in `startConnect`.
- Always run the OAuth start path; return `{ authorizationUrl }`.

**`src/routes/_authenticated/settings/connections.tsx`**
- Delete `PERSONAL_CONNECT_SUPPORT` and the early-return in `connect()`.
- In `connect()`, drop the `res.unsupported` check; use `res.authorizationUrl` directly.
- Re-enable the LinkedIn Connect button (label "Connect LinkedIn", `disabled={busy === provider}` only).
- Update LinkedIn empty-state copy to "Sign in with your LinkedIn account so posts go from you, not the shared workspace connection."
- Update page subtitle to "Connect Gmail and LinkedIn as your own accounts."

### Notes
- If the gateway 404s again (`connector_not_found`), that surfaces as a toast — fix is at the connector config level, not in app code.
- No DB or schema changes.