DO $$
DECLARE
  v_pdg uuid := 'bd9579fd-1d07-4431-9cc4-b57dfeeab593';
  v_offer uuid := '4a062827-a1d1-476d-9789-16bcdae54f5f';
  v_client uuid;
  v_acquisition uuid;
  v_payment uuid;
BEGIN
  SELECT id INTO v_client FROM public.clients
  WHERE regexp_replace(coalesce(telephone,''),'[^0-9]','','g')='2250709712000';
  IF v_client IS NULL THEN
    INSERT INTO public.clients (
      nom_complet,telephone,telephone_indicatif,telephone_local,
      offre_id,offre_code,offre_nom,famille_offre,formule_code,formule_nom,
      type_client,necessite_foncier_client,total_hectares,superficie_ha,
      mode_paiement,paiement_initial_montant,paiement_initial_paye_at,
      mensualite_montant,montant_total_contrat,taux_journalier_ha,jours_contrat_total,
      statut,statut_global,compte_actif,validation_statut,validation_par,validation_at,
      type_personne,metadata,created_at
    ) VALUES (
      'YAO LAMBERT KONAN','+2250709712000','+225','0709712000',
      v_offer,'PALMTERROIR','PalmTerroir','PALMTERROIR',
      'PALMTERROIR_FLEXIBLE_PLUS','Flexible (+)',
      'avec_terre',true,0.5,0.5,
      'echeancier',32500,'2026-09-28 00:00:00+00',
      6300,259300,210,1080,
      'actif','actif',true,'valide',v_pdg,now(),
      'personne_physique',
      jsonb_build_object('source_dossier','CRM_OPERATING_ROADMAP','date_inscription','2026-09-27',
        'date_paiement_initial','2026-09-28','date_mise_en_terre','2026-09-30',
        'paiement_initial_recu',34000,'paiement_initial_contractuel',32500,
        'credit_trop_percu',1500,'credit_jours',7,'reliquat_credit',30,
        'localisation_fonciere',null),
      '2026-09-27 00:00:00+00'
    ) RETURNING id INTO v_client;
  ELSE
    IF NOT EXISTS(SELECT 1 FROM public.clients WHERE id=v_client AND upper(coalesce(nom_complet,''))='YAO LAMBERT KONAN') THEN
      RAISE EXCEPTION 'Le téléphone de Yao Lambert est déjà associé à une autre fiche client.';
    END IF;
  END IF;
  SELECT id INTO v_acquisition FROM public.acquisitions WHERE client_id=v_client ORDER BY created_at DESC LIMIT 1;
  IF v_acquisition IS NULL THEN RAISE EXCEPTION 'Acquisition de Yao Lambert absente.'; END IF;
  UPDATE public.acquisitions SET statut='active',validation_statut='valide',validation_par=v_pdg,
    validation_at=coalesce(validation_at,now()),
    metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('validated_from_client_dossier',true,'historical_planting_date','2026-09-30')
  WHERE id=v_acquisition;
  UPDATE public.leads SET client_id=v_client,statut='converti',etape_pipeline='converti',
    converti_at=coalesce(converti_at,'2026-09-27 00:00:00+00'),updated_at=now()
  WHERE id='51f06de0-1d5b-4195-9bc6-48f17859b377' AND (client_id IS NULL OR client_id=v_client);
  IF NOT EXISTS(SELECT 1 FROM public.leads WHERE id='51f06de0-1d5b-4195-9bc6-48f17859b377' AND client_id=v_client) THEN
    RAISE EXCEPTION 'Lead source de Yao Lambert absent ou déjà lié à un autre client.';
  END IF;
  SELECT id INTO v_payment FROM public.paiements WHERE client_id=v_client AND est_paiement_initial=true
    AND date_paiement::date='2026-09-28' AND montant_paye=34000 LIMIT 1;
  IF v_payment IS NULL THEN
    INSERT INTO public.paiements(client_id,acquisition_id,montant,montant_paye,montant_theorique,
      type_paiement,statut,date_paiement,est_paiement_initial,parcours,valide_par,date_validation,notes)
    VALUES(v_client,v_acquisition,34000,34000,32500,'PI','valide','2026-09-28 00:00:00+00',true,'PALMTERROIR',v_pdg,now(),
      'Paiement initial reçu le 28/09/2026 : 34 000 FCFA pour 32 500 FCFA attendus. Trop-perçu de 1 500 FCFA : 7 jours crédités (1 470 FCFA) et reliquat de 30 FCFA. Mode de paiement et référence non communiqués.')
    RETURNING id INTO v_payment;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.client_monnaie_mouvements WHERE paiement_source_id=v_payment AND type_mouvement='credit') THEN
    INSERT INTO public.client_monnaie_mouvements(client_id,paiement_source_id,type_mouvement,montant,taux_journalier,jours_equivalents,motif)
    VALUES(v_client,v_payment,'credit',1500,210,7,
      'Trop-perçu initial : 1 470 FCFA correspondent à 7 jours au taux de 210 FCFA/jour ; reliquat de 30 FCFA conservé dans le même crédit auditable.');
  END IF;

  SELECT id INTO v_client FROM public.clients
  WHERE regexp_replace(coalesce(telephone,''),'[^0-9]','','g')='2250747302235';
  IF v_client IS NULL THEN
    INSERT INTO public.clients(
      nom_complet,telephone,telephone_indicatif,telephone_local,
      offre_id,offre_code,offre_nom,famille_offre,formule_code,formule_nom,
      type_client,necessite_foncier_client,total_hectares,superficie_ha,
      mode_paiement,paiement_initial_montant,mensualite_montant,montant_total_contrat,
      paiement_personnalise,taux_journalier_ha,jours_contrat_total,
      statut,statut_global,compte_actif,validation_statut,validation_par,validation_at,
      type_personne,metadata,created_at
    ) VALUES(
      'KOUASSI KOUADIO PATRICE','+2250747302235','+225','0747302235',
      v_offer,'PALMTERROIR','PalmTerroir','PALMTERROIR',
      'PALMTERROIR_PERSONNALISEE','Personnalisée',
      'avec_terre',true,1.5,1.5,
      'echeancier',52500,10000,412500,
      jsonb_build_object('type','personnalisee','montant_pi_total',52500,'mensualite_montant',10000,
        'duree_paiement_mois',36,'montant_total_contrat',412500,'source','tarif_personnalise_client'),
      333.333333,1080,
      'actif','actif',true,'valide',v_pdg,now(),
      'personne_physique',
      jsonb_build_object('source_dossier','CRM_OPERATING_ROADMAP','date_inscription','2026-11-06',
        'date_mise_en_terre','2026-11-09','paiement_initial_recu',30000,
        'paiement_initial_attendu',52500,'solde_initial',22500,'localisation_fonciere',null),
      '2026-11-06 00:00:00+00'
    ) RETURNING id INTO v_client;
  ELSE
    IF NOT EXISTS(SELECT 1 FROM public.clients WHERE id=v_client AND upper(coalesce(nom_complet,''))='KOUASSI KOUADIO PATRICE') THEN
      RAISE EXCEPTION 'Le téléphone de Patrice est déjà associé à une autre fiche client.';
    END IF;
  END IF;
  SELECT id INTO v_acquisition FROM public.acquisitions WHERE client_id=v_client ORDER BY created_at DESC LIMIT 1;
  IF v_acquisition IS NULL THEN RAISE EXCEPTION 'Acquisition personnalisée de Patrice absente.'; END IF;
  UPDATE public.acquisitions SET statut='active',validation_statut='valide',validation_par=v_pdg,
    validation_at=coalesce(validation_at,now()),
    metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('validated_from_client_dossier',true,
      'historical_planting_date','2026-11-09','client_level_custom_pricing',true)
  WHERE id=v_acquisition;
  SELECT id INTO v_payment FROM public.paiements WHERE client_id=v_client AND est_paiement_initial=true
    AND date_paiement::date='2026-11-07' AND montant_paye=30000 LIMIT 1;
  IF v_payment IS NULL THEN
    INSERT INTO public.paiements(client_id,acquisition_id,montant,montant_paye,montant_theorique,
      type_paiement,statut,date_paiement,est_paiement_initial,parcours,valide_par,date_validation,notes)
    VALUES(v_client,v_acquisition,30000,30000,52500,'PI','valide','2026-11-07 00:00:00+00',true,'PALMTERROIR',v_pdg,now(),
      'Paiement initial partiel reçu le 07/11/2026 : 30 000 FCFA sur 52 500 FCFA attendus. Solde initial restant : 22 500 FCFA. Mode de paiement et référence non communiqués.')
    RETURNING id INTO v_payment;
  END IF;
END;
$$;