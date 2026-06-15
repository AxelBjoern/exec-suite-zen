create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Replace any prior version of the schedule
do $$
begin
  perform cron.unschedule('workflow-job-tick');
exception when others then null;
end $$;

select cron.schedule(
  'workflow-job-tick',
  '* * * * *',
  $cron$
  select net.http_post(
    url := 'https://exec-suite-zen.lovable.app/api/public/cron/job-tick',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp1dnJodWd5bHFybnJnZmR0Y3VhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxMDQxNzksImV4cCI6MjA5MzY4MDE3OX0.9gxX65iEKALQ18ggrfS4hg6D20j9GgA4SpO0cIIKNXE"}'::jsonb,
    body := '{}'::jsonb
  );
  $cron$
);

-- Clean up stuck runs
update public.workflow_runs
set status = 'failed', finished_at = now()
where status in ('pending', 'running')
  and started_at < now() - interval '1 hour';

-- Clean up stale failed jobs so they don't keep retrying noise
update public.job_queue
set status = 'failed'
where status = 'pending' and attempts >= 3;
