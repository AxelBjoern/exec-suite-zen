CREATE TABLE public.ceo_chat_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ceo_chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read ceo chat" ON public.ceo_chat_messages FOR SELECT USING (true);
CREATE POLICY "Anyone can write ceo chat" ON public.ceo_chat_messages FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can clear ceo chat" ON public.ceo_chat_messages FOR DELETE USING (true);
CREATE INDEX idx_ceo_chat_created ON public.ceo_chat_messages(created_at);