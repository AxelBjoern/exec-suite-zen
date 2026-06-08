
ALTER TABLE public.agent_types ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;
ALTER TABLE public.base_models ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;

DROP POLICY IF EXISTS "agent_types select" ON public.agent_types;
CREATE POLICY "agent_types select" ON public.agent_types FOR SELECT
USING (owner_id = auth.uid() OR is_public OR (is_system AND has_role(auth.uid(),'admin'::app_role)));

DROP POLICY IF EXISTS "base_models select" ON public.base_models;
CREATE POLICY "base_models select" ON public.base_models FOR SELECT
USING (owner_id = auth.uid() OR is_public OR (is_system AND has_role(auth.uid(),'admin'::app_role)));
