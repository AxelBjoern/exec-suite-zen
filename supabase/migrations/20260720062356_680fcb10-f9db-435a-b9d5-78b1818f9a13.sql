DROP POLICY IF EXISTS "agent_types admin manage system" ON public.agent_types;
CREATE POLICY "agent_types admin manage system"
ON public.agent_types
FOR ALL
TO authenticated
USING (
  is_system
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'owner')
  )
)
WITH CHECK (
  is_system
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'owner')
  )
);

DROP POLICY IF EXISTS "base_models admin manage system" ON public.base_models;
CREATE POLICY "base_models admin manage system"
ON public.base_models
FOR ALL
TO authenticated
USING (
  is_system
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'owner')
  )
)
WITH CHECK (
  is_system
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'owner')
  )
);