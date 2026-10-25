create or replace function public.decision_center_normalize_target()
returns trigger language plpgsql security definer set search_path=public,auth as $$
declare target_profile public.profiles%rowtype;
declare target_role text;
begin
 if new.target_user_id is null then
   new.target_role_code := null;
   new.department_scope := null;
   new.region_scope_id := null;
   new.district_scope_id := null;
   new.visibility_scope := 'executive';
   return new;
 end if;
 if new.target_user_id = new.created_by and not public.decision_center_is_pdg() then
   raise exception 'Une proposition ciblant son propre auteur doit être créée par la direction exécutive.';
 end if;
 select * into target_profile from public.profiles where user_id=new.target_user_id limit 1;
 if not found then raise exception 'La personne ciblée doit correspondre à un profil interne actif.'; end if;
 select role into target_role from public.user_roles where user_id=new.target_user_id order by is_primary desc, created_at asc limit 1;
 new.target_role_code := target_role;
 new.department_scope := target_profile.departement;
 new.region_scope_id := target_profile.region_id;
 new.district_scope_id := target_profile.district_id;
 if new.visibility_scope not in ('targeted','team','department','national') then new.visibility_scope := 'executive'; end if;
 return new;
end;
$$;
drop trigger if exists decision_center_normalize_target on public.decision_proposals;
create trigger decision_center_normalize_target before insert or update of target_user_id,target_role_code,visibility_scope,department_scope,region_scope_id,district_scope_id on public.decision_proposals
for each row execute function public.decision_center_normalize_target();
