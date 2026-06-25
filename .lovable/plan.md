
# Make Cowork + Automate actually do work — v2 (decisions locked)

Decisions from you:
1. **Playwright path = (a) self-hosted worker.**
2. **Calendar = VDNX's built-in calendar** (no Google Calendar tool; we drive vdnx.app's calendar through the Playwright worker).
3. **Cowork "Apply" can push to GitHub** — but only behind an explicit confirm dialog with a warning, and only when the user opts in per-apply.

## Where each surface stands today

**Cowork** (`/cowork`) — LLM chat (8 allowed models via OpenRouter), preview pane, save/apply snapshot, file ingest as inline markdown. Gaps: no tools, no streaming, "Apply" only writes `applied_content`, no vision/PDF.

**Automate** (`/automate`) — builder, save/run, node types `trigger | llm_step | human_review | action | output | vdnx_route_probe`, `job_queue` ticked 1/min. Gaps: `trigger.cron` never fires automatically, `action` is audit-only, no browser node, no data passing between nodes.

## Slice 1 — Plug-ins / add-ons (in-Worker)

Shared typed tool registry used by **both** Cowork chat and Automate's new `tool_call` node. Each tool: `{ slug, description, schema (Zod), run(ctx, input) }`, server-only.

Initial tools (all Worker-safe):
- `web.search` — Firecrawl
- `web.fetch` — Firecrawl markdown
- `email.send` — Google Mail connector
- `image.generate` — Replicate
- `db.query` — read-only Supabase, RLS as caller
- `vdnx.http_probe` — wraps existing route probe
- `linkedin.post` — LinkedIn connector

Cowork wiring:
- New server **route** `src/routes/api/cowork-chat.ts` (server fn can't stream a `Response`). Uses AI SDK `streamText` + OpenRouter provider, the tool registry as `tools`, `stopWhen: stepCountIs(50)`, `toUIMessageStreamResponse()`.
- Client switches to `useChat` + `DefaultChatTransport` so tokens stream and tool activity renders inline.
- `email.send` and `linkedin.post` get `needsApproval` so they always route through `approvals` first.

Automate wiring:
- New node type `tool_call` with `config: { tool: <slug>, input: <json|template> }`.
- Output captured to `workflow_runs.log[].data.output` and to a new column-less convention: `{{steps.<node_id>.output.<path>}}` Mustache interpolation, evaluated before each node runs. Applies to `llm_step.prompt`, `tool_call.input`, `action.config`.
- Existing `action` node becomes a thin alias: `action.kind` → tool slug, so the stub stops being a stub.

## Slice 2 — Real scheduling for triggers

- Add `last_fired_at timestamptz` to `workflows` (migration + GRANTs unchanged: table already exists).
- New cron route `src/routes/api/public/cron/workflow-trigger-tick.ts`. Auth via `apikey` header (Supabase anon). Scans `workflows where active = true`, evaluates first-node `config.cron` with `croner` (pure-JS, Worker-safe), enqueues `workflow_step { run_id, node_index: 0 }` and creates the `workflow_runs` row when due. Updates `last_fired_at` to prevent double-fire in the same minute.
- `pg_cron` SQL run via supabase insert (not migration) at 1/min, body `{}`.

## Slice 3 — Playwright agent for legacy/SPA pages (self-hosted) — decision 1a

Cloudflare Workers can't run Playwright, so we run it elsewhere and call in.

**External service** (new tiny repo, deploy to Fly.io or Render, ~$5/mo):
- Node + Playwright + Chromium, single endpoint `POST /run` `{ script_slug, inputs, session? }` → `{ ok, output, logs, screenshots[] }`.
- HMAC-signed: header `x-pw-signature = hmac_sha256(PLAYWRIGHT_WORKER_SECRET, body)`. Reject anything else.
- Screenshots uploaded directly to the existing `vdnx-probe-screenshots` bucket via service-role.
- Recipes are TS files in the worker repo, easy to extend per legacy page. Starter set:
  - `vdnx.signin` — replaces deleted Browserless flow; produces a session usable by other recipes.
  - `vdnx.route_probe_browser` — like the HTTP probe but waits for SPA render and checks marker text in the rendered DOM.
  - `vdnx.calendar.create_event` — **decision 2**, drives vdnx.app's built-in calendar UI to add events.
  - `vdnx.calendar.list_events` — reads upcoming events back.
  - `vdnx.wizard.fill` — generic "open wizard, fill fields by aria-label, submit" recipe.

**In this repo:**
- `src/server/playwright-client.server.ts` — signed-fetch client, returns typed `{output, logs, screenshots[]}`.
- Replaces `src/server/vdnx-browser-signin.server.ts` (Browserless) and the Playwright import inside `src/server/vdnx-probe-runner.server.ts` (which can't run in the Worker anyway).
- New Automate node type `playwright_step` with `config: { script: <slug>, inputs: <json|template> }`. Inherits the `{{steps.…}}` interpolation from Slice 1.
- New tool `browser.run` in the registry — same shape — so Cowork chat can also drive the legacy browser from a prompt (e.g. "schedule next Tuesday 10am with Sam in my VDNX calendar"). Tagged `needsApproval` because it's effectful.
- New secret: `PLAYWRIGHT_WORKER_URL`, `PLAYWRIGHT_WORKER_SECRET` (added via `add_secret` when slice is approved).

## Slice 4 — Cowork "Apply → GitHub" with warning — decision 3

- "Apply" gets a second button **"Apply & push to GitHub"**.
- Opens a confirm dialog:
  > ⚠️ This will create a real commit on `<repo>@<branch>` using your stored `GITHUB_TOKEN`. The diff below is what will be written. Continue?
- Shows the diff preview (current `applied_content` → new `preview_content`) and lets the user pick branch + commit message.
- Server fn `applyToGithub` validates the user owns the repo mapping, then uses the GitHub Contents API to create-or-update the file on a branch and open a PR (never direct-to-main). Memory rule "VDNX GitHub access is READ-ONLY" stays — this push targets the user's *own* repos, configured per Cowork session in a new `cowork_sessions.github_target` column (`{ repo, branch, path }`), never the VDNX repo.
- Without configuring a target, the button is disabled and the dialog explains how to set one.

## Out of scope (call out so we agree)
- Multi-user Cowork collab cursors.
- Direct-to-main GitHub pushes (always PR).
- Replacing the existing HTTP `vdnx_route_probe` — both stay; pick browser version when SPA-rendered content matters.

## Technical notes
- Tool/LLM schemas stay small (Zod, no long enums) per AI-SDK guidance.
- All new tools default to `needsApproval` when they send/post/write externally.
- New cron uses `apikey` header (anon), matching existing cron tick routes.
- All new server modules live in `src/server/*.server.ts` or `src/lib/*.functions.ts` — handlers read `process.env` inside the handler body, never at module scope.
- Model list unchanged (the 8 allowed). No Lovable AI Gateway.

## Build order
1. Slice 1 (tools + streaming + `tool_call` node + interpolation).
2. Slice 2 (trigger tick + `croner`).
3. Slice 3 (Playwright worker repo, then client, node, and `browser.run` tool).
4. Slice 4 (GitHub apply with warning dialog).

Ready to implement Slice 1 first on approval — Slices 2-4 follow without re-asking unless I hit a new decision point.
