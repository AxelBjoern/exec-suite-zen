
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS swarm_agents jsonb;
ALTER TABLE public.swarm_drafts ADD COLUMN IF NOT EXISTS role text;
ALTER TABLE public.swarm_drafts ADD COLUMN IF NOT EXISTS role_label text;
