
CREATE POLICY "Owners can read VDNX probe screenshots"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'vdnx-probe-screenshots' AND public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Owners can upload VDNX probe screenshots"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'vdnx-probe-screenshots' AND public.has_role(auth.uid(), 'owner'));
