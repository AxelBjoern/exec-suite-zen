INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-documents', 'chat-documents', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DO $$ BEGIN
  CREATE POLICY "Public read chat-documents" ON storage.objects FOR SELECT USING (bucket_id = 'chat-documents');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Public write chat-documents" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'chat-documents');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;