# Self-hosted Playwright worker

This is the contract for the small Node service that runs Playwright recipes
on behalf of the app. Cloudflare Workers can't run Playwright/Chromium, so
this lives outside the main app (Fly.io / Render / Railway, ~$5/mo).

## Endpoint

`POST /run`

Headers:

- `Content-Type: application/json`
- `x-pw-signature: <hex(HMAC_SHA256(PLAYWRIGHT_WORKER_SECRET, raw_body))>`

Body:

```json
{
  "script": "vdnx.signin",
  "inputs": { "email": "..." },
  "session": null,
  "timeout_ms": 60000
}
```

Response (HTTP 200, even on recipe failure — use `ok`):

```json
{
  "ok": true,
  "output": { "...": "recipe-specific" },
  "logs": ["..."],
  "screenshots": [
    { "name": "after_login", "storage_path": "vdnx-probe-screenshots/runs/<id>/01.png", "url": null }
  ]
}
```

Reject any request without a valid HMAC signature (timing-safe compare).

## Recipe slugs (starter set)

| slug | purpose |
| --- | --- |
| `vdnx.signin` | Sign into vdnx.app and return a reusable session blob |
| `vdnx.route_probe_browser` | SPA-aware version of the HTTP probe (waits for render, checks marker text in DOM) |
| `vdnx.calendar.create_event` | Create an event in vdnx.app's built-in calendar |
| `vdnx.calendar.list_events` | List upcoming events from vdnx.app calendar |
| `vdnx.wizard.fill` | Generic: open wizard URL, fill fields by aria-label, submit |

## Storage

Screenshots upload directly to the existing `vdnx-probe-screenshots`
Supabase bucket using the service-role key. `storage_path` is what the
client uses to generate a signed URL.

## Env this app needs

- `PLAYWRIGHT_WORKER_URL` (e.g. `https://vdnx-pw.fly.dev`)
- `PLAYWRIGHT_WORKER_SECRET` (matches the worker's HMAC secret)

Add both via the secret tools once the worker is deployed.
