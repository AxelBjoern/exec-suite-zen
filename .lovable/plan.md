## Change the VDNX sign-in target URL

Production (`www.vdnx.app`) currently errors on login. The preview deployment at `https://preview--natax-sales-nexus.lovable.app/auth` works. Point the browser-driven sign-in there instead.

## Edits

**`src/server/vdnx-browser-signin.server.ts`**
- Change `DEFAULT_APP_URL` from `https://app.vdnx.com` to `https://preview--natax-sales-nexus.lovable.app`.
- Keep the `VDNX_APP_URL` env override so we can flip back to prod later without a code change once VDNX prod login is fixed.
- `authUrl` stays computed as `${appUrl}/auth` — resolves to `https://preview--natax-sales-nexus.lovable.app/auth`.

**`.lovable/plan.md`**
- Update the one reference to `https://app.vdnx.com/auth` so the doc matches reality.

## What I won't touch

- No changes to `VDNX_SUPABASE_URL` / `VDNX_STORAGE_KEY` in `vdnx-probe.server.ts` — the preview app writes to the same Supabase project (`qumqodukmflucvivblqx`) and the same localStorage key, so the captured session is still valid for VDNX RLS.
- No changes to the cache table, session helper, probe runner, or Browserless wiring.
- No removal of the override — `VDNX_APP_URL` remains the escape hatch.

## Validation

Trigger the VDNX Route Probe node. Expect:
- No "Legacy API keys are disabled" error.
- Run log shows `vdnx browser sign-in ok` against the preview host.
- Cached session row in `vdnx_session_cache` updated for `cmd-ai-test@vdnx.app`.

If the preview app's `/auth` form uses different selectors than prod (different placeholder/label), I'll adjust the selectors in the Browserless script in the same edit after a quick screenshot check.
