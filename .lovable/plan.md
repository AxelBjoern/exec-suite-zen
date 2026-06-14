
## Stack adaptation
Your snippet is Next.js — this project is TanStack Start. Concrete mapping:

| Your snippet | This project |
|---|---|
| `app/cowork/page.tsx` | `src/routes/_authenticated/cowork.tsx` |
| `app/automate/page.tsx` | `src/routes/_authenticated/automate.tsx` |
| `lib/ai/vibeCoderChat.ts` calling `/api/vibe-chat` | `createServerFn` in `src/lib/cowork.functions.ts` calling existing `chatCompletion()` from `src/server/llm.server.ts` (OpenRouter, Grok 4.3 default) |
| `@/lib/supabase/client` | `@/integrations/supabase/client` (browser) + `requireSupabaseAuth` middleware (server) |
| `'use client'`, `next/dynamic`, `useSearchParams` | not used; TanStack `Route.useSearch()` + dynamic via `React.lazy` if needed |
| `bg-emerald-600`, `bg-slate-700`, `bg-gray-900`, `text-white` | semantic tokens only: `bg-primary`, `bg-muted`, `bg-panel`, `bg-panel-2`, `text-foreground`, `text-muted-foreground`, `border-border` |
| `alert(...)` for apply/diff | real diff (using `diff` lib) + real persistence |

## 1. Dependencies (approved)
`bun add mermaid @uiw/react-markdown-preview diff uuid && bun add -d @types/uuid`

## 2. Database (one migration)

```sql
-- A) cowork_sessions: per-user chat + preview state
create table public.cowork_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Untitled session',
  messages jsonb not null default '[]'::jsonb,
  preview_content text not null default '',
  preview_type text not null default 'markdown',
  applied_content text,           -- last applied snapshot for diff
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.cowork_sessions to authenticated;
grant all on public.cowork_sessions to service_role;
alter table public.cowork_sessions enable row level security;
create policy "own sessions" on public.cowork_sessions
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create trigger cowork_sessions_updated_at before update on public.cowork_sessions
  for each row execute function public.tg_set_updated_at();

-- B) workflows: visual workflow definitions
create table public.workflows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  nodes jsonb not null default '[]'::jsonb,   -- [{id,type,label,config}]
  schedule_id uuid references public.schedules(id) on delete set null,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.workflows to authenticated;
grant all on public.workflows to service_role;
alter table public.workflows enable row level security;
create policy "own workflows" on public.workflows
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create trigger workflows_updated_at before update on public.workflows
  for each row execute function public.tg_set_updated_at();

-- C) workflow_runs: execution history
create table public.workflow_runs (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.workflows(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending',     -- pending|running|awaiting_approval|completed|failed|cancelled
  current_node_id text,
  log jsonb not null default '[]'::jsonb,     -- [{ts,node_id,level,message,data}]
  approval_id uuid references public.approvals(id) on delete set null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.workflow_runs to authenticated;
grant all on public.workflow_runs to service_role;
alter table public.workflow_runs enable row level security;
create policy "own runs" on public.workflow_runs
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
```

## 3. Shared infrastructure

**`src/lib/vibe-coder-prompt.ts`** — Vibe Coder + Automator system prompt (sovereignty-first, allowed-models guardrails, Markdown/TSX/JSON/Mermaid output format), exported as a const string.

**`src/lib/cowork.functions.ts`** (createServerFn, requireSupabaseAuth):
- `vibeChat({ messages })` → calls `chatCompletion({ messages: [{system}, ...], model: resolveTextChatModel("grok") })`, returns assistant message text.
- `listSessions()`, `getSession(id)`, `createSession()`, `updateSession({id, messages?, previewContent?, previewType?})`, `applyPreview({id})` (copies `preview_content` → `applied_content`, writes `audit_log`), `deleteSession(id)`.

**`src/lib/workflows.functions.ts`** (createServerFn, requireSupabaseAuth):
- `listWorkflows`, `getWorkflow`, `saveWorkflow({id?, name, description, nodes})`, `deleteWorkflow`, `toggleActive` (creates/updates a row in `schedules` with `agent_slug='workflow-runner'` and `args=JSON.stringify({workflow_id})` when active; clears `next_run_at` when inactive).
- `runWorkflowNow({id})` → inserts a `workflow_runs` row + enqueues `job_queue` row `kind='workflow_step', payload={run_id, node_index:0}`.
- `listRuns({workflow_id?})`, `decideApproval` (already exists in `outbound.functions.ts` for approvals — reuse pattern).

**`src/server/workflow-runner.server.ts`** — executes one node at a time:
- `trigger` → no-op pass through (the cron/scheduled call IS the trigger).
- `llm_step` → `chatCompletion` with node `config.prompt`; appends to `log`.
- `human_review` → inserts `approvals` row (`kind='task'`, `payload={workflow_run_id, node_id}`), sets run `status='awaiting_approval'`, stops. Approving the row re-enqueues next node.
- `action` → switch on `config.action`: `email`, `linkedin_post`, `reminder` — each creates an `approvals` row (existing outbound flow) OR if `config.auto=true` and rule allows, dispatches directly via existing outbound helpers.
- `output` → write to `decision_log` table.
After each node, enqueue next via `job_queue` (or finalize).

**`src/routes/api/public/cron/job-tick.ts`** — already exists; extend its switch to dispatch `kind='workflow_step'` to `workflow-runner.server`.

**`src/components/PreviewPane.tsx`** (≤200 lines, semantic tokens):
- Props: `content, type, originalContent?, onApply?, onRegenerate?`.
- `type='markdown'` → `@uiw/react-markdown-preview` styled to match panel theme.
- `type='tsx'|'ts'|'json'` → toggle Preview/Edit; Preview = `<pre class="bg-panel-2 text-foreground p-3 rounded-md overflow-auto"><code>`; Edit = `<Textarea>` (no Monaco needed; existing rule = no new heavy deps beyond approved list).
- `type='mermaid'` → `mermaid.render()` in `useEffect`, rendered into a div; loading shimmer fallback.
- Diff: real diff via `diff.diffLines(originalContent, content)` rendered with `bg-primary/10` for adds and `bg-destructive/10` for removes inside a `<Dialog>`.

## 4. /cowork page (`src/routes/_authenticated/cowork.tsx`, ≤200 lines)
Layout: left = session sidebar (list + "New session") + chat transcript + composer; right = `PreviewPane` with Regenerate / Diff / Apply.
- Active session id via search param `?session=...` (validate with `validateSearch`).
- `useQuery(['cowork-session', id], () => getSession({data:{id}}))`.
- Send: optimistic append → `vibeChat` → parse last ```lang fenced block → set `previewContent`/`previewType` → `updateSession` mutation.
- Apply → `applyPreview` mutation → toast.
- Diff → opens dialog with red/green diff (no `alert`).
- Regenerate → re-sends last user message.

## 5. /automate page (`src/routes/_authenticated/automate.tsx`, ≤200 lines — split if needed)
Sub-components: `WorkflowList.tsx`, `WorkflowCanvas.tsx`, `NodeCard.tsx`, `RunHistory.tsx` (each <200 lines).
- Left: workflow list + Templates (`Daily Executive Briefing`, `Model Diversification Audit`) seeded as constants → "Use template" inserts a new `workflows` row.
- Center: vertical node list with drag reorder (HTML5 drag, no new dep), "Add node" buttons (`trigger | llm_step | human_review | action | output`), per-node `config` form (cron, prompt, model selector limited to allowed 7 chat models, action type/params).
- Right top: "Save" (`saveWorkflow`), "Activate" (toggles schedule), "Run now" (`runWorkflowNow`).
- Right bottom: `RunHistory` shows `workflow_runs` rows (auto-refresh 10s) with status badge + log accordion + "Approve / Reject" buttons when status=`awaiting_approval` (uses existing approvals UI pattern from `src/routes/_authenticated/approvals.tsx`).

## 6. Hub tiles + nav
Add two tiles to `src/routes/_authenticated/index.tsx` `TILES`: Cowork (`/cowork`, Sparkles? no — use `Workflow` or `Wand2` from lucide) and Automate (`/automate`, `Cpu` already taken → `Zap`).

## 7. What's intentionally NOT included
- Real codebase file-apply: the user app cannot write to its own source files. "Apply" persists the approved preview into `cowork_sessions.applied_content` + `audit_log`. If you later want file-edit, that lives in the Lovable editor, not the runtime app.
- Drag-and-drop workflow canvas with curved edges (react-flow): use simple vertical list with drag-reorder; can upgrade later if requested.
- Monaco editor: PreviewPane uses Textarea for edit mode to honor the no-new-heavy-deps spirit.

## 8. Order of operations
1. Migration (3 tables) — wait for approval.
2. `bun add` deps.
3. Shared infra (prompt, server fns, PreviewPane, workflow-runner).
4. Extend job-tick cron switch.
5. `/cowork` route + tile.
6. `/automate` route + sub-components + tile.
7. Manual smoke: create session → chat → apply → diff; create workflow → save → run now → approve gate → completes.

Approve to build.
