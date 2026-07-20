ALTER TABLE public.swarm_drafts
  ADD COLUMN IF NOT EXISTS confidence numeric,
  ADD COLUMN IF NOT EXISTS rationale text;