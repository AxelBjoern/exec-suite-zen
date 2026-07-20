
ALTER TABLE public.swarm_drafts
  ADD COLUMN IF NOT EXISTS attempted_models text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS used_fallback boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS primary_error text;

ALTER TABLE public.base_models
  ADD COLUMN IF NOT EXISTS supports_tools boolean NOT NULL DEFAULT true;
