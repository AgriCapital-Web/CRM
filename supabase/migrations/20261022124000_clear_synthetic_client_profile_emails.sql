-- Run this trusted migration in the internal account-link context so profile guards
-- do not restore generated Auth aliases as customer contact emails.
set local app.internal_account_link = 'true';

update public.profiles p
set email = null, updated_at = now()
from public.clients c
where c.user_id = p.user_id
  and p.email ilike 'agc-cli-%@clients.agricapital.ci'
  and (
    c.email is null
    or c.email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'
  );
