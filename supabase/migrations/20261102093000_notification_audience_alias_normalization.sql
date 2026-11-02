-- AgriCapital 360 — normalisation des audiences de notification
-- Migration additive/idempotente : ne supprime aucune campagne, audience ni livraison.
-- Corrige les alias d'audience historiques et évite les doublons de parties CRM liées.

CREATE OR REPLACE FUNCTION public.notification_resolve_recipients(_criteres jsonb DEFAULT '{}'::jsonb)
RETURNS TABLE(
  source_type text,
  source_id uuid,
  user_id uuid,
  nom_complet text,
  email text,
  telephone text,
  role_code text,
  offre_id uuid,
  offre_code text,
  offre_nom text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
WITH criteria AS (
  SELECT
    lower(trim(coalesce(_criteres->>'audience', 'tous'))) AS audience,
    nullif(trim(_criteres->>'offer_code'), '') AS offer_code,
    nullif(trim(_criteres->>'role_code'), '') AS role_code,
    nullif(_criteres->>'has_email', '')::boolean AS has_email,
    nullif(_criteres->>'has_phone', '')::boolean AS has_phone
),
contacts AS (
  SELECT
    'equipe'::text AS source_type,
    p.id AS source_id,
    p.user_id,
    p.nom_complet,
    p.email,
    coalesce(nullif(trim(p.telephone), ''), nullif(trim(p.whatsapp), '')) AS telephone,
    ur.role AS role_code,
    NULL::uuid AS offre_id,
    NULL::text AS offre_code,
    NULL::text AS offre_nom
  FROM public.profiles p
  JOIN LATERAL (
    SELECT r.role
    FROM public.user_roles r
    WHERE r.user_id = p.user_id
    ORDER BY
      CASE WHEN r.role IN ('commercial','responsable_commercial','chef_equipe_commercial') THEN 0 ELSE 1 END,
      r.is_primary DESC NULLS LAST,
      r.created_at ASC
    LIMIT 1
  ) ur ON true
  WHERE coalesce(p.actif, true) AND p.user_id IS NOT NULL

  UNION ALL

  SELECT
    'client'::text,
    c.id,
    c.user_id,
    coalesce(nullif(c.nom_complet,''), concat_ws(' ', c.prenoms, c.nom_famille)),
    c.email,
    coalesce(nullif(trim(c.telephone),''), nullif(trim(c.whatsapp),'')),
    NULL::text,
    c.offre_id,
    coalesce(nullif(c.offre_code,''), o.code),
    coalesce(nullif(c.offre_nom,''), o.nom)
  FROM public.clients c
  LEFT JOIN public.offres o ON o.id = c.offre_id
  WHERE c.type_client IN ('client','avec_terre')
    AND c.proprietaire_id IS NULL
    AND coalesce(c.is_internal,false) = false
    AND coalesce(c.statut_global,'actif') NOT IN ('archive','supprime')
    AND coalesce(c.compte_actif,true)

  UNION ALL

  SELECT
    'proprietaire_foncier'::text,
    p.id,
    NULL::uuid,
    p.nom_complet,
    p.email,
    coalesce(nullif(trim(p.telephone),''), nullif(trim(p.whatsapp),'')),
    NULL::text,
    NULL::uuid,
    NULL::text,
    NULL::text
  FROM public.proprietaires_terres p
  WHERE coalesce(p.statut,'actif') NOT IN ('archive','supprime')

  UNION ALL

  SELECT
    'beneficiaire_particulier'::text,
    c.id,
    c.user_id,
    coalesce(nullif(c.nom_complet,''), concat_ws(' ', c.prenoms, c.nom_famille)),
    c.email,
    coalesce(nullif(trim(c.telephone),''), nullif(trim(c.whatsapp),'')),
    NULL::text,
    NULL::uuid,
    NULL::text,
    NULL::text
  FROM public.clients c
  WHERE c.type_client = 'beneficiaire_particulier'
    AND coalesce(c.statut_global,'actif') NOT IN ('archive','supprime')
    AND coalesce(c.compte_actif,true)

  UNION ALL

  SELECT
    'prospect'::text,
    l.id,
    NULL::uuid,
    concat_ws(' ', nullif(l.prenoms,''), nullif(l.nom,'')),
    l.email,
    coalesce(nullif(trim(l.whatsapp),''), nullif(trim(l.telephone),'')),
    NULL::text,
    o.id,
    l.offre_code,
    o.nom
  FROM public.leads l
  LEFT JOIN public.offres o ON lower(o.code) = lower(l.offre_code)
  WHERE l.etape_pipeline = 'prospect'
    AND coalesce(l.statut,'') NOT IN ('converti','converti_client','archive','supprime')
    AND l.client_id IS NULL
    AND l.proprietaire_id IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.crm_party_links a
      JOIN public.crm_party_links b ON b.party_id = a.party_id
      WHERE a.module_code = 'leads'
        AND a.record_id = l.id
        AND b.module_code IN ('clients','proprietaires_terres')
    )

  UNION ALL

  SELECT
    'lead'::text,
    l.id,
    NULL::uuid,
    concat_ws(' ', nullif(l.prenoms,''), nullif(l.nom,'')),
    l.email,
    coalesce(nullif(trim(l.whatsapp),''), nullif(trim(l.telephone),'')),
    NULL::text,
    o.id,
    l.offre_code,
    o.nom
  FROM public.leads l
  LEFT JOIN public.offres o ON lower(o.code) = lower(l.offre_code)
  WHERE coalesce(l.etape_pipeline,'lead') <> 'prospect'
    AND coalesce(l.statut,'') NOT IN ('converti','converti_client','archive','supprime')
    AND l.client_id IS NULL
    AND l.proprietaire_id IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.crm_party_links a
      JOIN public.crm_party_links b ON b.party_id = a.party_id
      WHERE a.module_code = 'leads'
        AND a.record_id = l.id
        AND b.module_code IN ('clients','proprietaires_terres')
    )
)
SELECT c.*
FROM contacts c
CROSS JOIN criteria f
WHERE
  (
    f.audience IN ('tous','all','all_contacts','everyone')
    OR (f.audience IN ('clients','client','customers') AND c.source_type = 'client')
    OR (f.audience IN ('leads','lead') AND c.source_type = 'lead')
    OR (f.audience IN ('prospects','prospect') AND c.source_type = 'prospect')
    OR (f.audience IN ('equipe','equipe_interne','staff','team','personnel') AND c.source_type = 'equipe')
    OR (f.audience IN ('commerciaux','sales_team') AND c.source_type = 'equipe'
        AND c.role_code IN ('commercial','responsable_commercial','chef_equipe_commercial'))
    OR (f.audience IN ('palminvest','palm-invest') AND lower(coalesce(c.offre_code,'')) IN ('palm-invest','palminvest'))
    OR (f.audience IN ('terrapalm','terra-palm') AND lower(coalesce(c.offre_code,'')) IN ('terra-palm','terrapalm'))
    OR (f.audience = 'palmterroir' AND lower(coalesce(c.offre_code,'')) = 'palmterroir')
    OR (f.audience IN ('proprietaires_fonciers','proprietaires_foncier','owners') AND c.source_type = 'proprietaire_foncier')
    OR (f.audience IN ('beneficiaires_particuliers','beneficiaire_particulier','beneficiaries') AND c.source_type = 'beneficiaire_particulier')
  )
  AND (f.offer_code IS NULL OR lower(coalesce(c.offre_code,'')) = lower(f.offer_code))
  AND (f.role_code IS NULL OR c.role_code = f.role_code)
  AND (f.has_email IS NULL OR (f.has_email AND nullif(trim(c.email),'') IS NOT NULL) OR (NOT f.has_email AND nullif(trim(c.email),'') IS NULL))
  AND (f.has_phone IS NULL OR (f.has_phone AND nullif(trim(c.telephone),'') IS NOT NULL) OR (NOT f.has_phone AND nullif(trim(c.telephone),'') IS NULL));
$function$;

COMMENT ON FUNCTION public.notification_resolve_recipients(jsonb) IS
  'Résout les audiences CRM de notification en acceptant les alias historiques. La fonction ne déclenche aucun envoi et ne modifie aucune donnée.';
