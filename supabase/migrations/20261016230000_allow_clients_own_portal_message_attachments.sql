-- Allow a portal client to upload/read only attachments inside their own client folder.
DROP POLICY IF EXISTS "Clients upload own portal message attachments" ON storage.objects;
CREATE POLICY "Clients upload own portal message attachments"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'portail-messages'
  AND (storage.foldername(name))[1] = 'clients'
  AND EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id::text = (storage.foldername(name))[2]
      AND c.user_id = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS "Clients read own portal message attachments" ON storage.objects;
CREATE POLICY "Clients read own portal message attachments"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'portail-messages'
  AND (storage.foldername(name))[1] = 'clients'
  AND EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.id::text = (storage.foldername(name))[2]
      AND c.user_id = (SELECT auth.uid())
  )
);
