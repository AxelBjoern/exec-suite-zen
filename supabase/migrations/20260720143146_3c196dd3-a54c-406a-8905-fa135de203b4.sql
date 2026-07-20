
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE public.chat_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  system_prompt TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_projects TO authenticated;
GRANT ALL ON public.chat_projects TO service_role;
ALTER TABLE public.chat_projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own projects" ON public.chat_projects FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX chat_projects_user_idx ON public.chat_projects(user_id, created_at DESC);

ALTER TABLE public.ceo_conversations
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.chat_projects(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS ceo_conversations_project_idx ON public.ceo_conversations(project_id);

CREATE TRIGGER chat_projects_touch BEFORE UPDATE ON public.chat_projects
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
