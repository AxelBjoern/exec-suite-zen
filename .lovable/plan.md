## Goal
Elevate VDNX chat toward a Kimi/Claude-grade experience **without touching the existing swarm dispatch flow or the Quality Breakdown UI**. Everything new is additive and gated so today's behavior (binary Swarm toggle → `/api/public/swarm-stream` → MessageRow breakdown cards) keeps working byte-for-byte.

## Safety Contract (non-negotiable)
- Do **not** modify `src/routes/api/public/swarm-stream.ts`, `src/server/swarm-core.server.ts`, `src/serverfns/swarm.functions.ts`, or the breakdown rendering in `src/components/chat/MessageRow.tsx`.
- Do **not** change the `swarmActive` dispatch branch in `ChatWorkspace.tsx`. New features render alongside, never in place of, the current flow.
- No migrations that drop/rename existing columns. New columns are nullable and default-off.
- Every new capability sits behind a feature flag (per-user `user_settings.chat_features`) defaulting to OFF so nothing changes until the user opts in.
- Each slice ends with: swarm run + quality breakdown still render exactly as today (visual + DB check).

## Slices

### Slice A — Artifact Canvas (side panel)
- Detect code / html / markdown-doc blocks in assistant messages client-side only (no server change).
- Add a right-side `ArtifactPanel` that opens when the user clicks an artifact chip on a message. Chat column stays as-is; panel is collapsible.
- Swarm replies still render the full breakdown inline; artifact chip is additive.

### Slice B — Projects / Workspace Memory
- New table `chat_projects` (id, user_id, name, system_prompt, created_at) + nullable `project_id` on `ceo_conversations`.
- Sidebar gains a "Projects" section; assigning a conversation to a project prepends the project's system prompt to future turns.
- Swarm path reads the same project prompt via existing message-building helper — no swarm code change beyond reading one extra string.

### Slice C — Auto Mode (opt-in, non-swarm only)
- New `chat-router.functions.ts` picks a single model per turn using DeepSeek V4 Flash as router.
- Exposed as a third composer state: **Direct** (today) · **Auto** (new) · **Swarm** (today, untouched).
- Auto is disabled whenever Swarm is on. Swarm remains the source of truth for quality breakdown.

### Slice D — Multimodal routing polish
- When attachments include images/docs, Direct + Auto modes route to a vision-capable model from `base_models` (`supports_vision=true`).
- Swarm attachment handling is already wired (extracted_text → augmentedContent) and stays unchanged.

### Slice E — Token streaming for Direct mode
- Add SSE endpoint `/api/public/chat-stream` used **only** by Direct/Auto modes.
- Swarm continues to use `/api/public/swarm-stream`. Two endpoints, zero coupling.

## Out of scope
- Any rewrite of swarm orchestration, synthesis, or breakdown persistence.
- Any change to `swarm_runs` / `swarm_drafts` schema.
- Replacing the current composer's Swarm toggle behavior.

## Verification per slice
1. Send a Swarm message → confirm 6 drafts, PRIMARY/FALLBACK badges, confidence bars, rationale text still render.
2. Confirm `swarm_drafts.confidence` / `rationale` still populated on the new run.
3. Exercise the new slice's happy path + one error path.

## Technical notes
- Feature flags live in `user_settings.chat_features jsonb` (`{ artifacts, projects, auto, streaming }`), all default `false`.
- New SSE endpoint mirrors the auth pattern of `swarm-stream.ts` (bearer token, RLS-scoped supabase client) but shares no code paths with it.
- Router uses only approved models from memory (`deepseek/deepseek-v4-flash` for routing).