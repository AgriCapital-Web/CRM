-- Align current PalmInvest/TerraPalm catalog prices to the official supplied flyer.
-- Existing signed client contracts are intentionally not rewritten.
update public.offres
set montant_pi_par_ha = 90700,
    montant_cash_par_ha = 2266000,
    montant_total_par_ha = 2467900,
    mensualite_par_ha = 56600,
    duree_paiement_mois = 42,
    tranches_paiement = jsonb_build_array(jsonb_build_object(
      'type','mensualite_unique','mois',42,'mois_debut',1,'mois_fin',42,
      'mensualite_par_ha',56600,'total_periode_par_ha',2377200
    )),
    formules_configuration = coalesce((
      select jsonb_agg(
        item.value || jsonb_build_object(
          'mensualite_par_ha',56600,
          'duree_paiement_mois',42,
          'tranches_paiement',jsonb_build_array(jsonb_build_object(
            'type','mensualite_unique','mois',42,'mois_debut',1,'mois_fin',42,
            'mensualite_par_ha',56600,'total_periode_par_ha',2377200
          ))
        ) order by item.ordinality
      )
      from jsonb_array_elements(public.offres.formules_configuration) with ordinality item(value, ordinality)
    ), '[]'::jsonb),
    updated_at = now()
where code = 'palm-invest';

update public.offres
set montant_pi_par_ha = 84700,
    montant_cash_par_ha = 1466200,
    montant_total_par_ha = 1621900,
    mensualite_par_ha = 36600,
    duree_paiement_mois = 42,
    tranches_paiement = jsonb_build_array(jsonb_build_object(
      'type','mensualite_unique','mois',42,'mois_debut',1,'mois_fin',42,
      'mensualite_par_ha',36600,'total_periode_par_ha',1537200
    )),
    formules_configuration = coalesce((
      select jsonb_agg(
        item.value || jsonb_build_object(
          'mensualite_par_ha',36600,
          'duree_paiement_mois',42,
          'tranches_paiement',jsonb_build_array(jsonb_build_object(
            'type','mensualite_unique','mois',42,'mois_debut',1,'mois_fin',42,
            'mensualite_par_ha',36600,'total_periode_par_ha',1537200
          ))
        ) order by item.ordinality
      )
      from jsonb_array_elements(public.offres.formules_configuration) with ordinality item(value, ordinality)
    ), '[]'::jsonb),
    updated_at = now()
where code = 'terra-palm';
