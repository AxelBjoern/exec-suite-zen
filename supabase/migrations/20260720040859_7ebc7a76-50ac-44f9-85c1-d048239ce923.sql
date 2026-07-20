
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS swarm_models text[] DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS swarm_synth_model text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS swarm_max_parallel int DEFAULT 4;

CREATE TABLE IF NOT EXISTS public.swarm_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id uuid,
  message_id uuid,
  synth_model text NOT NULL,
  drafter_models text[] NOT NULL,
  status text NOT NULL DEFAULT 'ok',
  latency_ms int,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.swarm_runs TO authenticated;
GRANT ALL ON public.swarm_runs TO service_role;
ALTER TABLE public.swarm_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "swarm_runs_owner" ON public.swarm_runs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS swarm_runs_msg_idx ON public.swarm_runs(message_id);
CREATE INDEX IF NOT EXISTS swarm_runs_conv_idx ON public.swarm_runs(conversation_id);

CREATE TABLE IF NOT EXISTS public.swarm_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.swarm_runs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  model_slug text NOT NULL,
  model_label text,
  content text,
  status text NOT NULL DEFAULT 'ok',
  error text,
  latency_ms int,
  tokens_in int,
  tokens_out int,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.swarm_drafts TO authenticated;
GRANT ALL ON public.swarm_drafts TO service_role;
ALTER TABLE public.swarm_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "swarm_drafts_owner" ON public.swarm_drafts
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS swarm_drafts_run_idx ON public.swarm_drafts(run_id);
