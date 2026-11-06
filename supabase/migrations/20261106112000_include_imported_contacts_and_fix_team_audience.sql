CREATE OR REPLACE FUNCTION public.notification_resolve_recipients(_criteres jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(source_type text, source_id uuid, user_id uuid, nom_complet text, email text, telephone text, role_code text, offre_id uuid, offre_code text, offre_nom text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
WITH criteria AS (SELECT lower(trim(coalesce(_criteres->>'audience','tous'))) audience),
contacts(source_type,source_id,user_id,nom_complet,email,telephone,role_code,offre_id,offre_code,offre_nom) AS (
 SELECT CASE WHEN ur.role IS NOT NULL AND lower(ur.role) NOT IN ('client','customer','utilisateur','user','beneficiaire') THEN 'equipe' ELSE 'utilisateur' END,p.id,p.user_id,
  COALESCE(NULLIF(trim(p.nom_complet),''),concat_ws(' ',p.prenoms,p.nom)),p.email,
  COALESCE(NULLIF(trim(p.telephone),''),NULLIF(trim(p.whatsapp),''),NULLIF(trim(p.telephone_secondaire),'')),
  ur.role,NULL::uuid,NULL::text,NULL::text
 FROM public.profiles p LEFT JOIN LATERAL (SELECT r.role FROM public.user_roles r WHERE r.user_id=p.user_id ORDER BY r.created_at LIMIT 1) ur ON true
 WHERE COALESCE(p.actif,true)
 UNION ALL
 SELECT CASE WHEN c.proprietaire_id IS NOT NULL AND c.type_client='beneficiaire_particulier' THEN 'proprietaire_foncier+beneficiaire_particulier'
  WHEN c.proprietaire_id IS NOT NULL THEN 'proprietaire_foncier' WHEN c.type_client='beneficiaire_particulier' THEN 'beneficiaire_particulier' ELSE 'client' END,
  c.id,c.user_id,COALESCE(NULLIF(trim(c.nom_complet),''),concat_ws(' ',c.prenoms,c.nom)),c.email,
  COALESCE(NULLIF(trim(c.telephone),''),NULLIF(trim(c.whatsapp),''),NULLIF(trim(c.telephone_secondaire),'')),
  NULL::text,c.offre_id,o.code,o.nom
 FROM public.clients c LEFT JOIN public.offres o ON o.id=c.offre_id
 WHERE COALESCE(c.statut_global,'actif') NOT IN ('archive','supprime') AND COALESCE(c.statut,'actif') NOT IN ('archive','supprime')
 UNION ALL
 SELECT 'prospect',p.id,NULL::uuid,COALESCE(NULLIF(trim(p.nom_complet),''),concat_ws(' ',p.prenoms,p.nom)),p.email,
  COALESCE(NULLIF(trim(p.telephone),''),NULLIF(trim(p.whatsapp),''),NULLIF(trim(p.telephone_secondaire),'')),
  NULL::text,NULL::uuid,p.offre_code,o.nom
 FROM public.prospects p LEFT JOIN public.offres o ON lower(o.code)=lower(p.offre_code)
 WHERE COALESCE(p.statut,'') NOT IN ('converti','converti_client','archive','supprime') AND p.client_id IS NULL
 UNION ALL
 SELECT 'lead',l.id,NULL::uuid,COALESCE(NULLIF(trim(l.nom_complet),''),concat_ws(' ',l.prenoms,l.nom)),l.email,
  COALESCE(NULLIF(trim(l.telephone),''),NULLIF(trim(l.whatsapp),''),NULLIF(trim(l.telephone_secondaire),'')),
  NULL::text,o.id,l.offre_code,o.nom
 FROM public.leads l LEFT JOIN public.offres o ON lower(o.code)=lower(l.offre_code)
 WHERE COALESCE(l.etape_pipeline,'lead')<>'prospect' AND COALESCE(l.statut,'') NOT IN ('converti','converti_client','archive','supprime') AND l.client_id IS NULL
 UNION ALL
 SELECT 'proprietaire_foncier',p.id,NULL::uuid,COALESCE(NULLIF(trim(p.nom_complet),''),NULLIF(trim(p.denomination_sociale),''),concat_ws(' ',p.prenoms,p.nom)),p.email,
  COALESCE(NULLIF(trim(p.telephone),''),NULLIF(trim(p.whatsapp),''),NULLIF(trim(p.telephone_secondaire),'')),
  NULL::text,NULL::uuid,NULL::text,NULL::text
 FROM public.proprietaires_terres p WHERE COALESCE(p.statut,'actif') NOT IN ('archive','supprime','inactif')
 UNION ALL
 SELECT 'cotitulaire_proprietaire',m.id,NULL::uuid,concat_ws(' ',m.prenoms,m.nom),NULL::text,
  COALESCE(NULLIF(trim(m.telephone),''),NULLIF(trim(m.whatsapp),'')),NULL::text,NULL::uuid,NULL::text,NULL::text
 FROM public.cotitulaires_mandataires m
 UNION ALL
 SELECT 'cotitulaire_client',m.id,NULL::uuid,concat_ws(' ',m.prenoms,m.nom),m.email,
  COALESCE(NULLIF(trim(m.telephone),''),NULLIF(trim(m.whatsapp),'')),NULL::text,NULL::uuid,NULL::text,NULL::text
 FROM public.client_cotitulaires_mandataires m WHERE COALESCE(m.actif,true)
 UNION ALL
 SELECT 'autre',p.id,NULL::uuid,COALESCE(NULLIF(trim(p.nom_complet),''),NULLIF(trim(p.denomination_sociale),''),concat_ws(' ',p.prenoms,p.nom)),p.email,
  COALESCE(NULLIF(trim(p.telephone),''),NULLIF(trim(p.whatsapp),''),NULLIF(trim(p.telephone_secondaire),'')),
  NULL::text,NULL::uuid,NULL::text,NULL::text
 FROM public.crm_parties p
 UNION ALL
 SELECT 'contact_importe',i.id,i.user_id,concat_ws(' ',i.prenoms,i.nom),i.email,COALESCE(NULLIF(trim(i.phone),''),NULLIF(trim(i.secondary_phone),'')),NULL::text,NULL::uuid,NULL::text,NULL::text FROM public.imported_phone_contacts i WHERE i.selected IS TRUE AND i.status='pending'
)
SELECT c.* FROM contacts c CROSS JOIN criteria f
WHERE (
 f.audience IN ('tous','all','all_contacts','everyone')
 OR (f.audience IN ('clients','client','customers') AND c.source_type='client')
 OR (f.audience IN ('leads','lead') AND c.source_type='lead')
 OR (f.audience IN ('prospects','prospect') AND c.source_type='prospect')
 OR (f.audience IN ('proprietaires_fonciers','proprietaire_foncier','owners') AND c.source_type LIKE 'proprietaire_foncier%')
 OR (f.audience IN ('beneficiaires_particuliers','beneficiaire_particulier','beneficiaries') AND c.source_type LIKE '%beneficiaire_particulier%')
 OR (f.audience IN ('equipe','equipe_interne','staff','team','personnel') AND c.source_type='equipe')
 OR (f.audience IN ('utilisateurs','utilisateur','users') AND c.source_type IN ('utilisateur','equipe'))
 OR (f.audience IN ('autres','autre','others') AND c.source_type IN ('autre','cotitulaire_proprietaire','cotitulaire_client','contact_importe'))
 OR (f.audience IN ('commerciaux','sales_team') AND c.role_code IN ('commercial','responsable_commercial','chef_equipe_commercial'))
 OR (f.audience IN ('palminvest','palm-invest') AND lower(coalesce(c.offre_code,'')) IN ('palm-invest','palminvest'))
 OR (f.audience IN ('terrapalm','terra-palm') AND lower(coalesce(c.offre_code,'')) IN ('terra-palm','terrapalm'))
 OR (f.audience='palmterroir' AND lower(coalesce(c.offre_code,''))='palmterroir')
)
AND (NULLIF(_criteres->>'offer_code','') IS NULL OR lower(coalesce(c.offre_code,''))=lower(_criteres->>'offer_code'))
AND (NULLIF(_criteres->>'role_code','') IS NULL OR c.role_code=_criteres->>'role_code')
AND (NULLIF(_criteres->>'has_email','') IS NULL OR CASE WHEN (_criteres->>'has_email')::boolean THEN NULLIF(trim(c.email),'') IS NOT NULL ELSE NULLIF(trim(c.email),'') IS NULL END)
AND (NULLIF(_criteres->>'has_phone','') IS NULL OR CASE WHEN (_criteres->>'has_phone')::boolean THEN NULLIF(trim(c.telephone),'') IS NOT NULL ELSE NULLIF(trim(c.telephone),'') IS NULL END);
$function$
