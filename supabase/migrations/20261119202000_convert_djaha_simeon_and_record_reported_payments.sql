
-- Convert the two explicitly confirmed prospects and create their acquisitions.
-- Partner land allocation and plantation remain deferred until technical intervention.
UPDATE public.prospects
   SET superficie_souhaitee_ha=10,
       formule_code='PALMINVEST_DELEGUE',
       updated_at=now()
 WHERE id='62fc975f-d5a9-4573-a35f-32c4c15e2843'
   AND client_id IS NULL;

WITH source AS (
  SELECT
    p.*,
    o.id AS resolved_offre_id,
    o.code AS resolved_offre_code,
    o.nom AS resolved_offre_nom,
    o.famille_offre AS resolved_famille,
    COALESCE(NULLIF(o.montant_pi_par_ha,0),o.paiement_signature_par_ha) AS pi_per_ha,
    o.montant_total_par_ha AS total_per_ha,
    o.mensualite_par_ha AS monthly_per_ha,
    o.duree_paiement_mois AS months,
    f.value->>'nom' AS resolved_formule_nom,
    CASE WHEN p.id='27ca3b84-d3d3-4e7c-9bc0-a75b51f1c25a' THEN 2::numeric ELSE 10::numeric END AS surface,
    CASE WHEN p.id='62fc975f-d5a9-4573-a35f-32c4c15e2843' THEN 'PALMINVEST_DELEGUE' ELSE p.formule_code END AS resolved_formule_code
  FROM public.prospects p
  JOIN public.offres o ON lower(o.code)=lower(p.offre_code)
  CROSS JOIN LATERAL jsonb_array_elements(coalesce(o.formules_configuration,'[]'::jsonb)) f(value)
  WHERE p.id IN ('27ca3b84-d3d3-4e7c-9bc0-a75b51f1c25a','62fc975f-d5a9-4573-a35f-32c4c15e2843')
    AND f.value->>'code' = CASE WHEN p.id='62fc975f-d5a9-4573-a35f-32c4c15e2843' THEN 'PALMINVEST_DELEGUE' ELSE p.formule_code END
    AND p.client_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.clients c WHERE c.telephone=p.telephone)
),
inserted AS (
  INSERT INTO public.clients (
    civilite,prenoms,nom,nom_complet,telephone,whatsapp,email,
    type_client,type_client_foncier,type_personne,
    district_id,region_id,departement_id,sous_prefecture_id,village_id,
    localite,domicile,domicile_residence,
    offre_id,offre_code,offre_nom,famille_offre,formule_code,formule_nom,parcours_code,
    total_hectares,superficie_ha,montant_total_contrat,paiement_initial_montant,
    mensualite_montant,taux_journalier_ha,jours_contrat_total,mode_paiement,
    statut,statut_global,validation_statut,validation_commentaire,
    validation_demande_at,validation_at,compte_actif,phase_actuelle,
    commercial_id,telephone_principal_whatsapp,is_internal,metadata
  )
  SELECT
    s.civilite,s.prenoms,s.nom,s.nom_complet,s.telephone,s.whatsapp,s.email,
    'sans_terre','EXT','personne_physique',
    s.district_id,s.region_id,s.departement_id,s.sous_prefecture_id,s.village_id,
    s.localite,s.lieu_residence,s.lieu_residence,
    s.resolved_offre_id,s.resolved_offre_code,s.resolved_offre_nom,s.resolved_famille,
    s.resolved_formule_code,s.resolved_formule_nom,'PALMINVEST',
    s.surface,s.surface,
    round(s.total_per_ha*s.surface,2),
    round(s.pi_per_ha*s.surface,2),
    round(s.monthly_per_ha*s.surface,2),
    round(s.monthly_per_ha/30,6),
    s.months*30,'echeancier',
    'actif','actif','valide',
    CASE WHEN s.id='27ca3b84-d3d3-4e7c-9bc0-a75b51f1c25a'
      THEN 'Acquisition validée commercialement sur instruction de la direction. Attribution foncière et intervention technique différées.'
      ELSE 'Client enregistré sur instruction de la direction. Lot, parcelle et intervention technique à attribuer selon le processus.'
    END,
    now(),now(),false,'pre_activation',
    s.assigned_to,coalesce(s.telephone_principal_whatsapp,false),false,
    jsonb_build_object(
      'source','prospect_conversion',
      'source_prospect_id',s.id,
      'source_prospect_code',s.id_unique,
      'deferred_land_allocation',true,
      'commercial_validation_sans_foncier',s.id='27ca3b84-d3d3-4e7c-9bc0-a75b51f1c25a',
      'technical_intervention_pending',true,
      'welcome_already_sent',s.id='62fc975f-d5a9-4573-a35f-32c4c15e2843',
      'welcome_sent_at',CASE WHEN s.id='62fc975f-d5a9-4573-a35f-32c4c15e2843' THEN '2026-11-19T19:58:33Z' ELSE NULL END,
      'pi_total_contractuel',round(s.pi_per_ha*s.surface,2),
      'pi_paye_a_la_conversion',CASE WHEN s.id='27ca3b84-d3d3-4e7c-9bc0-a75b51f1c25a' THEN 181400 ELSE 303000 END,
      'solde_pi_restant',CASE WHEN s.id='27ca3b84-d3d3-4e7c-9bc0-a75b51f1c25a' THEN 0 ELSE 604000 END
    )
  FROM source s
  RETURNING id,metadata->>'source_prospect_id' AS source_prospect_id
)
UPDATE public.prospects p
   SET client_id=i.id,statut='converti',converted_client_at=now(),updated_at=now()
  FROM inserted i
 WHERE p.id=i.source_prospect_id::uuid;

-- DJAHA: full initial payment reported received; commercial acquisition validated,
-- with no lot, parcel or plantation until the technical team intervenes.
INSERT INTO public.paiements (
  client_id,acquisition_id,type_paiement,montant,montant_paye,montant_theorique,
  statut,date_paiement,date_validation,validation_comptable_at,
  est_paiement_initial,phase,parcours,notes,observations,metadata
)
SELECT c.id,a.id,'PI',181400,181400,181400,'valide',now(),now(),now(),
       true,'paiement_initial','PALMINVEST',
       'PI intégral de 181 400 FCFA déclaré reçu par la direction le 19/11/2026. Date effective, mode et référence non communiqués.',
       'Acquisition commerciale validée; aucune parcelle, aucun lot et aucune plantation créés.',
       jsonb_build_object('source','instruction_direction','date_effective_non_communiquee',true,
         'pi_total_contractuel',181400,'solde_pi_restant',0,'reference_non_fournie',true,'mode_non_fourni',true)
FROM public.clients c
JOIN public.acquisitions a ON a.client_id=c.id
WHERE c.metadata->>'source_prospect_id'='27ca3b84-d3d3-4e7c-9bc0-a75b51f1c25a'
  AND NOT EXISTS (SELECT 1 FROM public.paiements p WHERE p.client_id=c.id AND p.type_paiement='PI' AND p.montant_paye=181400);

-- SIMEON: partial initial payment of 303 000 FCFA out of 907 000 FCFA.
-- Acquisition remains subscribed and technically pending, without parcel/lot/plantation.
INSERT INTO public.paiements (
  client_id,acquisition_id,type_paiement,montant,montant_paye,montant_theorique,
  statut,date_paiement,date_validation,validation_comptable_at,
  est_paiement_initial,phase,parcours,notes,observations,metadata
)
SELECT c.id,a.id,'PI',303000,303000,303000,'valide',now(),now(),now(),
       true,'paiement_initial','PALMINVEST',
       'Versement initial de 303 000 FCFA déclaré reçu par la direction le 19/11/2026. Date effective, mode et référence non communiqués.',
       'Solde du paiement initial restant : 604 000 FCFA. Lot, parcelle et intervention technique à attribuer selon le processus.',
       jsonb_build_object('source','instruction_direction','date_effective_non_communiquee',true,
         'pi_total_contractuel',907000,'pi_paye_cumule',303000,'solde_pi_restant',604000,
         'reference_non_fournie',true,'mode_non_fourni',true)
FROM public.clients c
JOIN public.acquisitions a ON a.client_id=c.id
WHERE c.metadata->>'source_prospect_id'='62fc975f-d5a9-4573-a35f-32c4c15e2843'
  AND NOT EXISTS (SELECT 1 FROM public.paiements p WHERE p.client_id=c.id AND p.type_paiement='PI' AND p.montant_paye=303000);

-- TIONON MADOU: the accounting audit found only the previous 100 000 FCFA entry.
-- Record the additional 50 000 FCFA; the PI balance is then 50 000 FCFA.
INSERT INTO public.paiements (
  client_id,acquisition_id,type_paiement,montant,montant_paye,montant_theorique,
  statut,date_paiement,date_validation,validation_comptable_at,
  est_paiement_initial,phase,parcours,notes,observations,metadata
)
SELECT 'f5c48091-8d42-4d8f-8163-bb9dc05caaaa','5aaeadb7-9638-45f8-9f94-7d487ad33dba',
       'PI',50000,50000,50000,'valide',now(),now(),now(),
       true,'paiement_initial','PALMTERROIR',
       'Complément de paiement initial de 50 000 FCFA déclaré reçu par la direction le 19/11/2026. Date effective, mode et référence non communiqués.',
       'Total initial réglé : 150 000 FCFA sur 200 000 FCFA. Solde restant : 50 000 FCFA.',
       jsonb_build_object('source','instruction_direction','date_effective_non_communiquee',true,
         'pi_total_contractuel',200000,'pi_paye_cumule',150000,'solde_pi_restant',50000,
         'reference_non_fournie',true,'mode_non_fourni',true)
WHERE NOT EXISTS (
  SELECT 1 FROM public.paiements
   WHERE client_id='f5c48091-8d42-4d8f-8163-bb9dc05caaaa'
     AND type_paiement='PI' AND montant_paye=50000
);

-- LAMBERT: 35 000 FCFA additional advance. The previous 1 500 FCFA surplus
-- already represented 7 days + 30 FCFA. The new payment covers 166 days + 140 FCFA.
UPDATE public.clients
   SET jours_payes=7,
       updated_at=now()
 WHERE id='ecbe72e6-171e-4b78-923a-31b34e6f53bc'
   AND jours_payes=0
   AND contrat_debut_at='2026-09-30';

INSERT INTO public.paiements (
  client_id,acquisition_id,type_paiement,montant,montant_paye,montant_theorique,
  statut,date_paiement,date_validation,validation_comptable_at,
  est_paiement_initial,phase,parcours,jours_couverts,periode_debut,periode_fin,
  notes,observations,metadata
)
SELECT 'ecbe72e6-171e-4b78-923a-31b34e6f53bc','ee3c5707-77dc-43c9-81ef-83ba52e90d61',
       'MENSUALITE',35000,35000,35000,'valide',now(),now(),now(),
       false,'installation','PALMTERROIR',166,'2026-10-07','2027-03-21',
       'Versement supplémentaire de 35 000 FCFA déclaré reçu par la direction le 19/11/2026. Date effective, mode et référence non communiqués.',
       'Paiements cumulés : 69 000 FCFA. Avance totale au-delà du PI : 36 500 FCFA, soit 173 jours couverts et 170 FCFA de reliquat.',
       jsonb_build_object('source','instruction_direction','date_effective_non_communiquee',true,
         'taux_journalier_total',210,'jours_couverts',166,'reliquat_sur_versement',140,
         'credit_cumule_jours',173,'reliquat_credit_cumule',170,'paiements_cumules',69000)
WHERE NOT EXISTS (
  SELECT 1 FROM public.paiements
   WHERE client_id='ecbe72e6-171e-4b78-923a-31b34e6f53bc'
     AND type_paiement='MENSUALITE' AND montant_paye=35000
);

UPDATE public.clients
   SET jours_payes=173,
       prochaine_echeance='2027-03-22',
       metadata=coalesce(metadata,'{}'::jsonb) ||
         jsonb_build_object(
           'credit_jours',173,
           'reliquat_credit',170,
           'credit_trop_percu',36500,
           'paiements_cumules',69000,
           'avance_jours_apres_paiement_2026_11_19',166,
           'date_dernier_paiement_avance','2026-11-19'
         ),
       updated_at=now()
 WHERE id='ecbe72e6-171e-4b78-923a-31b34e6f53bc';

UPDATE public.clients
   SET metadata=coalesce(metadata,'{}'::jsonb) ||
     jsonb_build_object('pi_paye_cumule',150000,'solde_pi_restant',50000,'date_dernier_paiement_pi','2026-11-19'),
     updated_at=now()
 WHERE id='f5c48091-8d42-4d8f-8163-bb9dc05caaaa';
