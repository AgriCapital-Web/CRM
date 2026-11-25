-- Les dossiers clients utilisent le code d'accès du portail, pas un compte Auth CRM.
-- Les comptes internes ne peuvent être liés à un dossier client qu'après attribution d'un rôle.

delete from auth.users u
where (
  exists (select 1 from public.clients c where c.user_id = u.id)
  or exists (select 1 from public.profiles p where p.user_id = u.id and p.type_compte = 'client')
)
and not exists (
  select 1 from public.profiles p
  where p.user_id = u.id and p.type_compte = 'interne' and p.actif is distinct from false
)
and not exists (select 1 from public.user_roles ur where ur.user_id = u.id)
and not exists (
  select 1 from public.account_requests ar
  where ar.auth_user_id = u.id and ar.statut = 'approuve'
);

create or replace function public.guard_client_auth_separation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid;
begin
  if tg_table_name = 'profiles' then
    if to_jsonb(new)->>'type_compte' = 'client' then
      raise exception 'Un client ne doit pas être créé comme profil Auth CRM. Le portail client utilise son code d’accès dédié.'
        using errcode = '23514';
    end if;
    return new;
  end if;

  if tg_table_name = 'clients' then
    v_user_id := nullif(to_jsonb(new)->>'user_id','')::uuid;
    if v_user_id is not null and not exists (
      select 1
      from public.profiles p
      join public.user_roles ur on ur.user_id = p.user_id
      where p.user_id = v_user_id
        and p.type_compte = 'interne'
        and p.actif is distinct from false
    ) then
      raise exception 'Un dossier client ne peut être lié qu’à un compte interne approuvé et doté d’un rôle CRM.'
        using errcode = '23514';
    end if;
    return new;
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_guard_client_profile_auth on public.profiles;
create trigger trg_guard_client_profile_auth
before insert or update of type_compte on public.profiles
for each row execute function public.guard_client_auth_separation();

drop trigger if exists trg_guard_client_user_auth_link on public.clients;
create trigger trg_guard_client_user_auth_link
before insert or update of user_id on public.clients
for each row execute function public.guard_client_auth_separation();

comment on function public.guard_client_auth_separation() is
'Empêche la création de profils Auth client et réserve le lien clients.user_id aux comptes internes actifs avec rôle CRM.';
