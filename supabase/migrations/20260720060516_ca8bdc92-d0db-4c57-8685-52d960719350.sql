
-- Part 1: swarm_eligible flag on base_models
ALTER TABLE public.base_models
  ADD COLUMN IF NOT EXISTS swarm_eligible boolean NOT NULL DEFAULT false;

-- Backfill: all 7 text system models eligible (Kling not in table; if added later stays false)
UPDATE public.base_models
SET swarm_eligible = true
WHERE is_system = true
  AND slug IN (
    'nousresearch/hermes-4-405b',
    'x-ai/grok-4.3',
    'openai/gpt-5.3-chat',
    'anthropic/claude-opus-4.7',
    'deepseek/deepseek-v4-pro',
    'deepseek/deepseek-v4-flash'
  );

-- Part 2: channel columns on leads + lead_replies
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS channel text,
  ADD COLUMN IF NOT EXISTS external_chat_id text,
  ADD COLUMN IF NOT EXISTS owner_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS leads_channel_chat_key
  ON public.leads (channel, external_chat_id)
  WHERE channel IS NOT NULL;

ALTER TABLE public.lead_replies
  ADD COLUMN IF NOT EXISTS channel text,
  ADD COLUMN IF NOT EXISTS external_message_id text,
  ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT 'in';

CREATE UNIQUE INDEX IF NOT EXISTS lead_replies_channel_msg_key
  ON public.lead_replies (channel, external_message_id)
  WHERE external_message_id IS NOT NULL;

-- channel_bindings: link a Telegram/WhatsApp chat to a VDNX user
CREATE TABLE IF NOT EXISTS public.channel_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel text NOT NULL,
  external_chat_id text,
  link_code text,
  link_expires_at timestamptz,
  verified_at timestamptz,
  auto_reply boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS channel_bindings_chat_key
  ON public.channel_bindings (channel, external_chat_id)
  WHERE external_chat_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS channel_bindings_code_key
  ON public.channel_bindings (link_code)
  WHERE link_code IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.channel_bindings TO authenticated;
GRANT ALL ON public.channel_bindings TO service_role;

ALTER TABLE public.channel_bindings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "channel_bindings owner all"
  ON public.channel_bindings
  FOR ALL
  TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE TRIGGER channel_bindings_set_updated_at
  BEFORE UPDATE ON public.channel_bindings
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
