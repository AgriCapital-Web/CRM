-- Client identity model: additive validation for legal entities and informal family/group records.
-- Existing rows and physical-person workflows are deliberately left untouched.
create index if not exists clients_type_personne_idx on public.clients (type_personne);
create index if not exists crm_parties_type_personne_idx on public.crm_parties (type_personne);

create or replace function public.validate_client_identity_type()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'INSERT'
     or new.type_personne is distinct from old.type_personne
     or new.denomination_sociale is distinct from old.denomination_sociale
     or new.nature_organisation_code is distinct from old.nature_organisation_code
     or new.responsable_legal_nom is distinct from old.responsable_legal_nom
     or new.responsable_legal_prenoms is distinct from old.responsable_legal_prenoms
     or new.nombre_membres is distinct from old.nombre_membres then
    if new.type_personne = 'personne_morale' then
      if nullif(btrim(new.denomination_sociale), '') is null
         or nullif(btrim(new.nature_organisation_code), '') is null
         or nullif(btrim(new.responsable_legal_nom), '') is null
         or nullif(btrim(new.responsable_legal_prenoms), '') is null then
        raise exception using
          errcode = '23514',
          message = 'Une personne morale doit avoir une dénomination, une nature d’organisation et un responsable légal identifié.';
      end if;
    elsif new.type_personne = 'famille_informelle' then
      if nullif(btrim(new.denomination_sociale), '') is null
         or nullif(btrim(new.responsable_legal_nom), '') is null
         or nullif(btrim(new.responsable_legal_prenoms), '') is null
         or coalesce(new.nombre_membres, 0) < 2 then
        raise exception using
          errcode = '23514',
          message = 'Une famille ou un groupement informel doit avoir un nom, un représentant principal et au moins deux membres.';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_validate_client_identity_type on public.clients;
create trigger trg_validate_client_identity_type
before insert or update of type_personne, denomination_sociale, nature_organisation_code,
  responsable_legal_nom, responsable_legal_prenoms, nombre_membres
on public.clients
for each row execute function public.validate_client_identity_type();

comment on function public.validate_client_identity_type() is
'Validates person-morale and informal-family client identity fields without rewriting or blocking unrelated edits to legacy records.';
