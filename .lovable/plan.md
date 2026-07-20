## Goal
Make `/chat` feel like Kimi or Claude — one clean conversation surface with fast streaming, artifacts, file understanding, tool use, memory, and long-context sessions — while keeping our unique edge: user-owned model library + Swarm/per-agent models + fallback/audit. **Every slice ships behind a flag and preserves 100% of current behavior.**

## Safety contract (non-negotiable — applies to every slice)
1. **No regressions.** Existing routes, server fns, tables, columns, RLS, GRANTs, and SSE events stay intact. Additive only — no renames, no deletes, no signature changes to `chatCompletion`, `runSwarm`, `draftOne`, `streamSwarm`, `sendCeoChat`, or any exported server fn.
2. **Feature flags.** Every new capability is gated:
   - `user_settings.chat_mode` (`auto` | `single` | `swarm`, default `single` — matches today).
   - `user_settings.enable_artifacts_panel`, `enable_projects`, `enable_tool_steps`, `enable_vision`, `enable_compaction` (all default `false`).
   - Flags OFF ⇒ code path is byte-identical to today.
3. **Additive schema only.** New columns are `NULL`/default; new tables are new. No `DROP`, no `ALTER … NOT NULL` on existing columns, no policy changes to existing tables beyond adding policies for new columns if needed. Every new public table ships with GRANTs + RLS in the same migration.
4. **Model allowlist untouched.** No new hardcoded models. All routing picks from the user's `base_models` + `chat_model_allowlist` via existing helpers. Vision/tool capability read from new nullable columns on `base_models`, defaulted so current models keep working.
5. **Swarm untouched.** No edits to `swarm-core.server.ts`, `swarm.functions.ts`, `swarm-stream.ts` semantics — only new call sites. Existing fallback/timeout/audit behavior preserved bit-for-bit.
6. **Streaming is additive.** New `/api/public/chat-stream.ts` runs in parallel to the current non-streaming `sendCeoChat`. UI falls back to the current path if the stream errors or the flag is off. Final persisted message shape (`ceo_chat_messages` row) is identical.
7. **Attachments pipeline unchanged.** Reuse `ceo_chat_attachments.extracted_text`. No changes to upload endpoints or extraction.
8. **No new external deps** unless explicitly approved. No new npm packages, no Lovable AI Gateway, no `LOVABLE_API_KEY` — all LLM calls stay on OpenRouter via `src/server/llm.server.ts` (per core memory).
9. **RLS parity.** Every new table uses `auth.uid() = user_id` policies matching `ceo_conversations`. No `anon` grants.
10. **Kill switch.** A single `user_settings.chat_experimental = false` disables every new slice at once; server fns check it first and fall through to legacy paths.
11. **Test before ship each slice.** Verify: (a) single-mode reply still works with all flags off, (b) swarm still works with all flags off, (c) existing sessions in DB still load, (d) `swarm-audit`, `swarm-bench`, Cowork, Automate unaffected.
12. **Reversible migrations.** Every migration is drop-safe (new tables + new nullable columns only) so a revert = drop new tables + drop new columns; no data loss on existing tables.

## What we build on (already exists)
- OpenRouter gateway in `src/server/llm.server.ts` + user-scoped model library (`base_models`, `chat_model_allowlist`).
- Multi-session chat at `/chat/$sessionId`, `ChatWorkspace`, `ChatComposer`, `ConversationSidebar`.
- Swarm: `swarm.functions.ts`, `swarm-core.server.ts`, SSE `swarm-stream.ts`, per-agent models, fallback, audit, benchmark.
- Attachments: `ceo_chat_attachments` with `extracted_text` (docx/pptx/pdf/OCR).
- Tools infra: `agent-tools.server.ts`, DSML tool-call parsing in `ceo-chat.functions.ts`.
- Preview pane + Cowork (artifact rendering for md/tsx/json/mermaid/html).

## Gap vs Kimi/Claude
1. Single vs Swarm split-brain — no unified "Auto".
2. No token streaming in single mode.
3. No artifact side-panel in `/chat`.
4. No project-level memory (Claude Projects).
5. Vision-capable models never receive `image_url` parts.
6. Tool-use loop invisible to the user.
7. No long-context compaction.

## Design (each slice = flag + additive change)

### Slice 1 — Token streaming for single mode (flag: default ON only for opt-in users)
- New `src/routes/api/public/chat-stream.ts` mirroring `swarm-stream.ts`, wrapping `chatCompletion` with `stream:true`.
- `ChatWorkspace` tries the stream; on any error, falls back to existing `sendCeoChat` mutation. Final row persisted the same way.
- Adds nullable `ceo_chat_messages.model_used`, `latency_ms`, `tokens_in`, `tokens_out` for the model chip.

### Slice 2 — Auto router (flag: `chat_mode = auto`)
- New `src/server/chat-router.server.ts` + `src/serverfns/chat-router.functions.ts`. Cheap classifier (`deepseek-v4-flash`) returns `{mode, model?, reason}`.
- Composer gets a mode toggle: **Single (current)** / **Swarm (current)** / **Auto (new)**. Default = Single. No behavior change unless user picks Auto.
- Small chip on the reply: "Answered by Grok 4.3 · escalated to swarm".

### Slice 3 — Artifact side-panel (flag: `enable_artifacts_panel`)
- New `chat_artifacts (id, user_id, message_id, kind, title, content, created_at)` + GRANTs + RLS.
- Reuse `PreviewPane`. Collapsible right pane in `ChatWorkspace`, opens on fenced blocks ≥ N lines. Inline rendering unchanged when flag off.
- "Open in Cowork" button bridges surfaces.

### Slice 4 — Projects (flag: `enable_projects`)
- New `chat_projects (id, user_id, name, system_prompt, knowledge jsonb)` + GRANTs + RLS.
- Add nullable `ceo_conversations.project_id`. Existing sessions unaffected (NULL = no project).
- Sidebar gains a "Projects" section above sessions when flag on.

### Slice 5 — Visible tool-use loop (flag: `enable_tool_steps`)
- Add nullable `ceo_chat_messages.steps jsonb`. Existing rows read as no steps.
- New `StepsAccordion.tsx` shown when `steps` present.
- Server: extend DSML tool loop to record steps; only active when flag on.

### Slice 6 — Vision routing (flag: `enable_vision`)
- Add `base_models.supports_vision bool default false`. Existing rows = text-only (current behavior).
- Toggle in `agents-models.tsx`.
- `chatCompletion` builder switched to accept multimodal `content` array; when flag off OR model lacks `supports_vision`, path is identical to today (text-only string).

### Slice 7 — Long-context compaction (flag: `enable_compaction`)
- Add nullable `ceo_chat_messages.compacted bool default false`, `ceo_conversations.summary_message_id uuid`.
- Background summarize oldest half past ~120k chars into a `system` row; originals marked compacted. Original messages retained (never deleted).

### Slice 8 — UX polish (each individually flagged)
- Cmd+K search, regenerate, edit-last, branch-from-here, model chip on assistant messages.

## Data changes (single reversible migration per slice)
Additive only. Summary:
- New tables: `chat_artifacts`, `chat_projects` (with full GRANTs + RLS).
- New nullable columns: `base_models.supports_vision`; `ceo_conversations.project_id`, `summary_message_id`; `ceo_chat_messages.steps`, `compacted`, `model_used`, `latency_ms`, `tokens_in`, `tokens_out`.
- New `user_settings` flags: `chat_mode`, `enable_artifacts_panel`, `enable_projects`, `enable_tool_steps`, `enable_vision`, `enable_compaction`, `chat_experimental`.

## Rollout order
1. Streaming + model chip (biggest perceived win, lowest risk).
2. Auto router.
3. Artifacts panel.
4. Projects.
5. Tool-use steps.
6. Vision.
7. Compaction.
8. Search/regenerate/branch.

Each slice: migrate → ship code behind flag OFF → verify legacy paths untouched → enable for owner account → verify → expand.

## Confirm before build
- Approve the safety contract above?
- Start with Slice 1 (streaming) only, or queue Slices 1–3?
