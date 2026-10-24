alter table public.profiles
  add column if not exists type_compte text not null default 'interne';

update public.profiles p
set type_compte = 'client_portail'
from auth.users u
where u.id = p.user_id
  and u.email like '%@clients.agricapital.ci'
  and not exists (select 1 from public.user_roles ur where ur.user_id = p.user_id);