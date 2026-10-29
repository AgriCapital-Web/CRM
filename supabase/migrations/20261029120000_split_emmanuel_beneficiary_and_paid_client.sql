
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
 UPDATE public.clients SET offre_id=NULL,offre_code=NULL,offre_nom=NULL,famille_offre=NULL,
   formule_code=NULL,formule_nom=NULL,parcours_code='beneficiaire_particulier',superficie_ha=NULL,
   total_hectares=2,mensualite_montant=0,montant_total_contrat=0,montant_pi_total=0,
   paiement_initial_montant=0,prochaine_echeance=NULL,contrat_debut_at=NULL,contrat_fin_at=NULL,
   duree_paiement_mois=NULL,gestion_type=NULL,statut_global='actif',updated_at=now()
 WHERE id IN (v_beneficiary,v_zagble);

 SELECT id INTO v_paid_client FROM public.clients
 WHERE id_unique='AC_C000007' OR (type_client='avec_terre' AND nom_complet='KONAN EMMANUEL YAO'
   AND superficie_ha=0.4698 AND montant_total_contrat=87200)
 ORDER BY created_at LIMIT 1;

 IF v_paid_client IS NULL THEN
   INSERT INTO public.clients (
     civilite,nom_famille,prenoms,nom_complet,nom,date_naissance,lieu_naissance,statut_marital,
     type_piece,numero_piece,date_delivrance_piece,telephone,whatsapp,email,domicile,domicile_residence,
     district_id,region_id,departement_id,sous_prefecture_id,village_id,localite,nationalite,
     type_personne,photo_profil_url,fichier_piece_url,fichier_piece_recto_url,fichier_piece_verso_url,
     type_client,offre_id,offre_code,offre_nom,famille_offre,formule_code,formule_nom,parcours_code,
     gestion_type,superficie_ha,total_hectares,mensualite_montant,montant_pi_total,paiement_initial_montant,
     montant_total_contrat,duree_paiement_mois,contrat_debut_at,prochaine_echeance,paiement_initial_paye_at,
     statut,statut_global,validation_statut,compte_actif,is_internal,mode_paiement
   )
   SELECT c.civilite,c.nom_famille,c.prenoms,c.nom_complet,c.nom,c.date_naissance,c.lieu_naissance,c.statut_marital,
     c.type_piece,c.numero_piece,c.date_delivrance_piece,c.telephone,c.whatsapp,c.email,c.domicile,c.domicile_residence,
     c.district_id,c.region_id,c.departement_id,c.sous_prefecture_id,c.village_id,c.localite,c.nationalite,
     c.type_personne,c.photo_profil_url,c.fichier_piece_url,c.fichier_piece_recto_url,c.fichier_piece_verso_url,
     'avec_terre',NULL,NULL,NULL,'PERSONNALISEE','PERSONNALISEE','Offre personnalisée','PERSONNALISEE',
     'propre',0.4698,0.4698,5600,20000,20000,87200,12,DATE '2026-10-24',DATE '2026-11-23',
     TIMESTAMPTZ '2026-10-24 16:39:05+00','actif','a_jour','valide',true,false,'echeancier'
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
END $$;
