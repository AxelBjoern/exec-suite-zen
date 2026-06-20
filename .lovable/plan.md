## Disconnect Browserless

Only `BROWSERLESS_URL` exists in this project's secrets — there is no `BROWSERLESS_TOKEN` set. I'll remove `BROWSERLESS_URL` and leave the VDNX browser sign-in code in place, so it stays dormant until a Browserless endpoint is reconnected later.

### Steps

1. Delete the `BROWSERLESS_URL` runtime secret via `secrets--delete_secret`.
2. No code changes. `signInVdnxViaBrowser()` in `src/server/vdnx-browser-signin.server.ts` already throws a clear "BROWSERLESS_URL not configured" error when the secret is absent, and the cached-session path in `getVdnxSession()` keeps working for already-cached sessions.

### Effect

- `@board` and other VDNX flows that require a *fresh* browser sign-in will fail fast with a "BROWSERLESS_URL not configured" error instead of the URL parsing crash.
- Cached VDNX sessions in `vdnx_session_cache` continue to work until they expire.
- No other chat/agent functionality is affected.

Confirm and I'll run the delete.