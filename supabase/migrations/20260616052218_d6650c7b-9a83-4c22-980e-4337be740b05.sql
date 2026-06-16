
CREATE TABLE public.vdnx_probe_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id text NOT NULL,
  target_email text NOT NULL,
  route text,
  verb text,
  status text,
  latency_ms integer,
  console_errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  network_failures jsonb NOT NULL DEFAULT '[]'::jsonb,
  screenshot_url text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.vdnx_probe_reports TO authenticated;
GRANT ALL ON public.vdnx_probe_reports TO service_role;

ALTER TABLE public.vdnx_probe_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can read probe reports"
  ON public.vdnx_probe_reports FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Owners can insert probe reports"
  ON public.vdnx_probe_reports FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'owner') AND auth.uid() = created_by);

CREATE INDEX idx_vdnx_probe_reports_created_at ON public.vdnx_probe_reports (created_at DESC);
CREATE INDEX idx_vdnx_probe_reports_agent_id ON public.vdnx_probe_reports (agent_id);
