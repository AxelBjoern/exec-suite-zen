ALTER TABLE public.approvals ADD COLUMN IF NOT EXISTS archived_at timestamptz;
CREATE INDEX IF NOT EXISTS approvals_requester_archived_idx ON public.approvals (requester_id, archived_at);