
-- ============ ROLES ============
create type public.app_role as enum ('admin','user');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;
create policy "user_roles self read" on public.user_roles for select to authenticated using (user_id = auth.uid());

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

-- ============ updated_at helper ============
create or replace function public.tg_set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end $$;

-- ============ AGENT TYPES ============
create table public.agent_types (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  is_system boolean not null default false,
  name text not null,
  industry text not null default 'general',
  description text not null default '',
  system_prompt text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((is_system and owner_id is null) or (not is_system and owner_id is not null))
);
grant select, insert, update, delete on public.agent_types to authenticated;
grant all on public.agent_types to service_role;
alter table public.agent_types enable row level security;
create policy "agent_types select" on public.agent_types for select to authenticated
  using (owner_id = auth.uid() or (is_system and public.has_role(auth.uid(),'admin')));
create policy "agent_types insert own" on public.agent_types for insert to authenticated
  with check (owner_id = auth.uid() and is_system = false);
create policy "agent_types update own" on public.agent_types for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "agent_types delete own" on public.agent_types for delete to authenticated
  using (owner_id = auth.uid());
create policy "agent_types admin manage system" on public.agent_types for all to authenticated
  using (is_system and public.has_role(auth.uid(),'admin'))
  with check (is_system and public.has_role(auth.uid(),'admin'));
create trigger agent_types_updated before update on public.agent_types for each row execute function public.tg_set_updated_at();

-- ============ BASE MODELS ============
create table public.base_models (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  is_system boolean not null default false,
  slug text not null,
  name text not null,
  provider text not null default 'openrouter',
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, slug),
  check ((is_system and owner_id is null) or (not is_system and owner_id is not null))
);
create unique index base_models_system_slug on public.base_models (slug) where is_system;
grant select, insert, update, delete on public.base_models to authenticated;
grant all on public.base_models to service_role;
alter table public.base_models enable row level security;
create policy "base_models select" on public.base_models for select to authenticated
  using (owner_id = auth.uid() or (is_system and public.has_role(auth.uid(),'admin')));
create policy "base_models insert own" on public.base_models for insert to authenticated
  with check (owner_id = auth.uid() and is_system = false);
create policy "base_models update own" on public.base_models for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "base_models delete own" on public.base_models for delete to authenticated
  using (owner_id = auth.uid());
create policy "base_models admin manage system" on public.base_models for all to authenticated
  using (is_system and public.has_role(auth.uid(),'admin'))
  with check (is_system and public.has_role(auth.uid(),'admin'));
create trigger base_models_updated before update on public.base_models for each row execute function public.tg_set_updated_at();

-- ============ BUDGET SCENARIOS ============
create table public.budget_scenarios (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  is_system boolean not null default false,
  name text not null,
  assumptions jsonb not null default '{}'::jsonb,
  actuals jsonb not null default '{"rows":[]}'::jsonb,
  contract_start_date date,
  is_base boolean not null default false,
  is_locked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((is_system and owner_id is null) or (not is_system and owner_id is not null))
);
grant select, insert, update, delete on public.budget_scenarios to authenticated;
grant all on public.budget_scenarios to service_role;
alter table public.budget_scenarios enable row level security;
create policy "budget select" on public.budget_scenarios for select to authenticated
  using (owner_id = auth.uid() or (is_system and public.has_role(auth.uid(),'admin')));
create policy "budget insert own" on public.budget_scenarios for insert to authenticated
  with check (owner_id = auth.uid() and is_system = false);
create policy "budget update own" on public.budget_scenarios for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "budget delete own" on public.budget_scenarios for delete to authenticated
  using (owner_id = auth.uid());
create policy "budget admin manage system" on public.budget_scenarios for all to authenticated
  using (is_system and public.has_role(auth.uid(),'admin'))
  with check (is_system and public.has_role(auth.uid(),'admin'));
create trigger budget_scenarios_updated before update on public.budget_scenarios for each row execute function public.tg_set_updated_at();

-- ============ SEED VDNX SYSTEM ROWS ============
insert into public.base_models (is_system, slug, name, provider, description) values
  (true,'nousresearch/hermes-4-405b','Hermes 4 405B','openrouter','Nous Research Hermes 4, 405B parameters.'),
  (true,'x-ai/grok-4.3','Grok 4.3','openrouter','xAI Grok 4.3.'),
  (true,'openai/gpt-5.3-chat','ChatGPT 5.3','openrouter','OpenAI GPT-5.3 chat.'),
  (true,'anthropic/claude-opus-4.7','Claude Opus 4.7','openrouter','Anthropic Claude Opus 4.7.'),
  (true,'deepseek/deepseek-v4-pro','DeepSeek V4 Pro','openrouter','DeepSeek V4 Pro.'),
  (true,'deepseek/deepseek-v4-flash','DeepSeek V4 Flash','openrouter','DeepSeek V4 Flash.');

insert into public.agent_types (is_system, name, industry, description) values
  (true,'CEO','executive','Chief executive — strategy, capital allocation, narrative.'),
  (true,'CFO','executive','Chief financial officer — P&L, cash, sensitivity.'),
  (true,'COO','executive','Chief operating officer — execution and cadence.'),
  (true,'CTO','executive','Chief technology officer — architecture and platform.'),
  (true,'CMO','executive','Chief marketing officer — positioning and demand.'),
  (true,'CRO','executive','Chief revenue officer — pipeline and conversion.'),
  (true,'Chief of Staff','executive','Owns the operating cadence and decisions log.'),
  (true,'General Counsel','executive','Legal, governance, contracts.'),
  (true,'Head of Product','product','Product strategy and roadmap.'),
  (true,'Head of Engineering','engineering','Engineering org and delivery.'),
  (true,'Head of Design','design','Design system and craft.'),
  (true,'Head of Data','data','Analytics, instrumentation, ML.'),
  (true,'Head of Sales','revenue','Outbound, AE org, deal desk.'),
  (true,'Head of Marketing','marketing','Brand, content, demand.'),
  (true,'Head of Customer Success','revenue','Onboarding, expansion, retention.'),
  (true,'Head of People','people','Hiring, performance, comp.'),
  (true,'Head of Finance','finance','FP&A, accounting, treasury.'),
  (true,'Head of Operations','operations','Vendors, processes, infra.'),
  (true,'Investor Relations','executive','Updates, decks, fundraising.'),
  (true,'Board Observer','executive','Reads, asks questions, files notes.');
