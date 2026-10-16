-- Let authenticated client accounts read only files explicitly linked to their own client record.
DROP POLICY IF EXISTS "Clients read own acquisition files in documents bucket" ON storage.objects;
CREATE POLICY "Clients read own acquisition files in documents bucket"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'documents'
  AND EXISTS (
    SELECT 1
    FROM public.documents_acquisition d
    JOIN public.clients c ON c.id = d.client_id
    WHERE c.user_id = (SELECT auth.uid())
      AND d.fichier_url = objects.name
      AND coalesce(d.metadata->>'storage_bucket', CASE WHEN d.categorie = 'souscription' THEN 'documents-fonciers' ELSE 'documents' END) = 'documents'
  )
);

DROP POLICY IF EXISTS "Clients read own acquisition files in land bucket" ON storage.objects;
CREATE POLICY "Clients read own acquisition files in land bucket"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'documents-fonciers'
  AND EXISTS (
    SELECT 1
    FROM public.documents_acquisition d
    JOIN public.clients c ON c.id = d.client_id
    WHERE c.user_id = (SELECT auth.uid())
      AND d.fichier_url = objects.name
      AND coalesce(d.metadata->>'storage_bucket', CASE WHEN d.categorie = 'souscription' THEN 'documents-fonciers' ELSE 'documents' END) = 'documents-fonciers'
  )
);

DROP POLICY IF EXISTS "Clients read own client identity files" ON storage.objects;
CREATE POLICY "Clients read own client identity files"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'pieces-identite'
  AND EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.user_id = (SELECT auth.uid())
      AND objects.name IN (c.fichier_piece_url, c.fichier_piece_recto_url, c.fichier_piece_verso_url)
  )
);

DROP POLICY IF EXISTS "Clients read own client profile photos" ON storage.objects;
CREATE POLICY "Clients read own client profile photos"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'photos-profils'
  AND EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.user_id = (SELECT auth.uid())
      AND c.photo_profil_url = objects.name
  )
);
