
CREATE TABLE public.company_context (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true UNIQUE,
  mission text NOT NULL DEFAULT '',
  principles text NOT NULL DEFAULT '',
  icp text NOT NULL DEFAULT '',
  positioning text NOT NULL DEFAULT '',
  current_priorities text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.company_context ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open read company_context" ON public.company_context FOR SELECT USING (true);
CREATE POLICY "open write company_context" ON public.company_context FOR ALL USING (true) WITH CHECK (true);

INSERT INTO public.company_context (mission, principles, icp, positioning, current_priorities)
VALUES (
  'VDNX is the operating system for verifiable enterprises.',
  'Authority. Auditability. Atomicity.',
  'Regulated enterprises in MENA and EU needing verifiable operations.',
  'The verifiable execution layer for regulated industries.',
  'Series A readiness, MENA launch, multi-jurisdictional audit log.'
);

ALTER TABLE public.messages ADD COLUMN summary text;

CREATE TABLE public.decision_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid,
  agent_slug text,
  title text NOT NULL,
  decision text NOT NULL,
  rationale text,
  amendments jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.decision_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open read decision_log" ON public.decision_log FOR SELECT USING (true);
CREATE POLICY "open write decision_log" ON public.decision_log FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX idx_decision_log_created ON public.decision_log (created_at DESC);
