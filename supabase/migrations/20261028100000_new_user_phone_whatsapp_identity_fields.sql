-- Keep the settings > new-user form aligned with the canonical profile identity and phone fields.
alter table public.profiles add column if not exists nom text;
alter table public.profiles add column if not exists prenoms text;
alter table public.profiles add column if not exists telephone_secondaire text;
alter table public.profiles add column if not exists telephone_secondaire_local text;
alter table public.profiles add column if not exists telephone_secondaire_indicatif text;
alter table public.profiles add column if not exists telephone_principal_whatsapp boolean not null default false;
alter table public.profiles add column if not exists telephone_secondaire_whatsapp boolean not null default false;

update public.profiles
set nom = coalesce(nom, nullif(trim(split_part(trim(coalesce(nom_complet, '')), ' ', array_length(string_to_array(trim(coalesce(nom_complet, '')), ' '), 1))), '')),
    prenoms = coalesce(prenoms, nullif(trim(regexp_replace(trim(coalesce(nom_complet, '')), '\\s+[^\\s]+$', '')), ''))
where coalesce(trim(nom_complet), '') <> ''
  and (nom is null or prenoms is null);
