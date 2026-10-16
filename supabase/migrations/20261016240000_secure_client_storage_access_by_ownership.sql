CREATE OR REPLACE FUNCTION private.client_owns_storage_object(p_user_id uuid, p_bucket_id text, p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, storage
AS $$
  SELECT p_user_id = auth.uid() AND EXISTS (
    SELECT 1
    FROM public.clients c
    WHERE c.user_id = p_user_id
      AND (
        (p_bucket_id = 'portail-messages'
          AND p_name LIKE ('clients/' || c.id::text || '/messages/%'))
        OR
        (p_bucket_id IN ('documents', 'documents-fonciers')
          AND EXISTS (
            SELECT 1 FROM public.documents_acquisition d
            WHERE d.client_id = c.id
              AND d.fichier_url = p_name
              AND coalesce(d.metadata->>'storage_bucket', CASE WHEN d.categorie = 'souscription' THEN 'documents-fonciers' ELSE 'documents' END) = p_bucket_id
          ))
        OR
        (p_bucket_id = 'pieces-identite'
          AND (
            p_name IN (c.fichier_piece_url, c.fichier_piece_recto_url, c.fichier_piece_verso_url)
            OR EXISTS (
              SELECT 1 FROM public.client_cotitulaires_mandataires r
              WHERE r.client_id = c.id AND p_name IN (r.piece_recto_url, r.piece_verso_url, r.procuration_url)
            )
          ))
        OR
        (p_bucket_id = 'photos-profils'
          AND (
            p_name = c.photo_profil_url
            OR EXISTS (
              SELECT 1 FROM public.client_cotitulaires_mandataires r
              WHERE r.client_id = c.id AND p_name = r.photo_profil_url
            )
          ))
        OR
        (p_bucket_id = 'preuves-paiement'
          AND (p_name LIKE (c.id::text || '/%')
            OR EXISTS (SELECT 1 FROM public.paiements pa WHERE pa.client_id = c.id AND p_name LIKE (pa.id::text || '/%'))))
        OR
        (p_bucket_id = 'photos-plantations'
          AND (p_name LIKE (c.id::text || '/%')
            OR EXISTS (SELECT 1 FROM public.plantations p WHERE p.client_id = c.id AND p_name LIKE (p.id::text || '/%'))))
        OR
        (p_bucket_id = 'rapports-techniques'
          AND EXISTS (
            SELECT 1
            FROM public.rapports_visites_medias m
            JOIN public.rapports_visites_techniques r ON r.id = m.rapport_id
            WHERE r.client_id = c.id AND m.storage_path = p_name AND m.client_visible = true
          ))
      )
  );
$$;

REVOKE ALL ON FUNCTION private.client_owns_storage_object(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.client_owns_storage_object(uuid, text, text) TO authenticated;

DROP POLICY IF EXISTS "Clients read own portal attachments by ownership function" ON storage.objects;
CREATE POLICY "Clients read own portal attachments by ownership function"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'portail-messages' AND private.client_owns_storage_object(auth.uid(), bucket_id, name));

DROP POLICY IF EXISTS "Clients upload own portal attachments by ownership function" ON storage.objects;
CREATE POLICY "Clients upload own portal attachments by ownership function"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'portail-messages' AND private.client_owns_storage_object(auth.uid(), bucket_id, name));

DROP POLICY IF EXISTS "Clients read own documents by ownership function" ON storage.objects;
CREATE POLICY "Clients read own documents by ownership function"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id IN ('documents','documents-fonciers','pieces-identite','photos-profils','preuves-paiement','photos-plantations','rapports-techniques')
  AND private.client_owns_storage_object(auth.uid(), bucket_id, name));
