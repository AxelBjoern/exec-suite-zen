-- Session cache for the VDNX test account (server-only)
create table public.vdnx_session_cache (
  email text primary key,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);
grant all on public.vdnx_session_cache to service_role;
alter table public.vdnx_session_cache enable row level security;
-- intentionally no policies: locked to service_role only

-- Per-route probe results
create table public.vdnx_route_probe_results (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.workflow_runs(id) on delete cascade,
  route text not null,
  status text not null,
  http_status int,
  latency_ms int,
  wizard_loaded text not null default 'unknown',
  marker_checked text,
  html_length int,
  error text,
  created_at timestamptz not null default now()
);
create index vdnx_route_probe_results_run_id_idx on public.vdnx_route_probe_results (run_id);
grant select on public.vdnx_route_probe_results to authenticated;
grant all on public.vdnx_route_probe_results to service_role;
alter table public.vdnx_route_probe_results enable row level security;
create policy "owner reads own probe results"
  on public.vdnx_route_probe_results for select to authenticated
  using (exists (
    select 1 from public.workflow_runs r
    where r.id = run_id and r.user_id = auth.uid()
  ));