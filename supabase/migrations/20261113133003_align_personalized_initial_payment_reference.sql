update public.paiements
set reference = 'AGRICAPITAL-PI-AC_C000007-20261024',
    metadata = jsonb_set(coalesce(metadata,'{}'::jsonb), '{superficie_ha}', to_jsonb(0.5::numeric), true),
    notes = case
      when coalesce(notes,'') like '%Référence interne harmonisée le 13/11/2026%'
        then notes
      else concat_ws(E'\n', nullif(notes,''), 'Référence interne harmonisée le 13/11/2026 avec le dossier commercial AC_C000007 après rattachement du paiement à son acquisition personnalisée. Ancienne référence conservée dans le journal d’audit : AGRICAPITAL-PI-AC_B000001-20261024. Superficie de référence alignée sur l’acquisition validée : 0,5 ha.')
    end
where id = '0897dc42-5d33-409c-9b3d-a3a45b73fd5d'
  and client_id = 'ef4a9878-d3a9-4ea7-9b10-0c606dee98a8'
  and acquisition_id = '26bbf408-484a-49da-8e0d-784039e0c889'
  and type_paiement = 'PI'
  and montant_paye = 20000;
