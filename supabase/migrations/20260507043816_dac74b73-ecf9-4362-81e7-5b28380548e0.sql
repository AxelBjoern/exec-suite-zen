
-- AGENTS
create table public.agents (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  role text not null,
  mandate text not null,
  system_prompt text not null,
  tone text not null,
  consult_with text[] not null default '{}',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- THREADS
create table public.threads (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid references public.agents(id) on delete cascade,
  mode text not null default 'solo', -- solo | boardroom
  title text,
  created_at timestamptz not null default now()
);

-- MESSAGES
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid references public.threads(id) on delete cascade not null,
  agent_id uuid references public.agents(id) on delete set null,
  role text not null, -- user | agent | system
  content text not null,
  created_at timestamptz not null default now()
);

-- DIRECTIVES
create table public.directives (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid references public.agents(id) on delete cascade not null,
  body text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- TASKS
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid references public.agents(id) on delete set null,
  thread_id uuid references public.threads(id) on delete set null,
  title text not null,
  body text,
  status text not null default 'todo', -- todo | in_progress | done | blocked
  requires_approval boolean not null default false,
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

-- APPROVALS
create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references public.tasks(id) on delete cascade,
  status text not null default 'pending', -- pending | approved | rejected
  reviewer text,
  notes text,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

-- AUDIT LOG (append-only, hash-chained)
create table public.audit_log (
  id bigserial primary key,
  actor text not null default 'operator',
  agent_slug text,
  action text not null,
  target text,
  payload jsonb not null default '{}'::jsonb,
  prev_hash text,
  hash_self text not null,
  created_at timestamptz not null default now()
);

-- TEMPLATES
create table public.templates (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid references public.agents(id) on delete cascade,
  name text not null,
  prompt text not null,
  created_at timestamptz not null default now()
);

-- LEAD GEN
create table public.icps (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  criteria jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  icp_id uuid references public.icps(id) on delete set null,
  full_name text,
  title text,
  company text,
  linkedin_url text,
  email text,
  enrichment jsonb default '{}'::jsonb,
  status text not null default 'new', -- new | contacted | replied | booked | closed
  created_at timestamptz not null default now()
);

create table public.sequences (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete cascade,
  steps jsonb not null default '[]'::jsonb,
  current_step int not null default 0,
  created_at timestamptz not null default now()
);

create table public.lead_replies (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete cascade,
  body text not null,
  classification text,
  draft_response text,
  created_at timestamptz not null default now()
);

-- RLS: enable on all
alter table public.agents enable row level security;
alter table public.threads enable row level security;
alter table public.messages enable row level security;
alter table public.directives enable row level security;
alter table public.tasks enable row level security;
alter table public.approvals enable row level security;
alter table public.audit_log enable row level security;
alter table public.templates enable row level security;
alter table public.icps enable row level security;
alter table public.leads enable row level security;
alter table public.sequences enable row level security;
alter table public.lead_replies enable row level security;

-- Open access for internal terminal (read+write for everyone)
create policy "open read agents" on public.agents for select using (true);
create policy "open write agents" on public.agents for all using (true) with check (true);

create policy "open read threads" on public.threads for select using (true);
create policy "open write threads" on public.threads for all using (true) with check (true);

create policy "open read messages" on public.messages for select using (true);
create policy "open write messages" on public.messages for all using (true) with check (true);

create policy "open read directives" on public.directives for select using (true);
create policy "open write directives" on public.directives for all using (true) with check (true);

create policy "open read tasks" on public.tasks for select using (true);
create policy "open write tasks" on public.tasks for all using (true) with check (true);

create policy "open read approvals" on public.approvals for select using (true);
create policy "open write approvals" on public.approvals for all using (true) with check (true);

-- audit_log: append-only
create policy "open read audit" on public.audit_log for select using (true);
create policy "open insert audit" on public.audit_log for insert with check (true);
-- no update, no delete policies => denied by RLS

create policy "open read templates" on public.templates for select using (true);
create policy "open write templates" on public.templates for all using (true) with check (true);

create policy "open read icps" on public.icps for select using (true);
create policy "open write icps" on public.icps for all using (true) with check (true);

create policy "open read leads" on public.leads for select using (true);
create policy "open write leads" on public.leads for all using (true) with check (true);

create policy "open read sequences" on public.sequences for select using (true);
create policy "open write sequences" on public.sequences for all using (true) with check (true);

create policy "open read lead_replies" on public.lead_replies for select using (true);
create policy "open write lead_replies" on public.lead_replies for all using (true) with check (true);

create index idx_messages_thread on public.messages(thread_id, created_at);
create index idx_tasks_status on public.tasks(status);
create index idx_audit_created on public.audit_log(created_at desc);
create index idx_leads_status on public.leads(status);
