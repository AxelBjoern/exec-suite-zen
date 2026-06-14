
create table public.cowork_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Untitled session',
  messages jsonb not null default '[]'::jsonb,
  preview_content text not null default '',
  preview_type text not null default 'markdown',
  applied_content text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.cowork_sessions to authenticated;
grant all on public.cowork_sessions to service_role;
alter table public.cowork_sessions enable row level security;
create policy "own cowork sessions" on public.cowork_sessions
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create trigger cowork_sessions_updated_at before update on public.cowork_sessions
  for each row execute function public.tg_set_updated_at();

create table public.workflows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  nodes jsonb not null default '[]'::jsonb,
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

create table public.workflow_runs (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.workflows(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending',
  current_node_id text,
  log jsonb not null default '[]'::jsonb,
  approval_id uuid references public.approvals(id) on delete set null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.workflow_runs to authenticated;
grant all on public.workflow_runs to service_role;
alter table public.workflow_runs enable row level security;
create policy "own workflow runs" on public.workflow_runs
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create index workflow_runs_workflow_idx on public.workflow_runs(workflow_id, started_at desc);
