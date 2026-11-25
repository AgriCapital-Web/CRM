-- Aucun dossier client n'est relié à un compte Auth, même si la même personne est salariée.
-- Le portail identifie le client par son dossier et son téléphone ; le CRM identifie le salarié par son compte interne.

update public.clients set user_id = null where user_id is not null;
alter table public.clients drop constraint if exists clients_user_id_fkey;

create or replace function public.guard_client_auth_separation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_table_name = 'profiles' then
    if to_jsonb(new)->>'type_compte' = 'client' then
      raise exception 'Un client ne doit pas être créé comme profil Auth CRM. Le portail client utilise son code d’accès dédié.'
        using errcode = '23514';
    end if;
    return new;
  end if;

  if tg_table_name = 'clients' then
    if nullif(to_jsonb(new)->>'user_id','') is not null then
      raise exception 'Aucun dossier client ne peut être relié à un compte Auth CRM. Le portail client utilise son identité client séparée.'
        using errcode = '23514';
    end if;
    return new;
  end if;

  return new;
end;
$function$;

comment on function public.guard_client_auth_separation() is
'Empêche les profils Auth de type client et toute relation clients.user_id ; les dossiers clients et les comptes internes restent séparés.';
