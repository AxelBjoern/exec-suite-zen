
CREATE TABLE public.agent_knowledge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.agent_types(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  file_size bigint NOT NULL DEFAULT 0,
  storage_path text NOT NULL,
  extracted_text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_knowledge TO authenticated;
GRANT ALL ON public.agent_knowledge TO service_role;

ALTER TABLE public.agent_knowledge ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_knowledge select own" ON public.agent_knowledge
  FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "agent_knowledge insert own" ON public.agent_knowledge
  FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "agent_knowledge update own" ON public.agent_knowledge
  FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "agent_knowledge delete own" ON public.agent_knowledge
  FOR DELETE TO authenticated USING (owner_id = auth.uid());

CREATE TRIGGER agent_knowledge_updated
  BEFORE UPDATE ON public.agent_knowledge
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE INDEX agent_knowledge_agent_idx ON public.agent_knowledge(agent_id);
CREATE INDEX agent_knowledge_owner_idx ON public.agent_knowledge(owner_id);

-- Storage RLS for the agent-knowledge bucket; objects stored under "{auth.uid()}/..."
CREATE POLICY "agent_knowledge storage select own"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'agent-knowledge' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "agent_knowledge storage insert own"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'agent-knowledge' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "agent_knowledge storage delete own"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'agent-knowledge' AND auth.uid()::text = (storage.foldername(name))[1]);
