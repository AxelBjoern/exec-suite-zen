
ALTER TABLE public.ceo_chat_messages
  ADD COLUMN IF NOT EXISTS model_used text,
  ADD COLUMN IF NOT EXISTS latency_ms integer,
  ADD COLUMN IF NOT EXISTS tokens_in integer,
  ADD COLUMN IF NOT EXISTS tokens_out integer;

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS chat_mode text NOT NULL DEFAULT 'single',
  ADD COLUMN IF NOT EXISTS enable_artifacts_panel boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS enable_projects boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS enable_tool_steps boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS enable_vision boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS enable_compaction boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS chat_experimental boolean NOT NULL DEFAULT false;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_settings_chat_mode_check'
  ) THEN
    ALTER TABLE public.user_settings
      ADD CONSTRAINT user_settings_chat_mode_check
      CHECK (chat_mode IN ('single','swarm','auto'));
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
