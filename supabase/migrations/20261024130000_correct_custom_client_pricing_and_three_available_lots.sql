update public.offres
set formules_configuration = formules_configuration || jsonb_build_array(
  jsonb_build_object(
    'code','PALMTERROIR_PERSONNALISEE',
    'nom','Personnalisée',
    'mensualite_par_ha',3500,
    'montant_pi_par_ha',230000,
    'duree_paiement_mois',36,
    'montant_cash_par_ha',356000,
    'montant_total_par_ha',356000,
    'utilise_tarif_commun',false,
    'tranches_paiement',jsonb_build_array(jsonb_build_object('mois',36,'type','mensualite_personnalisee','annee',1,'mois_debut',1,'mois_fin',36,'mensualite_par_ha',3500,'total_periode_par_ha',126000))
  )
), updated_at=now()
where code='PALMTERROIR'
and not exists (select 1 from jsonb_array_elements(formules_configuration) f where f->>'code'='PALMTERROIR_PERSONNALISEE');

update public.clients set montant_total_contrat=356000, updated_at=now() where id_unique='AC_C000001';
update public.clients set montant_total_contrat=416000, mensualite_montant=3500, formule_code='PALMTERROIR_PERSONNALISEE', formule_nom='Personnalisée',
  paiement_personnalise=jsonb_build_object('actif',true,'motif','Formule personnalisée confirmée : mensualité de 3 500 F CFA.','offre_reference','PALMTERROIR','mensualite',jsonb_build_object('active',true,'nombre',33,'montant',3500,'date_debut','2026-12-16','date_fin','2029-08-16','decalage_mois',3),'paiement_initial',jsonb_build_object('montant_officiel',290000,'montant_verse',100000,'solde',190000)), updated_at=now()
where id_unique='AC_C000002';
update public.clients set montant_total_contrat=200000, paiement_initial_montant=200000, montant_pi_total=200000, mensualite_montant=0, mensualite_par_ha=0,
  formule_code='PALMTERROIR_PERSONNALISEE', formule_nom='Personnalisée',
  paiement_personnalise=jsonb_build_object('actif',true,'offre_reference','PALMTERROIR','motif','Montant total confirmé à 200 000 F CFA; paiement initial de 100 000 F CFA déjà validé; solde de 100 000 F CFA.','paiement_initial',jsonb_build_object('montant_officiel',200000,'montant_verse',100000,'solde',100000),'mensualite',jsonb_build_object('active',false,'nombre',0,'montant',0)), updated_at=now()
where id_unique='AC_C000003';
update public.clients set montant_total_contrat=317000, mensualite_montant=7000, mensualite_par_ha=7000,
  formule_code='PALMTERROIR_PERSONNALISEE', formule_nom='Personnalisée',
  paiement_personnalise=jsonb_build_object('actif',true,'offre_reference','PALMTERROIR','motif','Formule personnalisée confirmée : paiement initial de 65 000 F CFA et mensualité de 7 000 F CFA.','mensualite',jsonb_build_object('active',true,'nombre',36,'montant',7000,'date_debut','2026-11-01','date_fin','2029-10-01','decalage_mois',1,'regle_speciale',true)), updated_at=now()
where id_unique='AC_C000004';
update public.clients set montant_total_contrat=100000, paiement_initial_montant=100000, montant_pi_total=100000, mensualite_montant=0,
  paiement_personnalise=jsonb_build_object('mode','comptant','montant_total',100000,'offre_declaree','Personnalisée','paiement_complet',true,'motif','Montant total confirmé par la direction : 100 000 F CFA, intégralement réglé.'), updated_at=now()
where id_unique='AC_C000005';
update public.clients set montant_total_contrat=518600, mensualite_montant=12600, updated_at=now() where id_unique='AC_C000006';
update public.paiements set montant=100000, montant_paye=100000,
  notes=concat_ws(E'\n',notes,'Montant corrigé à 100 000 F CFA sur instruction explicite de la direction le 24/10/2026.'),
  updated_at=now()
where id='dc1f93b3-54f1-457d-9744-c2ba776f4784';

insert into public.lots_hectares(parcelle_id,numero_h,surface_ha,statut,reference,notes)
select 'ac75c9cd-5d8c-437b-b8b6-664d4299a40e'::uuid, n, 1, 'disponible',
       'PAR-000008-L'||lpad(n::text,2,'0'),
       'Lot AgriCapital disponible issu des 3 ha non cédés de la parcelle ZONGO BOUKARY — GONATÉ.'
from generate_series(1,3) n
where not exists (
  select 1 from public.lots_hectares l
  where l.parcelle_id='ac75c9cd-5d8c-437b-b8b6-664d4299a40e'::uuid and l.numero_h=n
);