-- Harmonise le parcours commercial : contrat signe a l'etape Client, sans etape Documents.
-- Seule l'offre Palme du Roi conserve une etape Parcelle avant le representant.
DO $$
BEGIN
  UPDATE public.offre_formulaire_etapes s
     SET actif = false,
         updated_at = now()
    FROM public.offres o
   WHERE s.offre_id = o.id
     AND o.actif = true
     AND s.code = 'documents';

  UPDATE public.offre_formulaire_etapes s
     SET configuration = coalesce(s.configuration, '{}'::jsonb)
       || jsonb_build_object('merge_contracts', true, 'merge_representant', false, 'merge_enquete', false),
         updated_at = now()
    FROM public.offres o
   WHERE s.offre_id = o.id
     AND o.actif = true
     AND s.code = 'client';

  UPDATE public.offre_formulaire_etapes s
     SET ordre = CASE
           WHEN upper(coalesce(o.famille_offre, '')) = 'PALMEDUROI'
             OR upper(coalesce(o.code, '')) LIKE '%PALMEDUROI%'
             OR lower(coalesce(o.nom, '')) LIKE '%palme du roi%'
           THEN 4 ELSE 3 END,
         updated_at = now()
    FROM public.offres o
   WHERE s.offre_id = o.id
     AND o.actif = true
     AND s.code = 'cotitulaire';

  UPDATE public.offre_formulaire_etapes s
     SET ordre = CASE
           WHEN upper(coalesce(o.famille_offre, '')) = 'PALMEDUROI'
             OR upper(coalesce(o.code, '')) LIKE '%PALMEDUROI%'
             OR lower(coalesce(o.nom, '')) LIKE '%palme du roi%'
           THEN 5 ELSE 4 END,
         updated_at = now()
    FROM public.offres o
   WHERE s.offre_id = o.id
     AND o.actif = true
     AND s.code = 'confirmation';

  UPDATE public.offre_formulaire_etapes s
     SET ordre = 3,
         actif = true,
         titre = 'Identification de la parcelle',
         updated_at = now()
    FROM public.offres o
   WHERE s.offre_id = o.id
     AND o.actif = true
     AND s.code = 'parcelle'
     AND (
       upper(coalesce(o.famille_offre, '')) = 'PALMEDUROI'
       OR upper(coalesce(o.code, '')) LIKE '%PALMEDUROI%'
       OR lower(coalesce(o.nom, '')) LIKE '%palme du roi%'
     );

  INSERT INTO public.offre_formulaire_etapes
    (offre_id, code, titre, ordre, obligatoire, actif, configuration)
  SELECT o.id, 'parcelle', 'Identification de la parcelle', 3, false, true, '{}'::jsonb
    FROM public.offres o
   WHERE o.actif = true
     AND (
       upper(coalesce(o.famille_offre, '')) = 'PALMEDUROI'
       OR upper(coalesce(o.code, '')) LIKE '%PALMEDUROI%'
       OR lower(coalesce(o.nom, '')) LIKE '%palme du roi%'
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.offre_formulaire_etapes s
        WHERE s.offre_id = o.id AND s.code = 'parcelle'
     );

  UPDATE public.offre_formulaire_contrats c
     SET obligatoire = true,
         updated_at = now()
    FROM public.offres o
   WHERE c.offre_id = o.id
     AND o.actif = true
     AND c.actif = true;
END;
$$;
