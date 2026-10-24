update public.profiles p
set relation_rh = 'Client portail',
    poste = coalesce(nullif(btrim(p.poste), ''), 'Accès portail client'),
    updated_at = now()
from auth.users u
where u.id = p.user_id
  and u.email like '%@clients.agricapital.ci'
  and coalesce(p.relation_rh,'') <> 'Client portail'
  and not exists (select 1 from public.user_roles ur where ur.user_id = p.user_id);