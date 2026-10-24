-- Corrections métier initiales confirmées par la Direction.
-- Donald : contrat unique de 1 000 FCFA, intégralement payé.
update public.paiements
set montant=1000, montant_paye=1000,
    notes='Montant contractuel corrigé à 1 000 FCFA selon confirmation de la Direction; paiement intégral.'
where client_id=(select id from public.clients where id_unique='AC_C000005' and upper(nom_complet)='KOUAKOU KONAN DONALD')
  and statut='valide' and type_paiement='PI';

update public.acquisitions
set montant_pi_par_ha=1000,montant_pi_total=1000,montant_total_par_ha=1000,
    montant_total_contrat=1000,mensualite_par_ha=0,mensualite_montant=0,
    echeancier='[]'::jsonb,updated_at=now()
where client_id=(select id from public.clients where id_unique='AC_C000005' and upper(nom_complet)='KOUAKOU KONAN DONALD');

update public.clients
set montant_pi_par_ha=1000,montant_pi_total=1000,montant_total_par_ha=1000,
    montant_total_contrat=1000,paiement_initial_montant=1000,mensualite_montant=0,
    contrat_solde_at=coalesce(contrat_solde_at,now()),updated_at=now()
where id_unique='AC_C000005' and upper(nom_complet)='KOUAKOU KONAN DONALD';

-- Chaque plantation déjà enregistrée pour un client sauf Bertin est réalisée.
update public.plantations p
set surface_reellement_plantee=coalesce(nullif(p.surface_reellement_plantee,0),p.superficie_ha),
    nombre_plants_mis_en_terre=coalesce(nullif(p.nombre_plants_mis_en_terre,0),round(coalesce(p.superficie_ha,0)*143)::integer),
    date_plantation=coalesce(p.date_plantation,p.date_activation),
    statut=case when p.statut in ('en_attente','brouillon','a_valider') then 'actif' else p.statut end,
    statut_global=case when p.statut_global in ('en_attente','brouillon','a_valider') then 'actif' else coalesce(p.statut_global,p.statut,'actif') end,
    updated_at=now()
from public.clients c
where c.id=p.client_id and c.id_unique <> 'AC_C000001'
  and coalesce(c.nom_complet,'') not ilike '%BERTIN%';

-- Rattacher explicitement chaque plantation existante au contrat correspondant.
update public.plantations p
set acquisition_id=a.id,updated_at=now()
from public.acquisitions a
where a.client_id=p.client_id and p.acquisition_id is distinct from a.id;

-- Réalignement initial des commissions de vente sur la grille officielle.
-- Les changements ultérieurs de la grille ne modifieront pas ces snapshots historiques.
update public.commissions
set montant_commission=10000,date_calcul=now()
where lower(coalesce(type_commission,''))='acquisition'
  and client_id is not null and lower(coalesce(statut,'')) <> 'annule';

select public.recalculer_portefeuilles_commissions();