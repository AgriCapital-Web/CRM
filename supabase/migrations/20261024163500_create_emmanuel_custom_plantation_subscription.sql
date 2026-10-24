do $$
declare
  v_client public.clients%rowtype;
  v_offer public.offres%rowtype;
  v_base_parcelle public.parcelles%rowtype;
  v_parcelle public.parcelles%rowtype;
  v_acquisition_id uuid;
  v_payment_id uuid;
  v_jean_marie_id uuid;
  v_monthly_per_ha numeric := 5600 / 0.43;
  v_pi_per_ha numeric := 20000 / 0.43;
  v_total_per_ha numeric := 87200 / 0.43;
  v_schedule jsonb;
  v_stage text;
begin
  select * into v_client from public.clients where id_unique='AC_B000001' for update;
  if v_client.id is null then raise exception 'Le dossier bénéficiaire AC_B000001 est introuvable.'; end if;
  if exists(select 1 from public.acquisitions a where a.client_id=v_client.id and a.metadata->>'source_personnalisation'='emmanuel_camp_bethel_20261024') then
    raise exception 'La souscription personnalisée d’Emmanuel existe déjà; aucune duplication créée.';
  end if;
  select * into v_offer from public.offres where code='PALMTERROIR' and actif=true limit 1;
  if v_offer.id is null then raise exception 'L’offre PalmTerroir active est introuvable.'; end if;
  if not exists(select 1 from jsonb_array_elements(coalesce(v_offer.formules_configuration,'[]'::jsonb)) f where f.value->>'code'='PALMTERROIR_PERSONNALISEE') then
    raise exception 'La formule PalmTerroir personnalisée n’est pas configurée dans les offres.';
  end if;
  select * into v_base_parcelle from public.parcelles where id_unique='PAR-000005' limit 1;
  if v_base_parcelle.id is null then raise exception 'La parcelle de référence de Kouassikankro est introuvable.'; end if;
  select id into v_jean_marie_id from public.profiles where upper(nom_complet)='YAO KONAN JEAN-MARIE' and actif=true limit 1;
  if v_jean_marie_id is null then raise exception 'Le profil technique de Yao Konan Jean-Marie est introuvable.'; end if;

  select * into v_parcelle from public.parcelles where nom='Plantation YAO KONAN EMMANUEL — Kouassikankro Camp Bethel' and mode_surface='propriete_client' limit 1;
  if v_parcelle.id is null then
    insert into public.parcelles(
      nom,surface_totale_ha,surface_proprietaire_ha,surface_agricapital_ha,surface_attribuee_ha,surface_disponible_ha,
      district_id,region_id,departement_id,sous_prefecture_id,village,mode_surface,plantation_surface_cible_ha,
      plantation_densite_plants,plantation_type_culture,statut,notes,created_by,updated_by
    ) values (
      'Plantation YAO KONAN EMMANUEL — Kouassikankro Camp Bethel',
      0.43,0.43,0,0,0,
      v_base_parcelle.district_id,v_base_parcelle.region_id,v_base_parcelle.departement_id,v_base_parcelle.sous_prefecture_id,
      'Kouassikankro — Camp Bethel','propriete_client',0.43,135,'Palmier à huile','saturee',
      'Parcelle client dédiée à la souscription personnalisée de 0,43 ha. Coordonnées GPS à compléter; site indiqué à environ 1 km de la plantation de Ferdinand.',
      v_client.created_by,v_client.created_by
    ) returning * into v_parcelle;
  else
    update public.parcelles set surface_totale_ha=0.43,surface_proprietaire_ha=0.43,surface_agricapital_ha=0,
      plantation_surface_cible_ha=0.43,plantation_densite_plants=135,plantation_type_culture='Palmier à huile',
      village='Kouassikankro — Camp Bethel',statut='saturee',updated_by=v_client.created_by,updated_at=now()
    where id=v_parcelle.id returning * into v_parcelle;
  end if;

  v_schedule:=jsonb_build_array(jsonb_build_object(
    'type','mensualite_unique','mois_debut',1,'mois_fin',12,'mois',12,
    'mensualite_par_ha',v_monthly_per_ha,'mensualite_par_ha_effective',v_monthly_per_ha,
    'total_periode_par_ha',v_monthly_per_ha*12,'total_periode_par_ha_effectif',v_monthly_per_ha*12,
    'montant_mensualite',5600,'nombre_mensualites',12
  ));

  insert into public.acquisitions(
    client_id,offre_id,offre_code,offre_nom,famille_offre,formule_code,formule_nom,gestion_type,
    necessite_foncier_client,superficie_ha,parcelle_id,lot_id,mode_paiement,
    montant_pi_par_ha,montant_pi_total,montant_total_par_ha,montant_total_contrat,
    mensualite_par_ha,mensualite_montant,duree_paiement_mois,echeancier,promotion_id,montant_promo_applique,
    statut,statut_technique,notes,created_by,validation_statut,validation_at,validation_par,metadata
  ) values (
    v_client.id,v_offer.id,v_offer.code,v_offer.nom,v_offer.famille_offre,'PALMTERROIR_PERSONNALISEE','Personnalisée',
    v_offer.gestion_type,true,0.43,v_parcelle.id,null,'echeancier',
    v_pi_per_ha,20000,v_total_per_ha,87200,v_monthly_per_ha,5600,12,v_schedule,null,0,
    'en_attente_activation','en_attente_intervention',
    'Souscription personnalisée additionnelle : 0,43 ha à Kouassikankro — Camp Bethel; paiement initial 20 000 F CFA puis 5 600 F CFA × 12 mois. Mise en terre déjà réalisée par Yao Konan Jean-Marie. Aucune commission technique sur cette souscription.',
    v_client.created_by,'valide',now(),v_client.created_by,
    jsonb_build_object('source_personnalisation','emmanuel_camp_bethel_20261024','commission_technique_exoneree',true,
      'personnalisation',jsonb_build_object('superficie_ha',0.43,'plants_prevus',58,'paiement_initial',20000,
      'mensualite',5600,'nombre_mensualites',12,'montant_total_contrat',87200,
      'lieu','Kouassikankro — Camp Bethel','intervention_par','YAO KONAN JEAN-MARIE'))
  ) returning id into v_acquisition_id;

  insert into public.paiements(
    client_id,acquisition_id,type_paiement,montant,montant_paye,montant_theorique,statut,mode_paiement,parcours,
    est_paiement_initial,phase,date_echeance,date_paiement,date_validation,valide_par,reference,notes,metadata,created_by,aggregateur_paiement
  ) values (
    v_client.id,v_acquisition_id,'PI',20000,20000,20000,'valide','Kkiapay','PALMTERROIR',
    true,'paiement_initial',current_date,now(),now(),v_client.created_by,'AGRICAPITAL-PI-AC_B000001-20261024',
    'Paiement initial de 20 000 F CFA déclaré payé le 24/10/2026 par la direction. Référence de transaction Kkiapay à rapprocher.',
    jsonb_build_object('source','souscription_personnalisee_direction','acquisition_id',v_acquisition_id,
      'offre_id',v_offer.id,'offre_code',v_offer.code,'formule_code','PALMTERROIR_PERSONNALISEE',
      'superficie_ha',0.43,'montant_total_contrat',87200,'commission_technique_exoneree',true),
    v_client.created_by,'kkiapay'
  ) returning id into v_payment_id;

  foreach v_stage in array array['validation_parcelle','defrichage','piquetage','trouaison','mise_en_terre']
  loop
    insert into public.interventions_techniques(
      client_id,parcelle_id,acquisition_id,agent_technique_id,type_intervention,date_intervention,
      observations,recommandations,statut,nombre_plants_prevus,nombre_plants_realises,densite_plants,contenu_client
    ) values (
      v_client.id,v_parcelle.id,v_acquisition_id,v_jean_marie_id,v_stage,current_date,
      'Étape déjà réalisée avant l’enregistrement de la souscription; régularisation confirmée par la direction. Lieu: Kouassikankro — Camp Bethel.',
      'Aucune action restante pour cette étape; conserver le rapport comme trace technique.',
      'realisee',58,case when v_stage='mise_en_terre' then 58 else null end,135,
      'Intervention réalisée par Yao Konan Jean-Marie. Commission technique exonérée sur cette souscription personnalisée.'
    );
  end loop;

  update public.plantations
     set nom='Plantation YAO KONAN EMMANUEL — Plantation 2',
         nom_plantation='Plantation YAO KONAN EMMANUEL — Plantation 2',
         superficie_ha=0.43,superficie_activee=0.43,surface_reellement_plantee=0.43,
         nombre_plants=58,nombre_plants_prevus=58,nombre_plants_mis_en_terre=58,
         densite_plants=135,densite_cible=135,date_plantation=current_date,date_activation=current_date,
         statut='actif',statut_global='actif',localite='Kouassikankro — Camp Bethel',
         village='Kouassikankro — Camp Bethel',village_nom='Kouassikankro — Camp Bethel',
         notes='0,43 ha; 58 plants mis en terre le 24/10/2026. Coordonnées GPS à compléter; environ 1 km de la plantation de Ferdinand. Souscription personnalisée sans commission technique.',
         updated_by=v_client.created_by,updated_at=now()
   where acquisition_id=v_acquisition_id;

  insert into public.beneficiaire_attributions(
    client_id,parcelle_id,plantation_id,surface_attribuee_ha,role_attribution,statut,notes,created_by,updated_by
  )
  select p.client_id,p.parcelle_id,p.id,p.superficie_ha,'beneficiaire','active',
         'Attribution liée à la souscription personnalisée PALMTERROIR de 0,43 ha à Kouassikankro — Camp Bethel; 58 plants.',
         v_client.created_by,v_client.created_by
    from public.plantations p
   where p.acquisition_id=v_acquisition_id
     and not exists(
       select 1 from public.beneficiaire_attributions ba
        where ba.client_id=p.client_id and ba.parcelle_id=p.parcelle_id
          and ba.plantation_id=p.id and ba.statut='active'
     );

  update public.clients set montant_total_contrat=87200,paiement_initial_montant=20000,montant_pi_total=20000,
    mensualite_montant=5600,duree_paiement_mois=12,montant_total_par_ha=v_total_per_ha,
    montant_pi_par_ha=v_pi_per_ha,mensualite_par_ha=v_monthly_per_ha,updated_by=v_client.created_by,updated_at=now()
  where id=v_client.id;

  update public.clients c
     set offre_code=o.code,offre_nom=o.nom,famille_offre=coalesce(c.famille_offre,o.famille_offre),updated_at=now()
    from public.offres o
   where c.id=v_client.id and o.id=c.offre_id;

  if not exists(select 1 from public.plantations where acquisition_id=v_acquisition_id) then
    raise exception 'La plantation n’a pas été créée par le workflow technique.';
  end if;
  if exists(select 1 from public.commissions where client_id=v_client.id and plantation_id in (select id from public.plantations where acquisition_id=v_acquisition_id) and type_commission='technique' and statut<>'annule') then
    raise exception 'Une commission technique a été créée malgré l’exonération demandée.';
  end if;
end $$;