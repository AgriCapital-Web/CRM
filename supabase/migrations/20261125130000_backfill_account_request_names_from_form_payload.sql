begin;

-- The public signup form builds nom_complet in the order "Nom Prénoms".
-- Recover the two dedicated fields for legacy requests created before they
-- were explicitly written to account_requests.
update public.account_requests ar
set nom = coalesce(nullif(ar.nom, ''), nullif(split_part(trim(ar.nom_complet), ' ', 1), '')),
    prenoms = coalesce(
      nullif(ar.prenoms, ''),
      nullif(regexp_replace(trim(ar.nom_complet), '^\S+\s*', ''), '')
    )
where ar.auth_user_id is not null
  and nullif(trim(coalesce(ar.nom_complet, '')), '') is not null
  and (nullif(ar.nom, '') is null or nullif(ar.prenoms, '') is null);

-- Synchronize the recovered identity and photo onto the linked staff profile.
with latest_request as (
  select distinct on (ar.auth_user_id)
    ar.auth_user_id, ar.nom, ar.prenoms, ar.photo_url, ar.poste_souhaite
  from public.account_requests ar
  where ar.auth_user_id is not null
  order by ar.auth_user_id, ar.created_at desc, ar.id desc
)
update public.profiles p
set nom = coalesce(nullif(p.nom, ''), nullif(r.nom, '')),
    prenoms = coalesce(nullif(p.prenoms, ''), nullif(r.prenoms, '')),
    photo_url = coalesce(nullif(p.photo_url, ''), nullif(r.photo_url, '')),
    poste = coalesce(nullif(r.poste_souhaite, ''), p.poste),
    updated_at = now()
from latest_request r
where p.user_id = r.auth_user_id;

commit;