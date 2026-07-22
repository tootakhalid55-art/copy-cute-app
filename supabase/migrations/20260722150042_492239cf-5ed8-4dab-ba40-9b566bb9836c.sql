
-- Storage RLS: files are stored under path `{org_id}/...` and access is limited to org members.
-- Applies to buckets: documents, attachments, inbox, backups, branding

CREATE POLICY "org members read files" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id IN ('documents','attachments','inbox','backups','branding')
    AND public.is_org_member((storage.foldername(name))[1]::uuid, auth.uid())
  );

CREATE POLICY "org members upload files" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id IN ('documents','attachments','inbox','backups','branding')
    AND public.is_org_member((storage.foldername(name))[1]::uuid, auth.uid())
  );

CREATE POLICY "org members update files" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id IN ('documents','attachments','inbox','backups','branding')
    AND public.is_org_member((storage.foldername(name))[1]::uuid, auth.uid())
  );

CREATE POLICY "org members delete files" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id IN ('documents','attachments','inbox','backups','branding')
    AND public.is_org_member((storage.foldername(name))[1]::uuid, auth.uid())
  );
