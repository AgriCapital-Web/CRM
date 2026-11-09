-- Le rôle PDG est l'unique administrateur global du CRM.
-- Les helpers historiques is_admin restent inchangés pour les autres applications
-- partageant la base ; les garde-fous de profils CRM utilisent le helper dédié.
begin;

create or replace function public.guard_profiles_sensitive_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if current_setting('app.internal_coverage_sync', true) = 'true'
     or current_setting('app.internal_account_link', true) = 'true' then
    return new;
  end if;

  if private.is_global_admin((select auth.uid())) then
    if exists (
      select 1 from public.user_roles ur
      where ur.user_id = coalesce(old.user_id, old.id) and lower(trim(ur.role)) = 'pdg'
    ) and not private.is_global_admin((select auth.uid())) then
      raise exception 'Seul le PDG peut modifier le profil d’un compte PDG.' using errcode = '42501';
    end if;
    if (
      old.relation_rh in ('PDG','DG')
      or new.relation_rh in ('PDG','DG')
    ) and not private.is_global_admin((select auth.uid())) then
      raise exception 'Seul le PDG peut modifier une fonction de gouvernance.' using errcode = '42501';
    end if;
    return new;
  end if;

  new.user_id := old.user_id;
  new.taux_commission := old.taux_commission;
  new.poste := old.poste;
  new.equipe_id := old.equipe_id;
  new.actif := old.actif;
  new.district_id := old.district_id;
  new.region_id := old.region_id;
  new.departement := old.departement;
  new.relation_rh := old.relation_rh;
  new.username := old.username;
  new.email := old.email;
  new.telephone := old.telephone;
  new.telephone_indicatif := old.telephone_indicatif;
  new.telephone_local := old.telephone_local;
  new.telephone_secondaire := old.telephone_secondaire;
  new.telephone_secondaire_indicatif := old.telephone_secondaire_indicatif;
  new.telephone_secondaire_local := old.telephone_secondaire_local;
  new.whatsapp := old.whatsapp;
  new.whatsapp_indicatif := old.whatsapp_indicatif;
  new.whatsapp_local := old.whatsapp_local;
  return new;
end;
$function$;

create or replace function public.prevent_profile_privilege_escalation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if current_setting('app.internal_coverage_sync', true) = 'true'
     or current_setting('app.internal_account_link', true) = 'true' then
    return new;
  end if;

  if private.is_global_admin((select auth.uid())) then
    if exists (
      select 1 from public.user_roles ur
      where ur.user_id = coalesce(old.user_id, old.id) and lower(trim(ur.role)) = 'pdg'
    ) and not private.is_global_admin((select auth.uid())) then
      raise exception 'Seul le PDG peut modifier le profil d’un compte PDG.' using errcode = '42501';
    end if;
    if (
      old.relation_rh in ('PDG','DG')
      or new.relation_rh in ('PDG','DG')
    ) and not private.is_global_admin((select auth.uid())) then
      raise exception 'Seul le PDG peut modifier une fonction de gouvernance.' using errcode = '42501';
    end if;
    return new;
  end if;

  new.taux_commission := old.taux_commission;
  new.actif := old.actif;
  new.equipe_id := old.equipe_id;
  new.poste := old.poste;
  new.district_id := old.district_id;
  new.region_id := old.region_id;
  new.departement := old.departement;
  new.user_id := old.user_id;
  new.username := old.username;
  new.relation_rh := old.relation_rh;
  return new;
end;
$function$;

create or replace function public.guard_profiles_sensitive_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if (select auth.uid()) is null then
    return new;
  end if;

  if private.is_global_admin((select auth.uid())) then
    if new.relation_rh in ('PDG','DG')
       and not private.is_global_admin((select auth.uid())) then
      raise exception 'Seul le PDG peut créer un profil de gouvernance.' using errcode = '42501';
    end if;
    return new;
  end if;

  new.role := 'user';
  new.taux_commission := null;
  new.poste := null;
  new.equipe_id := null;
  new.departement := null;
  new.relation_rh := null;
  new.actif := false;
  return new;
end;
$function$;

-- Le profil est visible à son titulaire et aux utilisateurs disposant
-- d'une permission de gestion RH explicite.
drop policy if exists "Authenticated insert profiles" on public.profiles;
create policy "Profiles insert by permission"
  on public.profiles for insert to authenticated
  with check (
    user_id = (select auth.uid())
    or private.has_role_permission('utilisateurs.create')
  );

drop policy if exists "Profiles select self admin or hr staff" on public.profiles;
drop policy if exists "Profiles select by permission" on public.profiles;
create policy "Profiles select by permission"
  on public.profiles for select to authenticated
  using (
    user_id = (select auth.uid())
    or private.has_role_permission('utilisateurs.view')
    or private.has_role_permission('utilisateurs.update')
  );

notify pgrst, 'reload schema';
commit;
