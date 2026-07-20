# Swarm Agents + Model Library Cleanup + Multi-Session Chat

Three related upgrades to the chat surface at `/chat` and `/cowork`.

## Part 1 — Swarm Agents (multi-model answering)

### Modes
1. **Swarm Answer** — fan the question to N picked models in parallel; a synthesizer model merges drafts into one final answer citing each contributor.
2. **Swarm Task** — role split (Planner → Coder → Reviewer → Critic), each role bound to a model, run sequentially.

Router picks mode from intent; user can force with `/swarm` or `/task`.

### UX
- "Swarm" button next to the model picker in `ChatComposer` opens a multi-select of the user's library models (remembered per session).
- Message shows collapsible "Drafts (N)" accordion below the final answer — each draft labeled with model name, latency, tokens. Copy-per-draft.
- Streaming: final answer streams; per-model drafts arrive as SSE `draft` events, `final` closes.

### Server
New `src/serverfns/swarm.functions.ts`:
- Input: `{ conversation_id, message, models: string[], mode, synthesizer? }`
- `Promise.allSettled(models.map(m => chatCompletion({ model: m, messages })))` via `src/server/llm.server.ts`.
- Drafts truncated to ~1200 tokens for the synthesizer prompt.
- Synthesizer defaults to the user's default model; user can override.
- Persists `swarm_runs` + one `swarm_drafts` row per model.
- Reuses sticky repo context + existing tool loop — only the synthesizer gets tools.

Task mode reuses the same infra with role prompts added to `src/lib/vibe-coder-prompt.ts`.

### Guardrails
- Max 6 models per swarm; per-model 45s timeout; failed drafts surface as "Model X failed" without blocking the synthesizer. Video models (Kling) auto-excluded.

## Part 2 — Model Library Cleanup

### Remove legacy defaults
- Delete `CHAT_MODEL_OPTIONS` seed in `src/lib/chat-models.ts` — no built-in list.
- Remove `MODEL_SLUGS` alias map in `src/server/llm.server.ts`. `resolveChatModel` accepts only slugs in the user's `base_models` or a raw `vendor/model` slug they typed.
- `MODEL_LABELS` derived at runtime from `base_models`.

### New-user experience
- First `/chat` load with empty `base_models`: blocking empty state in model picker → "Add your first model" opens `/settings/models` add dialog.
- Composer send disabled with tooltip until ≥1 model saved.
- Remove any auth trigger / signup path that seeds default models (audit `models.functions.ts`).

### Remove/manage models
- `/settings/models`: trash icon per row, confirm dialog "Remove {label}? Chats that used it fall back to your default."
- Server fn `removeUserModel({ id })` — RLS-scoped hard delete; if removed was default, unset `user_settings.default_model_id`.
- "Set as default" star per row → writes `user_settings.default_model_id`.

### Legacy conversations
- If a stored `model_slug` no longer resolves, fall back to current default and inline-notice: "Original model removed — replied with {default}."

## Part 3 — Multi-Session Chat

Users need to run multiple chat sessions in parallel — separate contexts, separate model selections, switchable without losing state.

### Route + storage
- Move chat from `/chat` singleton to per-session URL: `src/routes/_authenticated/chat.$sessionId.tsx` (create route file). `/chat` (index) redirects to the most recent session or creates one.
- Each session persists to existing `ceo_conversations` + `ceo_chat_messages` (already scoped by `user_id`). Add columns via migration: `title text`, `pinned bool default false`, `archived_at timestamptz`, `model_slug text`, `swarm_models jsonb`.

### Sidebar (session list)
- Extend `ConversationSidebar` to show all sessions grouped: **Pinned**, **Today**, **Previous 7 days**, **Older**, **Archived** (collapsed).
- Per-row: title (inline-editable, keeps existing `autoTitleSession`), pin toggle, archive, delete, "Open in new tab" (opens `/chat/<id>` in new browser tab so two sessions run truly in parallel).
- "New session" button at top; keyboard shortcut `⌘⇧O`.
- Session search box (client-side filter on titles; server-side full-text later).

### Parallel session state
- Each session route mounts its own chat window keyed by `sessionId` — no cross-bleed of messages, model selection, swarm state, or streaming status.
- Background streaming: if the user switches sessions while an assistant reply is streaming, keep the stream alive server-side and finish persisting via `onFinish`. Show a small "streaming…" badge on the sidebar row for the backgrounded session; when the user returns, replay from `ceo_chat_messages`.
- Per-session model + swarm selection stored on the `ceo_conversations` row (`model_slug`, `swarm_models`) so switching sessions restores the correct picker state.

### Bulk actions
- Sidebar multi-select mode: archive many, delete many, export selected as JSON.

### Tab / window awareness
- Broadcast channel (`chat-sessions`) syncs sidebar list + unread badges across tabs so opening the same session in two tabs doesn't double-persist a message (last-write-wins with row `updated_at` guard).

## Data migration (single combined migration)

```sql
alter table public.ceo_conversations
  add column if not exists title text,
  add column if not exists pinned bool not null default false,
  add column if not exists archived_at timestamptz,
  add column if not exists model_slug text,
  add column if not exists swarm_models jsonb;

create table public.swarm_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid references public.ceo_conversations(id) on delete cascade,
  mode text not null check (mode in ('answer','task')),
  question text not null,
  synthesizer_model text,
  created_at timestamptz not null default now()
);
create table public.swarm_drafts (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.swarm_runs(id) on delete cascade,
  model_slug text not null,
  content text,
  latency_ms int,
  tokens int,
  error text
);

grant select, insert, update, delete on public.swarm_runs to authenticated;
grant select, insert, update, delete on public.swarm_drafts to authenticated;
grant all on public.swarm_runs, public.swarm_drafts to service_role;

alter table public.swarm_runs enable row level security;
alter table public.swarm_drafts enable row level security;

create policy "own runs" on public.swarm_runs for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own drafts" on public.swarm_drafts for all
  using (exists (select 1 from public.swarm_runs r where r.id = run_id and r.user_id = auth.uid()))
  with check (exists (select 1 from public.swarm_runs r where r.id = run_id and r.user_id = auth.uid()));
```

## Files touched

- `src/serverfns/swarm.functions.ts` (new)
- `src/lib/chat-models.ts` — drop seed
- `src/server/llm.server.ts` — drop alias map, dynamic resolve
- `src/lib/models.functions.ts` — `removeUserModel`, `setDefaultModel`; drop signup seed
- `src/routes/_authenticated/settings/models.tsx` — trash + star
- `src/routes/_authenticated/chat.$sessionId.tsx` (new) + `chat.tsx` becomes redirect
- `src/components/chat/ConversationSidebar.tsx` — grouped list, pin/archive, multi-select, broadcast sync
- `src/components/chat/ChatComposer.tsx` — Swarm button, empty-library state, disabled send
- `src/components/chat/MessageRow.tsx` — drafts accordion + fallback-model notice
- `src/lib/vibe-coder-prompt.ts` — role + synthesizer prompts
- `src/serverfns/ceo-chat.functions.ts` — read per-session model, missing-model fallback
- One migration for the schema changes above
