# Tool-using agents + background cadence (v2 — DeepSeek-hardened)

Stress-tested by Claude Opus 4.7 then DeepSeek V4 Pro. Merged critiques applied: `founder_reminders` collapsed into `tasks(kind='reminder')`, `approvals.task_id` made nullable, cron auth moved off the anon key, `job-tick` race fixed with advisory locks, daily-report dedup, model-used column added.

Three phases. Phase 1 must ship before Phase 2.

---

## Phase 1 — Tool-calling foundation

### 1.1 `callAgentTool()` in `src/server/llm.server.ts`
Multi-turn loop (today's `callTool` is single-shot). Strategy per model:
- **Native tool models** (Grok 4.3, ChatGPT 5.3, Claude Opus 4.7, DeepSeek V4 Pro/Flash): reuse `chatCompletion` with `tools:` and an assistant↔tool message loop, max 6 turns.
- **Hermes 4 405B**: no tool endpoint on OpenRouter (per existing comment in `llm.server.ts`). Use JSON envelope `{"tool","args","rationale"}` / `{"tool":"final","args":{"reply_markdown"}}` parsed via existing `tryParse` + `repairJson`. No `tools:` sent.

```ts
callAgentTool<T>({
  agent_slug, system, user,
  tools_to_use?: string[],   // names from registry; default = full read-only set
  max_turns?: 6,
  model?: string,            // default deepseek/deepseek-v4-pro
  context?: { task_id?, thread_id? },
}): Promise<{ finalMessage: string; toolCalls: ToolInvocation[] }>
```
Each tool execution writes a `tool_calls` row (table already exists, `task_id` nullable).

Do **not** change `DEFAULT_MODEL` global — it would silently retarget every other caller. New default lives inside `callAgentTool`.

### 1.2 Tool registry — new `src/server/agent-tools.server.ts`
Zod-typed, per-agent allowlist, single executor.

```ts
type ToolDef<T> = {
  name: string;
  description: string;
  parameters: ZodSchema<T>;
  readOnly: boolean;
  allowedAgents: string[] | "*";
  execute: (args: T, ctx: ToolCtx) => Promise<unknown>;
};
```

Phase-1 (read-only):
- `knowledge.list_docs({ agent_slug })`
- `knowledge.read_doc({ doc_id })` — returns `agent_knowledge.extracted_text` as-is (already parsed at upload)
- `web.search({ query, limit })` — wraps `src/server/web.server.ts`
- `web.fetch({ url })`
- `db.read_tasks({ agent_slug, status? })`
- `db.read_recent_decisions({ limit })`

### 1.3 Wire `runTask()` in `cadence.server.ts` to `callAgentTool`
Replace the single-shot `callTool([CHAT_TOOL, ARTIFACT_TOOL])` path. `CHAT_TOOL` / `ARTIFACT_TOOL` become terminal "final" shapes (or map to JSON-envelope `final`). Pass the read-only tool set scoped by `agent_slug`.

### 1.4 Model tracking
```sql
alter table messages add column model_used text;
```
Populate at every insert site (`cadence.server.ts`, `daily-reports.ts`, chat handlers). UI pill on `MessageRow` reads it; old rows show "Unknown".

### 1.5 Cron auth hardening
Replace `SUPABASE_PUBLISHABLE_KEY` check in `src/server/cron-auth.server.ts` with a dedicated `VDNX_CRON_SECRET` (added via `secrets--add_secret`). The anon key is public on the published site — using it as the cron gate means anyone can trigger LLM jobs. Update all pg_cron entries to send the new header.

### 1.6 `job-tick` race fix
Wrap the per-job claim in `pg_try_advisory_lock(hashtext(job.id::text))` so parallel cron invocations can't double-run a job. Release in `finally`. The current comment ("rely on status update as a soft lock") is unsafe under any concurrency.

---

## Phase 2 — Write tools + approval rules

### 2.1 Schema
```sql
-- Polymorphic approval references
alter table approvals add column ref_table text;
alter table approvals add column ref_id    uuid;
alter table approvals alter column task_id drop not null;

-- Auto-approve rules (operator-owned, strict)
create table auto_approve_rules (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users(id) on delete cascade,
  kind       text not null,                -- 'content_draft' | 'lead_reply' | 'reminder'
  agent_slug text,                          -- null = any
  match      jsonb not null default '{}',  -- { keyword_deny: string[], max_external_links: int }
  enabled    boolean not null default true,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on auto_approve_rules to authenticated;
grant all on auto_approve_rules to service_role;
alter table auto_approve_rules enable row level security;
create policy "owner_rw" on auto_approve_rules for all using (owner_id = auth.uid());

-- Content drafts (don't pollute `templates`, which is agent-scoped not post-scoped)
create table content_drafts (
  id          uuid primary key default gen_random_uuid(),
  agent_id    uuid references agents(id) on delete cascade,
  kind        text not null,               -- 'linkedin_post' | 'email' | 'tweet'
  body_md     text not null,
  metadata    jsonb default '{}',
  status      text not null default 'draft' check (status in ('draft','pending_approval','approved','sent','archived')),
  approval_id uuid references approvals(id),
  created_at  timestamptz not null default now()
);
grant select, insert, update, delete on content_drafts to authenticated;
grant all on content_drafts to service_role;
alter table content_drafts enable row level security;
create policy "agent_owner_rw" on content_drafts for all using (
  exists (select 1 from agents a where a.id = agent_id and a.owner_id = auth.uid())
);
```

**Reminders reuse `tasks`** with `kind='reminder'` — no new table. Add partial index:
```sql
create index tasks_reminder_idx on tasks(agent_id, status, created_at) where kind = 'reminder';
```

### 2.2 Write tools (`readOnly:false`, always create approval)
- `db.create_reminder({ title, body_md, due_at, urgency })` → inserts `tasks` with `kind='reminder'`
- `outbound.draft_linkedin({ body_md })` → `content_drafts` row + `approvals(kind='content_draft', ref_table='content_drafts', ref_id=...)`
- `outbound.draft_email({ to_lead_id, subject, body_md })` → same shape
- `db.draft_lead_reply({ reply_id, draft_response })` → updates existing `lead_replies.draft_response` + approval (the table already has `classification` and `draft_response` — do not duplicate)

### 2.3 `shouldAutoApprove(approval, rules) → { approve: boolean; reason: string }`
Pure server helper, no LLM. Algorithm:
1. **Hard deny** when `approval.kind === 'weekly_plan'` or `approval.payload?.requires_external_approval === true`.
2. Filter `rules` by `enabled && (rule.agent_slug == null || matches)` and `rule.kind === approval.kind`.
3. Body checks: keyword deny scan on the referenced draft/reply, link count ≤ `match.max_external_links`.
4. Return first positive match. Log decision + reason to `audit_log` (existing table).

---

## Phase 3 — Background cadence
All routes under `/api/public/cron/*`, auth via the hardened `checkCronAuth` (1.5), default model `deepseek/deepseek-v4-pro`, loop max 6.

| Route | Schedule | Behavior |
|---|---|---|
| `daily-reports` (extend) | existing | Use `callAgentTool` with `knowledge.*` + `db.read_tasks` + `db.create_reminder`. **Dedup**: skip if a `threads` row exists for `(agent_id, kind='standup', created_at::date = today)`. |
| `weekly-drafts` (new) | Mon 07:00 UTC | For agents flagged outbound, draft 3 posts → `content_drafts(status='draft')`. Approval created only when an operator clicks "submit for review". |
| `approval-sweeper` (new) | every 15 min | Pure rules, no LLM. Iterates `approvals.status='pending'` for `kind in ('reminder','content_draft','lead_reply')`, runs `shouldAutoApprove`, updates row. |
| `lead-reply-triage` (new) | every 10 min | For `lead_replies WHERE classification IS NULL`: LLM writes `classification` + `draft_response` in place; create approval row referencing the reply. |

Schedule with `supabase--insert` against `project--27c63e98-...-dev.lovable.app/api/public/cron/*` sending the new `VDNX_CRON_SECRET` header.

---

## Phase 4 — UI (thin, low risk)
- **Reminders card** on `/` — `tasks WHERE kind='reminder' AND status='todo'`, sorted by due_at.
- **Auto-approve rules** at `/settings/auto-approve` — CRUD against `auto_approve_rules`, simple JSON-builder for `match`.
- **Model pill** on `MessageRow` — reads `messages.model_used`, "Unknown" fallback.
- **Drafts queue** at `/approvals` filtered by `ref_table='content_drafts'`, body preview + approve/reject.

---

## Order of work
1. Migration: `messages.model_used`, `approvals.ref_table/ref_id/nullable task_id`, `auto_approve_rules`, `content_drafts`, `tasks_reminder_idx`.
2. `VDNX_CRON_SECRET` via `secrets--add_secret`; update `cron-auth.server.ts` + every pg_cron entry.
3. `agent-tools.server.ts` registry + read-only tools + executor logging.
4. `callAgentTool()` in `llm.server.ts` (native + Hermes envelope).
5. Convert `runTask()` to `callAgentTool`.
6. `job-tick` advisory lock fix.
7. Extend `daily-reports` + dedup.
8. `weekly-drafts`, `approval-sweeper`, `lead-reply-triage` routes + pg_cron entries.
9. `shouldAutoApprove` + write tools.
10. UI: reminders card → rules page → model pill → drafts queue.

---

## Out of scope
Sending email/LinkedIn (drafts only); GitHub writes; Hermes as default tool model; re-parsing already-extracted docs; per-tool cost tracking beyond `tool_calls`; Kling video in agent loop.
