ALTER TABLE public.offres
  ADD COLUMN IF NOT EXISTS formules_configuration jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE public.offres
SET formules_configuration = CASE UPPER(COALESCE(famille_offre, ''))
  WHEN 'PALMINVEST' THEN '[
    {"code":"PALMINVEST_AUTONOME","nom":"Autonome","gestion_type":"autonome","utilise_tarif_commun":true},
    {"code":"PALMINVEST_DELEGUE","nom":"Délégué (+)","gestion_type":"deleguee","utilise_tarif_commun":true}
  ]'::jsonb
  WHEN 'TERRAPALM' THEN '[
    {"code":"TERRAPALM_AUTONOME","nom":"Autonome","gestion_type":"autonome","utilise_tarif_commun":true},
    {"code":"TERRAPALM_DELEGUE","nom":"Délégué (+)","gestion_type":"deleguee","utilise_tarif_commun":true}
  ]'::jsonb
  WHEN 'PALMTERROIR' THEN '[
    {"code":"PALMTERROIR_ESSENTIELLE","nom":"Essentielle","utilise_tarif_commun":false,"montant_pi_par_ha":230000,"montant_cash_par_ha":356000,"mensualite_par_ha":3500,"montant_total_par_ha":356000,"duree_paiement_mois":36,"tranches_paiement":[{"annee":1,"mois_debut":1,"mois_fin":12,"mois":12,"mensualite_par_ha":3500,"total_periode_par_ha":42000},{"annee":2,"mois_debut":13,"mois_fin":24,"mois":12,"mensualite_par_ha":3500,"total_periode_par_ha":42000},{"annee":3,"mois_debut":25,"mois_fin":36,"mois":12,"mensualite_par_ha":3500,"total_periode_par_ha":42000}]},
    {"code":"PALMTERROIR_FLEXIBLE_PLUS","nom":"Flexible (+)","utilise_tarif_commun":false,"montant_pi_par_ha":65000,"montant_cash_par_ha":518600,"mensualite_par_ha":12600,"montant_total_par_ha":518600,"duree_paiement_mois":36,"tranches_paiement":[{"annee":1,"mois_debut":1,"mois_fin":12,"mois":12,"mensualite_par_ha":12600,"total_periode_par_ha":151200},{"annee":2,"mois_debut":13,"mois_fin":24,"mois":12,"mensualite_par_ha":12600,"total_periode_par_ha":151200},{"annee":3,"mois_debut":25,"mois_fin":36,"mois":12,"mensualite_par_ha":12600,"total_periode_par_ha":151200}]}
  ]'::jsonb
  ELSE COALESCE(formules_configuration, '[]'::jsonb)
END,
updated_at = now()
WHERE UPPER(COALESCE(famille_offre, '')) IN ('PALMINVEST','TERRAPALM','PALMTERROIR');

UPDATE public.offres
SET montant_pi_par_ha = 230000,
    montant_cash_par_ha = 356000,
    mensualite_par_ha = 3500,
    montant_total_par_ha = 356000,
    duree_paiement_mois = 36,
    tranches_paiement = '[
      {"annee":1,"mois_debut":1,"mois_fin":12,"mois":12,"mensualite_par_ha":3500,"total_periode_par_ha":42000},
      {"annee":2,"mois_debut":13,"mois_fin":24,"mois":12,"mensualite_par_ha":3500,"total_periode_par_ha":42000},
      {"annee":3,"mois_debut":25,"mois_fin":36,"mois":12,"mensualite_par_ha":3500,"total_periode_par_ha":42000}
    ]'::jsonb,
    updated_at = now()
WHERE UPPER(COALESCE(famille_offre, '')) = 'PALMTERROIR';
