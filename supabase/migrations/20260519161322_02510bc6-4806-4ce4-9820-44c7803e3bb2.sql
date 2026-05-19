CREATE TABLE public.ceo_conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL DEFAULT 'New conversation',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.ceo_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read ceo conversations" ON public.ceo_conversations FOR SELECT USING (true);
CREATE POLICY "Anyone can write ceo conversations" ON public.ceo_conversations FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update ceo conversations" ON public.ceo_conversations FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete ceo conversations" ON public.ceo_conversations FOR DELETE USING (true);

ALTER TABLE public.ceo_chat_messages ADD COLUMN conversation_id UUID REFERENCES public.ceo_conversations(id) ON DELETE CASCADE;
CREATE INDEX idx_ceo_chat_messages_conversation ON public.ceo_chat_messages(conversation_id, created_at);

-- Backfill: create one conversation for existing orphan messages, if any
DO $$
DECLARE
  v_id UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM public.ceo_chat_messages WHERE conversation_id IS NULL) THEN
    INSERT INTO public.ceo_conversations (title) VALUES ('Previous conversation') RETURNING id INTO v_id;
    UPDATE public.ceo_chat_messages SET conversation_id = v_id WHERE conversation_id IS NULL;
  END IF;
END $$;