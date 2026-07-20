
CREATE TABLE IF NOT EXISTS public.swarm_bench_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label text,
  prompt text NOT NULL,
  drafter_models text[] NOT NULL DEFAULT '{}',
  synth_model text NOT NULL,
  latency_ms integer NOT NULL DEFAULT 0,
  tokens_in integer NOT NULL DEFAULT 0,
  tokens_out integer NOT NULL DEFAULT 0,
  cost_credits numeric(12,4) NOT NULL DEFAULT 0,
  quality_score numeric(4,2),
  per_model jsonb NOT NULL DEFAULT '[]'::jsonb,
  final_answer text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.swarm_bench_runs TO authenticated;
GRANT ALL ON public.swarm_bench_runs TO service_role;

ALTER TABLE public.swarm_bench_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own bench runs"
  ON public.swarm_bench_runs
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS swarm_bench_runs_user_created_idx
  ON public.swarm_bench_runs (user_id, created_at DESC);
