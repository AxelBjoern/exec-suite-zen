
-- Gate system rows by VDNX owner email instead of (unset) admin role,
-- so axel sees the prebuilt agents/models and other users only see public defaults + their own.

DROP POLICY IF EXISTS "agent_types select" ON public.agent_types;
CREATE POLICY "agent_types select" ON public.agent_types
  FOR SELECT
  USING (
    owner_id = auth.uid()
    OR is_public
    OR (is_system AND lower(coalesce(auth.jwt() ->> 'email','')) = 'axel@natax.co.uk')
  );

DROP POLICY IF EXISTS "base_models select" ON public.base_models;
CREATE POLICY "base_models select" ON public.base_models
  FOR SELECT
  USING (
    owner_id = auth.uid()
    OR is_public
    OR (is_system AND lower(coalesce(auth.jwt() ->> 'email','')) = 'axel@natax.co.uk')
  );
