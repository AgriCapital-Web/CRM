
UPDATE public.notification_automations SET actif=false,updated_at=now() WHERE code IN ('client_echeance_auto','client_retard_auto');
UPDATE public.notification_automations SET canal='whatsapp',cooldown_minutes=0,actif=true,updated_at=now() WHERE code IN ('paiement_echeance_client','paiement_retard_client');
CREATE OR REPLACE FUNCTION public.notification_resolve_recipients(_criteres jsonb DEFAULT '{}'::jsonb)
RETURNS TABLE(source_type text,source_id uuid,user_id uuid,nom_complet text,email text,telephone text,role_code text,offre_id uuid,offre_code text,offre_nom text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
WITH contacts(source_type,source_id,user_id,nom_complet,email,telephone,role_code,offre_id,offre_code,offre_nom) AS (
 SELECT 'equipe'::text,p.id,p.user_id,p.nom_complet,p.email,COALESCE(p.telephone,p.whatsapp),ur.role,NULL::uuid,NULL::text,NULL::text
 FROM public.profiles p
 JOIN LATERAL (SELECT r.role FROM public.user_roles r WHERE r.user_id=p.user_id
   ORDER BY CASE WHEN r.role IN ('commercial','responsable_commercial','chef_equipe_commercial') THEN 0 ELSE 1 END,
   r.is_primary DESC NULLS LAST,r.created_at ASC LIMIT 1) ur ON true
 WHERE COALESCE(p.actif,true) AND p.user_id IS NOT NULL
 UNION ALL
 SELECT 'client',c.id,c.user_id,COALESCE(NULLIF(c.nom_complet,''),concat_ws(' ',c.prenoms,c.nom_famille)),
   c.email,COALESCE(c.telephone,c.whatsapp),NULL::text,c.offre_id,
   COALESCE(NULLIF(c.offre_code,''),o.code),COALESCE(NULLIF(c.offre_nom,''),o.nom)
 FROM public.clients c LEFT JOIN public.offres o ON o.id=c.offre_id
 WHERE c.type_client IN ('client','avec_terre') AND c.proprietaire_id IS NULL
   AND COALESCE(c.is_internal,false)=false AND COALESCE(c.statut_global,'actif') NOT IN ('archive','supprime')
   AND COALESCE(c.compte_actif,true)
 UNION ALL
 SELECT 'proprietaire_foncier',p.id,NULL::uuid,p.nom_complet,p.email,COALESCE(p.telephone,p.whatsapp),
   NULL::text,NULL::uuid,NULL::text,NULL::text
 FROM public.proprietaires_terres p WHERE COALESCE(p.statut,'actif') NOT IN ('archive','supprime')
 UNION ALL
 SELECT 'beneficiaire_particulier',c.id,c.user_id,COALESCE(NULLIF(c.nom_complet,''),concat_ws(' ',c.prenoms,c.nom_famille)),
   c.email,COALESCE(c.telephone,c.whatsapp),NULL::text,NULL::uuid,NULL::text,NULL::text
 FROM public.clients c WHERE c.type_client='beneficiaire_particulier'
   AND COALESCE(c.statut_global,'actif') NOT IN ('archive','supprime') AND COALESCE(c.compte_actif,true)
 UNION ALL
 SELECT 'prospect',l.id,NULL::uuid,concat_ws(' ',NULLIF(l.prenoms,''),NULLIF(l.nom,'')),l.email,
   COALESCE(NULLIF(l.whatsapp,''),l.telephone),NULL::text,o.id,l.offre_code,o.nom
 FROM public.leads l LEFT JOIN public.offres o ON lower(o.code)=lower(l.offre_code)
 WHERE l.etape_pipeline='prospect' AND COALESCE(l.statut,'') NOT IN ('converti','converti_client','archive','supprime')
   AND l.client_id IS NULL AND l.proprietaire_id IS NULL
   AND NOT EXISTS (SELECT 1 FROM public.crm_party_links a JOIN public.crm_party_links b ON b.party_id=a.party_id
     WHERE a.module_code='leads' AND a.record_id=l.id AND b.module_code IN ('clients','proprietaires_terres'))
 UNION ALL
 SELECT 'lead',l.id,NULL::uuid,concat_ws(' ',NULLIF(l.prenoms,''),NULLIF(l.nom,'')),l.email,
   COALESCE(NULLIF(l.whatsapp,''),l.telephone),NULL::text,o.id,l.offre_code,o.nom
 FROM public.leads l LEFT JOIN public.offres o ON lower(o.code)=lower(l.offre_code)
 WHERE COALESCE(l.etape_pipeline,'lead')<>'prospect' AND COALESCE(l.statut,'') NOT IN ('converti','converti_client','archive','supprime')
   AND l.client_id IS NULL AND l.proprietaire_id IS NULL
   AND NOT EXISTS (SELECT 1 FROM public.crm_party_links a JOIN public.crm_party_links b ON b.party_id=a.party_id
     WHERE a.module_code='leads' AND a.record_id=l.id AND b.module_code IN ('clients','proprietaires_terres'))
)
SELECT c.* FROM contacts c
WHERE (COALESCE(_criteres->>'audience','tous') IN ('tous','all')
 OR (COALESCE(_criteres->>'audience','') IN ('clients','client') AND c.source_type='client')
 OR (COALESCE(_criteres->>'audience','') IN ('leads','lead') AND c.source_type='lead')
 OR (COALESCE(_criteres->>'audience','') IN ('prospects','prospect') AND c.source_type='prospect')
 OR (COALESCE(_criteres->>'audience','') IN ('equipe','equipe_interne','staff','team') AND c.source_type='equipe')
 OR (COALESCE(_criteres->>'audience','')='commerciaux' AND c.source_type='equipe' AND c.role_code IN ('commercial','responsable_commercial','chef_equipe_commercial'))
 OR (COALESCE(_criteres->>'audience','')='palminvest' AND lower(COALESCE(c.offre_code,'')) IN ('palm-invest','palminvest'))
 OR (COALESCE(_criteres->>'audience','')='terrapalm' AND lower(COALESCE(c.offre_code,'')) IN ('terra-palm','terrapalm'))
 OR (COALESCE(_criteres->>'audience','')='palmterroir' AND lower(COALESCE(c.offre_code,''))='palmterroir')
 OR (COALESCE(_criteres->>'audience','') IN ('proprietaires_fonciers','proprietaires_foncier') AND c.source_type='proprietaire_foncier')
 OR (COALESCE(_criteres->>'audience','') IN ('beneficiaires_particuliers','beneficiaire_particulier') AND c.source_type='beneficiaire_particulier'))
 AND (NULLIF(_criteres->>'offer_code','') IS NULL OR lower(COALESCE(c.offre_code,''))=lower(_criteres->>'offer_code'))
 AND (NULLIF(_criteres->>'role_code','') IS NULL OR c.role_code=_criteres->>'role_code')
 AND (NULLIF(_criteres->>'has_email','') IS NULL OR CASE WHEN (_criteres->>'has_email')::boolean THEN NULLIF(trim(c.email),'') IS NOT NULL ELSE NULLIF(trim(c.email),'') IS NULL END)
 AND (NULLIF(_criteres->>'has_phone','') IS NULL OR CASE WHEN (_criteres->>'has_phone')::boolean THEN NULLIF(trim(c.telephone),'') IS NOT NULL ELSE NULLIF(trim(c.telephone),'') IS NULL END);
$function$;
