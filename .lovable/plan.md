## Goal

Use the workspace-level Lovable connectors (the ones you set up once with username/password in Lovable Connectors) for Gmail and LinkedIn. No popups, no per-user OAuth, no client IDs. Same model as before.

## What gets removed

- `src/integrations/lovable/appUserConnector.ts` (server) — deleted
- `src/integrations/lovable/appUserConnectorClient.ts` (popup helper) — deleted
- `user_connections` table reads/writes in `saveConnection`, `listMyConnections`, `disconnectProvider`, `startConnect`, `getConnectionCapabilities` — deleted
- Personal-vs-shared capability logic, popup button, "Connect Gmail / Connect LinkedIn" UI — deleted
- `GOOGLE_APP_USER_CONNECTOR_CLIENT_ID` / `LINKEDIN_APP_USER_CONNECTOR_CLIENT_ID` references — gone
- Hybrid "if user connection exists, use it, else workspace fallback" branches in `outbound.functions.ts` — collapsed to workspace-only

## What gets rebuilt

### 1. `src/lib/outbound.functions.ts`
- `sendGmailAsUser` / `postLinkedInAsUser` removed.
- `performSend` always uses the workspace connector path:
  - Email → existing workspace Gmail helper (`GOOGLE_MAIL_API_KEY` via gateway)
  - LinkedIn → existing `postLinkedInAsWorkspace` (`LINKEDIN_API_KEY` via gateway)
- Errors clearly say "Workspace Gmail/LinkedIn connector not connected — connect it in Lovable Connectors".

### 2. `src/lib/connections.functions.ts`
Replaced with a thin status-only module:
- `getConnectorStatus` server fn returns `{ gmail: boolean, linkedin: boolean }` based on whether `GOOGLE_MAIL_API_KEY` and `LINKEDIN_API_KEY` env vars exist.
- `getMySettings` / `updateMySettings` (auto-send toggles + design rules) preserved — those are user-level prefs, not credentials.

### 3. `src/routes/_authenticated/settings/connections.tsx`
Simplified page:
- Shows two cards: Gmail and LinkedIn.
- Each card shows green "Connected (workspace)" or grey "Not connected".
- Single CTA per card: "Manage in Lovable Connectors" (opens the connectors panel) — no popup, no OAuth.
- Keeps the auto-send toggles + design rules section as-is.

### 4. Tool calls required
- Call `standard_connectors--connect` with `connector_id: "google_mail"` and again with `connector_id: "linkedin"` so the connectors picker is what handles credentials. Lovable's connector picker is where you sign in / paste credentials — that's the "username + password" step you want.

## Files touched

```text
deleted:
  src/integrations/lovable/appUserConnector.ts
  src/integrations/lovable/appUserConnectorClient.ts
edited:
  src/lib/connections.functions.ts        (replace personal-OAuth surface with workspace-status surface)
  src/lib/outbound.functions.ts           (collapse to workspace-only send/post)
  src/routes/_authenticated/settings/connections.tsx  (status page, no popups)
unchanged:
  src/server/* (LLM, settings, design rules)
  user_settings table (auto-send, design rules)
```

## Confirmation before I implement

This intentionally drops the "each app user signs in with their own Gmail/LinkedIn" feature. All sends go from your workspace's connected accounts. That matches what you asked for ("like before where I added username and password"). Reply "go" and I'll execute the plan.
