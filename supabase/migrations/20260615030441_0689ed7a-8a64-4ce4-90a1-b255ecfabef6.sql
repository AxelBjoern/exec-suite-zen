update public.workflow_runs
set status = 'failed', finished_at = now()
where id = 'dab7442d-108c-4fb0-bd4c-e86851147212';