begin;
update public.commissions cm
set montant_commission = 5000
from public.clients c
where c.id = cm.client_id
  and c.id_unique in ('AC_C000004','AC_C000006')
  and cm.type_commission = 'acquisition'
  and cm.montant_commission = 10000;
select public.recalculer_portefeuilles_commissions();
commit;