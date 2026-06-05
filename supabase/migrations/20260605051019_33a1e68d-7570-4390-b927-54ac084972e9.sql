
CREATE OR REPLACE FUNCTION public.is_owner(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'owner'
  );
$$;

ALTER TABLE public.approvals
  ADD COLUMN IF NOT EXISTS requester_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS approvals_requester_id_idx ON public.approvals(requester_id);
CREATE INDEX IF NOT EXISTS approvals_kind_status_idx ON public.approvals(kind, status);

DROP POLICY IF EXISTS "open read approvals" ON public.approvals;
DROP POLICY IF EXISTS "open write approvals" ON public.approvals;

CREATE POLICY "approvals: requester reads own"
  ON public.approvals FOR SELECT
  TO authenticated
  USING (requester_id = auth.uid());

CREATE POLICY "approvals: requester inserts own pending"
  ON public.approvals FOR INSERT
  TO authenticated
  WITH CHECK (
    requester_id = auth.uid()
    AND status = 'pending'
    AND kind IN ('outbound_email','outbound_linkedin','outbound_reminder')
  );

CREATE POLICY "approvals: owner reads all"
  ON public.approvals FOR SELECT
  TO authenticated
  USING (public.is_owner(auth.uid()));

CREATE POLICY "approvals: owner updates"
  ON public.approvals FOR UPDATE
  TO authenticated
  USING (public.is_owner(auth.uid()))
  WITH CHECK (public.is_owner(auth.uid()));

CREATE POLICY "approvals: task kind read"
  ON public.approvals FOR SELECT
  TO authenticated
  USING (kind = 'task');

CREATE POLICY "approvals: task kind write"
  ON public.approvals FOR ALL
  TO authenticated
  USING (kind = 'task')
  WITH CHECK (kind = 'task');
