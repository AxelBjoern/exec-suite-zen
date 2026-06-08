
-- 1. messages.model_used
alter table public.messages add column if not exists model_used text;

-- 2. approvals: polymorphic ref + nullable task_id
alter table public.approvals add column if not exists ref_table text;
alter table public.approvals add column if not exists ref_id   uuid;
alter table public.approvals alter column task_id drop not null;

-- 3. auto_approve_rules
create table if not exists public.auto_approve_rules (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users(id) on delete cascade,
  kind       text not null,
  agent_slug text,
  match      jsonb not null default '{}'::jsonb,
  enabled    boolean not null default true,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.auto_approve_rules to authenticated;
grant all on public.auto_approve_rules to service_role;
alter table public.auto_approve_rules enable row level security;
create policy "owner rw auto_approve_rules" on public.auto_approve_rules
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- 4. content_drafts (owner_id direct — agents table has no owner column)
create table if not exists public.content_drafts (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid references auth.users(id) on delete set null,
  agent_id    uuid references public.agents(id) on delete cascade,
  kind        text not null,
  body_md     text not null,
  metadata    jsonb not null default '{}'::jsonb,
  status      text not null default 'draft' check (status in ('draft','pending_approval','approved','sent','archived')),
  approval_id uuid references public.approvals(id) on delete set null,
  created_at  timestamptz not null default now()
);
grant select, insert, update, delete on public.content_drafts to authenticated;
grant all on public.content_drafts to service_role;
alter table public.content_drafts enable row level security;
create policy "owner rw content_drafts" on public.content_drafts
  for all using (owner_id is null or owner_id = auth.uid())
  with check (owner_id is null or owner_id = auth.uid());

-- 5. Reminder index on tasks
create index if not exists tasks_reminder_idx on public.tasks (agent_id, status, created_at)
  where kind = 'reminder';

-- 6. Founder reminders are also user-scoped; record owner via payload->>'owner_id' (no schema change needed; uses existing tasks.payload).
