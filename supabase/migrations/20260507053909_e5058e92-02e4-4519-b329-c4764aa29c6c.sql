
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS payload jsonb;

CREATE TABLE IF NOT EXISTS public.tool_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  task_id uuid,
  agent_slug text,
  tool text NOT NULL,
  request jsonb NOT NULL DEFAULT '{}'::jsonb,
  response jsonb,
  status text NOT NULL DEFAULT 'ok',
  error text
);

ALTER TABLE public.tool_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "open read tool_calls" ON public.tool_calls FOR SELECT USING (true);
CREATE POLICY "open write tool_calls" ON public.tool_calls FOR ALL USING (true) WITH CHECK (true);
