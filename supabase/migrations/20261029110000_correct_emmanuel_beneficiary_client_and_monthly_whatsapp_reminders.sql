
ALTER TABLE public.clients DISABLE TRIGGER clients_reject_duplicate_contact;
ALTER TABLE public.clients DISABLE TRIGGER trg_recalculer_parametres_financiers_client;
ALTER TABLE public.clients DISABLE TRIGGER trg_notification_client_created;
ALTER TABLE public.clients DISABLE TRIGGER trg_notify_client_validation_review;
ALTER TABLE public.clients DISABLE TRIGGER trg_notify_resubmitted_client_validation;
ALTER TABLE public.clients DISABLE TRIGGER trg_refresh_account_on_client_validation;

DO $$
DECLARE
 v_beneficiary uuid := '06b2d0c3-940a-45e5-981a-f7534e5553c0';
 v_zagble uuid := 'ef58c186-e6a9-4fdd-8c6c-21220f42e9cf';
 v_paid_client uuid;
 v_offer uuid := '862d96ad-fd5f-4454-a5db-80f45d2f4323';
 v_plantation uuid := '86da31b0-9a82-43b3-9aac-78f66aa7701b';
 v_acquisition uuid := '26bbf408-484a-49da-8e0d-784039e0c889';
 v_payment uuid := '0897dc42-5d33-409c-9b3d-a3a45b73fd5d';
BEGIN
 DELETE FROM public.crm_party_links WHERE
   (module_code='clients' AND record_id='f8d93ba9-b197-4478-a3fd-a8086106495f'::uuid) OR
   (module_code='leads' AND record_id='921ef454-97cc-49cb-a731-07bb9a9b726a'::uuid) OR
   (module_code='prospects' AND record_id='ddaf96e9-d825-4812-bf79-23141c85f4b7'::uuid);
 DELETE FROM public.notification_client_preferences WHERE client_id='f8d93ba9-b197-4478-a3fd-a8086106495f'::uuid;
 DELETE FROM public.prospects WHERE id='ddaf96e9-d825-4812-bf79-23141c85f4b7'::uuid;
 DELETE FROM public.leads WHERE id='921ef454-97cc-49cb-a731-07bb9a9b726a'::uuid;
 DELETE FROM public.clients WHERE id='f8d93ba9-b197-4478-a3fd-a8086106495f'::uuid;

 UPDATE public.clients SET offre_id=NULL,offre_code=NULL,offre_nom=NULL,famille_offre=NULL,
   formule_code=NULL,formule_nom=NULL,parcours_code='beneficiaire_particulier',
   superficie_ha=NULL,total_hectares=2,mensualite_montant=0,montant_total_contrat=0,
   montant_pi_total=0,paiement_initial_montant=0,prochaine_echeance=NULL,contrat_debut_at=NULL,
   contrat_fin_at=NULL,duree_paiement_mois=NULL,gestion_type=NULL,statut_global='actif',updated_at=now()
 WHERE id=v_beneficiary;
 UPDATE public.clients SET offre_id=NULL,offre_code=NULL,offre_nom=NULL,famille_offre=NULL,
   formule_code=NULL,formule_nom=NULL,parcours_code='beneficiaire_particulier',
   superficie_ha=NULL,total_hectares=2,mensualite_montant=0,montant_total_contrat=0,
   montant_pi_total=0,paiement_initial_montant=0,prochaine_echeance=NULL,contrat_debut_at=NULL,
   contrat_fin_at=NULL,duree_paiement_mois=NULL,gestion_type=NULL,statut_global='actif',updated_at=now()
 WHERE id=v_zagble;

 SELECT id INTO v_paid_client FROM public.clients
 WHERE id_unique='AC_C000007' OR (type_client='avec_terre' AND nom_complet='KONAN EMMANUEL YAO'
   AND superficie_ha=0.4698 AND montant_total_contrat=87200)
 ORDER BY created_at LIMIT 1;
 IF v_paid_client IS NULL THEN
   INSERT INTO public.clients (
     civilite,nom_famille,prenoms,nom_complet,nom,date_naissance,lieu_naissance,statut_marital,
     type_piece,numero_piece,date_delivrance_piece,telephone,whatsapp,email,domicile,domicile_residence,
     district_id,region_id,departement_id,sous_prefecture_id,village_id,localite,nationalite,
     type_personne,denomination_sociale,nature_organisation_code,forme_juridique_code,numero_enregistrement,
     nombre_membres,responsable_legal_nom,responsable_legal_prenoms,responsable_legal_telephone,
     photo_profil_url,fichier_piece_url,fichier_piece_recto_url,fichier_piece_verso_url,
     type_client,offre_id,offre_code,offre_nom,famille_offre,formule_code,formule_nom,parcours_code,
     gestion_type,superficie_ha,total_hectares,mensualite_montant,montant_pi_total,paiement_initial_montant,
     montant_total_contrat,duree_paiement_mois,contrat_debut_at,prochaine_echeance,paiement_initial_paye_at,
     statut,statut_global,validation_statut,compte_actif,is_internal,mode_paiement,created_by,updated_by
   )
   SELECT c.civilite,c.nom_famille,c.prenoms,c.nom_complet,c.nom,c.date_naissance,c.lieu_naissance,c.statut_marital,
     c.type_piece,c.numero_piece,c.date_delivrance_piece,c.telephone,c.whatsapp,c.email,c.domicile,c.domicile_residence,
     c.district_id,c.region_id,c.departement_id,c.sous_prefecture_id,c.village_id,c.localite,c.nationalite,
     c.type_personne,c.denomination_sociale,c.nature_organisation_code,c.forme_juridique_code,c.numero_enregistrement,
     c.nombre_membres,c.responsable_legal_nom,c.responsable_legal_prenoms,c.responsable_legal_telephone,
     c.photo_profil_url,c.fichier_piece_url,c.fichier_piece_recto_url,c.fichier_piece_verso_url,
     'avec_terre',NULL,NULL,NULL,'PERSONNALISEE','PERSONNALISEE','Offre personnalisée','PERSONNALISEE',
     'propre',0.4698,0.4698,5600,20000,20000,87200,12,DATE '2026-10-24',DATE '2026-11-23',
     TIMESTAMPTZ '2026-10-24 16:39:05+00','actif','a_jour','valide',true,false,'echeancier',c.created_by,c.updated_by
   FROM public.clients c WHERE c.id=v_beneficiary
   RETURNING id INTO v_paid_client;
 END IF;

 UPDATE public.clients SET type_client='avec_terre',offre_id=v_offer,
   offre_code='EMMANUEL_PERSONNALISEE_20261024',offre_nom='Offre personnalisée — YAO KONAN EMMANUEL',
   famille_offre='PERSONNALISEE',formule_code='PERSONNALISEE',formule_nom='Offre personnalisée',
   parcours_code='PERSONNALISEE',gestion_type='propre',superficie_ha=0.4698,total_hectares=0.4698,
   mensualite_montant=5600,montant_pi_total=20000,paiement_initial_montant=20000,montant_total_contrat=87200,
   duree_paiement_mois=12,contrat_debut_at=DATE '2026-10-24',prochaine_echeance=DATE '2026-11-23',
   paiement_initial_paye_at=TIMESTAMPTZ '2026-10-24 16:39:05+00',statut='actif',statut_global='a_jour',
   validation_statut='valide',compte_actif=true,is_internal=false,updated_at=now()
 WHERE id=v_paid_client;

 UPDATE public.plantations SET client_id=v_paid_client,role_attribution='client',montant_mensualite=5600,updated_at=now()
 WHERE id=v_plantation;
 UPDATE public.acquisitions SET client_id=v_paid_client,offre_id=v_offer,
   offre_code='EMMANUEL_PERSONNALISEE_20261024',offre_nom='Offre personnalisée — YAO KONAN EMMANUEL',
   famille_offre='PERSONNALISEE',formule_code='PERSONNALISEE',formule_nom='Offre personnalisée',
   superficie_ha=0.4698,mensualite_montant=5600,montant_total_contrat=87200,
   metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('surface_ha',0.4698,'source_personnalisation','emmanuel_camp_bethel_20261024','offre_catalogue_rattachee',false,'mensualite',5600),
   updated_at=now() WHERE id=v_acquisition;
 UPDATE public.paiements SET client_id=v_paid_client,acquisition_id=v_acquisition,
   metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('source','souscription_personnalisee_direction',
     'offre_id',v_offer,'offre_code','EMMANUEL_PERSONNALISEE_20261024','formule_code','PERSONNALISEE',
     'superficie_ha',0.4698,'acquisition_id',v_acquisition,'montant_total_contrat',87200,'mensualite',5600,
     'offre_catalogue_rattachee',false),updated_at=now() WHERE id=v_payment;

 UPDATE public.plantations SET client_id=v_beneficiary,role_attribution='beneficiaire_particulier',
   montant_pi=0,montant_pi_paye=0,montant_mensualite=0,acquisition_id=NULL,updated_at=now()
 WHERE id='e8b99368-9415-418d-8399-4e0dbfb6df2c'::uuid;

 IF NOT EXISTS (SELECT 1 FROM public.plantations WHERE id=v_plantation AND client_id=v_paid_client) THEN
   RAISE EXCEPTION 'La plantation payante d’Emmanuel n’est pas reliée au client officiel.';
 END IF;
 IF EXISTS (SELECT 1 FROM public.clients WHERE id IN (v_beneficiary,v_zagble)
   AND (offre_id IS NOT NULL OR offre_code IS NOT NULL OR offre_nom IS NOT NULL OR mensualite_montant<>0 OR total_hectares<>2)) THEN
   RAISE EXCEPTION 'Un bénéficiaire conserve une offre payante ou une superficie incorrecte.';
 END IF;
END $$;

ALTER TABLE public.clients ENABLE TRIGGER clients_reject_duplicate_contact;
ALTER TABLE public.clients ENABLE TRIGGER trg_recalculer_parametres_financiers_client;
ALTER TABLE public.clients ENABLE TRIGGER trg_notification_client_created;
ALTER TABLE public.clients ENABLE TRIGGER trg_notify_client_validation_review;
ALTER TABLE public.clients ENABLE TRIGGER trg_notify_resubmitted_client_validation;
ALTER TABLE public.clients ENABLE TRIGGER trg_refresh_account_on_client_validation;

UPDATE public.notification_automations SET actif=false,updated_at=now()
 WHERE code IN ('client_echeance_auto','client_retard_auto');
UPDATE public.notification_automations SET canal='whatsapp',cooldown_minutes=0,actif=true,updated_at=now()
 WHERE code IN ('paiement_echeance_client','paiement_retard_client');

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
