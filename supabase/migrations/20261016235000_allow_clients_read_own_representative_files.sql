DROP POLICY IF EXISTS "Clients read own representative identity files" ON storage.objects;
CREATE POLICY "Clients read own representative identity files"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'pieces-identite'
  AND EXISTS (
    SELECT 1
    FROM public.client_cotitulaires_mandataires r
    JOIN public.clients c ON c.id = r.client_id
    WHERE c.user_id = (SELECT auth.uid())
      AND objects.name IN (r.piece_recto_url, r.piece_verso_url, r.procuration_url)
  )
);

DROP POLICY IF EXISTS "Clients read own representative profile photos" ON storage.objects;
CREATE POLICY "Clients read own representative profile photos"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'photos-profils'
  AND EXISTS (
    SELECT 1
    FROM public.client_cotitulaires_mandataires r
    JOIN public.clients c ON c.id = r.client_id
    WHERE c.user_id = (SELECT auth.uid())
      AND r.photo_profil_url = objects.name
  )
);
