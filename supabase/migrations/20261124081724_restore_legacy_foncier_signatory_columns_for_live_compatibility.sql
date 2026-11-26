begin;

-- Keep the deployed frontend (still serving the previous form while Vercel is
-- rate-limited) operational. These columns are compatibility-only and are
-- scheduled for removal after the new frontend is deployed.
alter table public.proprietaires_terres
  add column if not exists temoin_proprietaire_nom text,
  add column if not exists temoin_proprietaire_qualite text,
  add column if not exists representant_agricapital_nom text,
  add column if not exists representant_agricapital_qualite text,
  add column if not exists leader_communautaire_nom text,
  add column if not exists leader_communautaire_qualite text,
  add column if not exists president_cvgfr_nom text,
  add column if not exists president_cvgfr_qualite text,
  add column if not exists temoin_2_nom text,
  add column if not exists temoin_2_qualite text,
  add column if not exists voisin_1_nom text,
  add column if not exists voisin_1_cote text,
  add column if not exists voisin_2_nom text,
  add column if not exists voisin_2_cote text,
  add column if not exists voisin_3_nom text,
  add column if not exists voisin_3_cote text,
  add column if not exists voisin_4_nom text,
  add column if not exists voisin_4_cote text;

comment on column public.proprietaires_terres.temoin_proprietaire_nom is
  'Compatibilité temporaire avec le frontend de production antérieur. À supprimer après déploiement du formulaire simplifié.';
comment on column public.proprietaires_terres.representant_agricapital_nom is
  'Compatibilité temporaire avec le frontend de production antérieur. À supprimer après déploiement du formulaire simplifié.';
comment on column public.proprietaires_terres.leader_communautaire_nom is
  'Compatibilité temporaire avec le frontend de production antérieur. À supprimer après déploiement du formulaire simplifié.';
comment on column public.proprietaires_terres.voisin_1_nom is
  'Compatibilité temporaire avec le frontend de production antérieur. À supprimer après déploiement du formulaire simplifié.';

-- Restore the deployed frontend's name-normalization behavior until its new
-- bundle is live. The later cleanup migration removes these references again.
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
    new.temoin_proprietaire_nom = upper(nullif(trim(new.temoin_proprietaire_nom), ''));
    new.representant_agricapital_nom = upper(nullif(trim(new.representant_agricapital_nom), ''));
    new.leader_communautaire_nom = upper(nullif(trim(new.leader_communautaire_nom), ''));
    new.voisin_1_nom = upper(nullif(trim(new.voisin_1_nom), ''));
    new.voisin_2_nom = upper(nullif(trim(new.voisin_2_nom), ''));
  else
    new.nom = upper(nullif(trim(new.nom), ''));
    new.prenoms = upper(nullif(trim(new.prenoms), ''));
  end if;
  return new;
end
$function$;

commit;
