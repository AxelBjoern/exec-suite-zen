
-- Phase 4 additions: depth, kinds, suggestions, schedules, job_queue
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS depth integer NOT NULL DEFAULT 0;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS kind text;
ALTER TABLE public.threads ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'solo';
ALTER TABLE public.approvals ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'task';
ALTER TABLE public.approvals ADD COLUMN IF NOT EXISTS payload jsonb;

CREATE TABLE IF NOT EXISTS public.suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_slug text NOT NULL,
  thread_id uuid,
  task_id uuid,
  title text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);
ALTER TABLE public.suggestions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open read suggestions" ON public.suggestions FOR SELECT USING (true);
CREATE POLICY "open write suggestions" ON public.suggestions FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  cron text NOT NULL,
  agent_slug text NOT NULL,
  mode text NOT NULL DEFAULT 'solo',
  verb text,
  args text,
  prompt text,
  active boolean NOT NULL DEFAULT true,
  last_run_at timestamptz,
  next_run_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open read schedules" ON public.schedules FOR SELECT USING (true);
CREATE POLICY "open write schedules" ON public.schedules FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS schedules_active_next_idx ON public.schedules (active, next_run_at);

CREATE TABLE IF NOT EXISTS public.job_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  run_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.job_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open read job_queue" ON public.job_queue FOR SELECT USING (true);
CREATE POLICY "open write job_queue" ON public.job_queue FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS job_queue_status_run_idx ON public.job_queue (status, run_at);
