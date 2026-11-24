begin;

-- Preserve the few historical signatory details before removing fields that no
-- longer belong in the CRM form. The archive stays outside exposed schemas.
create schema if not exists private;

create table if not exists private.proprietaires_terres_signataires_archive (
  proprietaire_id uuid primary key
    references public.proprietaires_terres(id) on delete cascade,
  donnees jsonb not null,
  archived_at timestamptz not null default now()
);

revoke all on table private.proprietaires_terres_signataires_archive
  from public, anon, authenticated;

insert into private.proprietaires_terres_signataires_archive (proprietaire_id, donnees)
select
  id,
  jsonb_strip_nulls(jsonb_build_object(
    'temoin_proprietaire_nom', temoin_proprietaire_nom,
    'temoin_proprietaire_qualite', temoin_proprietaire_qualite,
    'representant_agricapital_nom', representant_agricapital_nom,
    'representant_agricapital_qualite', representant_agricapital_qualite,
    'leader_communautaire_nom', leader_communautaire_nom,
    'leader_communautaire_qualite', leader_communautaire_qualite,
    'president_cvgfr_nom', president_cvgfr_nom,
    'president_cvgfr_qualite', president_cvgfr_qualite,
    'temoin_2_nom', temoin_2_nom,
    'temoin_2_qualite', temoin_2_qualite,
    'voisin_1_nom', voisin_1_nom,
    'voisin_1_cote', voisin_1_cote,
    'voisin_2_nom', voisin_2_nom,
    'voisin_2_cote', voisin_2_cote,
    'voisin_3_nom', voisin_3_nom,
    'voisin_3_cote', voisin_3_cote,
    'voisin_4_nom', voisin_4_nom,
    'voisin_4_cote', voisin_4_cote
  ))
from public.proprietaires_terres
where temoin_proprietaire_nom is not null
   or temoin_proprietaire_qualite is not null
   or representant_agricapital_nom is not null
   or representant_agricapital_qualite is not null
   or leader_communautaire_nom is not null
   or leader_communautaire_qualite is not null
   or president_cvgfr_nom is not null
   or president_cvgfr_qualite is not null
   or temoin_2_nom is not null
   or temoin_2_qualite is not null
   or voisin_1_nom is not null
   or voisin_1_cote is not null
   or voisin_2_nom is not null
   or voisin_2_cote is not null
   or voisin_3_nom is not null
   or voisin_3_cote is not null
   or voisin_4_nom is not null
   or voisin_4_cote is not null
on conflict (proprietaire_id) do nothing;

-- Add a separate number field for the optional co-holder / agent identity.
alter table public.proprietaires_terres
  add column if not exists co_titulaire_numero_piece text;

-- Keep the existing name-normalization trigger valid after the obsolete
-- signatory columns are dropped.
create or replace function public.uppercase_person_names()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if tg_table_name = 'clients' then
    new.nom = upper(nullif(trim(new.nom), ''));
    new.prenoms = upper(nullif(trim(new.prenoms), ''));
    new.nom_complet = upper(nullif(trim(new.nom_complet), ''));
    new.nom = upper(nullif(trim(new.nom), ''));
    new.nom_pere = upper(nullif(trim(new.nom_pere), ''));
    new.nom_mere = upper(nullif(trim(new.nom_mere), ''));
    new.contact_urgence_nom = upper(nullif(trim(new.contact_urgence_nom), ''));
  elsif tg_table_name = 'profiles' then
    new.nom_complet = upper(nullif(trim(new.nom_complet), ''));
  elsif tg_table_name = 'proprietaires_terres' then
    new.nom = upper(nullif(trim(new.nom), ''));
    new.prenoms = upper(nullif(trim(new.prenoms), ''));
    new.nom_complet = upper(nullif(trim(new.nom_complet), ''));
    new.nom_pere = upper(nullif(trim(new.nom_pere), ''));
    new.nom_mere = upper(nullif(trim(new.nom_mere), ''));
    new.nom_representant = upper(nullif(trim(new.nom_representant), ''));
    new.co_titulaire_nom = upper(nullif(trim(new.co_titulaire_nom), ''));
  else
    new.nom = upper(nullif(trim(new.nom), ''));
    new.prenoms = upper(nullif(trim(new.prenoms), ''));
  end if;
  return new;
end
$function$;

alter table public.proprietaires_terres
  drop column if exists temoin_proprietaire_nom,
  drop column if exists temoin_proprietaire_qualite,
  drop column if exists representant_agricapital_nom,
  drop column if exists representant_agricapital_qualite,
  drop column if exists leader_communautaire_nom,
  drop column if exists leader_communautaire_qualite,
  drop column if exists president_cvgfr_nom,
  drop column if exists president_cvgfr_qualite,
  drop column if exists temoin_2_nom,
  drop column if exists temoin_2_qualite,
  drop column if exists voisin_1_nom,
  drop column if exists voisin_1_cote,
  drop column if exists voisin_2_nom,
  drop column if exists voisin_2_cote,
  drop column if exists voisin_3_nom,
  drop column if exists voisin_3_cote,
  drop column if exists voisin_4_nom,
  drop column if exists voisin_4_cote;

alter table public.documents_convention
  drop constraint if exists documents_convention_type_document_check;

alter table public.documents_convention
  add constraint documents_convention_type_document_check
  check (type_document = any (array[
    'annexe_1_pv_delimitation_croquis',
    'annexe_2_pv_consentement_familial',
    'annexe_3_acte_reconnaissance_parts',
    'annexe_4_acte_remise_jouissance',
    'annexe_5_procuration_mandataire',
    'annexe_6_copies_cni_signataires',
    'annexe_7_acte_mariage',
    'annexe_8_guide_villageois_attestation',
    'annexe_1_copies_identite_signataires',
    'annexe_3_procuration_mandataire',
    'annexe_4_attestation_droit_foncier',
    'piece_identite_recto',
    'piece_identite_verso',
    'photo_profil',
    'autre',
    'pv_delimitation',
    'acte_reconnaissance_parts',
    'pv_consentement_familial',
    'acte_remise_plantation',
    'procuration_mandataire',
    'cni_recto',
    'cni_verso',
    'croquis_parcellaire',
    'attestation_villageoise',
    'certificat_foncier',
    'convention_signee'
  ]));

commit;
