CREATE TABLE public.ceo_chat_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid REFERENCES public.ceo_chat_messages(id) ON DELETE CASCADE,
  filename text NOT NULL,
  mime_type text NOT NULL,
  size_bytes integer NOT NULL,
  storage_path text NOT NULL,
  extracted_text text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ceo_chat_attachments_message ON public.ceo_chat_attachments(message_id);

ALTER TABLE public.ceo_chat_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read ceo chat attachments"
  ON public.ceo_chat_attachments FOR SELECT USING (true);

CREATE POLICY "Anyone can write ceo chat attachments"
  ON public.ceo_chat_attachments FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can delete ceo chat attachments"
  ON public.ceo_chat_attachments FOR DELETE USING (true);

INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-uploads', 'chat-uploads', false)
ON CONFLICT (id) DO NOTHING;