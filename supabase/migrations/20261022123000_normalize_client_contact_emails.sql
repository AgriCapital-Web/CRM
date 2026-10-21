-- Client portal access is phone + personal access code, not a customer email.
-- Internal synthetic Auth emails must not appear as contact email addresses in CRM profiles.
update public.clients c
set email = null, updated_at = now()
where c.email is not null
  and c.email ~ '^[+0-9 ()-]+$'
  and regexp_replace(c.email, '\D', '', 'g') <> ''
  and regexp_replace(c.email, '\D', '', 'g') = regexp_replace(coalesce(c.telephone, ''), '\D', '', 'g');

update public.profiles p
set email = null, updated_at = now()
from public.clients c
where c.user_id = p.user_id
  and p.email ilike 'agc-cli-%@clients.agricapital.ci'
  and (
    c.email is null
    or c.email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'
  );
