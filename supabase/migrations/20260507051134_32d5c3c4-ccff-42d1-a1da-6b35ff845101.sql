ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS artifact_json jsonb;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS parent_task_id uuid;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS owner_agent text;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS auto_dispatched boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_tasks_parent ON public.tasks(parent_task_id);