create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('vdnx-daily-reminder') where exists (select 1 from cron.job where jobname = 'vdnx-daily-reminder');

select cron.schedule(
  'vdnx-daily-reminder',
  '0 9 * * *',
  $$
  select net.http_post(
    url := 'https://project--27c63e98-dce4-4d97-bbd5-b36a70b6f6c2.lovable.app/api/public/cron/daily-reminder',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp1dnJodWd5bHFybnJnZmR0Y3VhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxMDQxNzksImV4cCI6MjA5MzY4MDE3OX0.9gxX65iEKALQ18ggrfS4hg6D20j9GgA4SpO0cIIKNXE"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);