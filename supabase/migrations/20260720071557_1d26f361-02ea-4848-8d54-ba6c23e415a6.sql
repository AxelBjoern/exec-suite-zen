ALTER TABLE public.ceo_chat_messages ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE public.ceo_conversations ADD COLUMN IF NOT EXISTS user_id UUID;
CREATE INDEX IF NOT EXISTS idx_ceo_chat_messages_user ON public.ceo_chat_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_ceo_conversations_user ON public.ceo_conversations(user_id);
NOTIFY pgrst, 'reload schema';