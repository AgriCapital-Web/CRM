CREATE OR REPLACE FUNCTION public.notification_resolve_recipients(_criteres jsonb DEFAULT '{}'::jsonb)
RETURNS TABLE(source_type text, source_id uuid, user_id uuid, nom_complet text, email text, telephone text, role_code text, offre_id uuid, offre_code text, offre_nom text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
WITH contacts(source_type,source_id,user_id,nom_complet,email,telephone,role_code,offre_id,offre_code,offre_nom) AS (
  SELECT 'equipe',p.id,p.user_id,p.nom_complet,p.email,COALESCE(p.telephone,p.whatsapp),ur.role,NULL::uuid,NULL::text,NULL::text
  FROM public.profiles p
  LEFT JOIN LATERAL (SELECT r.role FROM public.user_roles r WHERE r.user_id=p.user_id ORDER BY r.created_at LIMIT 1) ur ON true
  WHERE COALESCE(p.actif,true) AND public.is_staff(p.user_id)
  UNION ALL
  SELECT CASE
      WHEN c.proprietaire_id IS NOT NULL AND c.type_client='beneficiaire_particulier' THEN 'proprietaire_foncier+beneficiaire_particulier'
      WHEN c.proprietaire_id IS NOT NULL THEN 'proprietaire_foncier'
      WHEN c.type_client='beneficiaire_particulier' THEN 'beneficiaire_particulier'
      ELSE 'client' END,
    c.id,c.user_id,COALESCE(NULLIF(c.nom_complet,''),concat_ws(' ',c.prenoms,c.nom_famille)),
    c.email,COALESCE(c.telephone,c.whatsapp),NULL::text,c.offre_id,o.code,o.nom
  FROM public.clients c LEFT JOIN public.offres o ON o.id=c.offre_id
  WHERE COALESCE(c.statut_global,'actif') NOT IN ('archive','supprime') AND COALESCE(c.compte_actif,true)
  UNION ALL
  SELECT 'prospect',l.id,NULL::uuid,concat_ws(' ',NULLIF(l.prenoms,''),NULLIF(l.nom,'')),
    l.email,COALESCE(NULLIF(l.whatsapp,''),l.telephone),NULL::text,o.id,l.offre_code,o.nom
  FROM public.leads l
  LEFT JOIN public.offres o ON lower(o.code)=lower(l.offre_code)
  WHERE l.etape_pipeline='prospect'
    AND COALESCE(l.statut,'') NOT IN ('converti','converti_client','archive','supprime')
    AND l.client_id IS NULL
)
SELECT c.* FROM contacts c
WHERE (
  COALESCE(_criteres->>'audience','tous') IN ('tous','all')
  OR (COALESCE(_criteres->>'audience','') IN ('clients','client') AND c.source_type='client')
  OR (COALESCE(_criteres->>'audience','') IN ('prospects','prospect') AND c.source_type='prospect')
  OR (COALESCE(_criteres->>'audience','') IN ('proprietaires_fonciers','proprietaire_foncier','owners') AND c.source_type LIKE 'proprietaire_foncier%')
  OR (COALESCE(_criteres->>'audience','') IN ('beneficiaires_particuliers','beneficiaire_particulier','beneficiaries') AND c.source_type LIKE '%beneficiaire_particulier%')
  OR (COALESCE(_criteres->>'audience','') IN ('equipe','equipe_interne','staff','team') AND c.source_type='equipe')
  OR (COALESCE(_criteres->>'audience','')='commerciaux' AND c.role_code IN ('commercial','responsable_commercial','chef_equipe_commercial'))
  OR (COALESCE(_criteres->>'audience','')='palminvest' AND lower(COALESCE(c.offre_code,''))='palm-invest')
  OR (COALESCE(_criteres->>'audience','')='terrapalm' AND lower(COALESCE(c.offre_code,''))='terra-palm')
  OR (COALESCE(_criteres->>'audience','')='palmterroir' AND lower(COALESCE(c.offre_code,''))='palmterroir')
)
AND (NULLIF(_criteres->>'offer_code','') IS NULL OR lower(COALESCE(c.offre_code,''))=lower(_criteres->>'offer_code'))
AND (NULLIF(_criteres->>'role_code','') IS NULL OR c.role_code=_criteres->>'role_code')
AND (NULLIF(_criteres->>'has_email','') IS NULL OR CASE WHEN (_criteres->>'has_email')::boolean THEN NULLIF(trim(c.email),'') IS NOT NULL ELSE NULLIF(trim(c.email),'') IS NULL END)
AND (NULLIF(_criteres->>'has_phone','') IS NULL OR CASE WHEN (_criteres->>'has_phone')::boolean THEN NULLIF(trim(c.telephone),'') IS NOT NULL ELSE NULLIF(trim(c.telephone),'') IS NULL END);
$function$;
