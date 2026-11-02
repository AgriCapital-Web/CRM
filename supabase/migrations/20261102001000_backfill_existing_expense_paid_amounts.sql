update public.finance_expenses e
set paid_amount = coalesce(t.amount, e.total_amount, 0),
    total_amount = coalesce(e.total_amount, t.amount, 0),
    status = 'paid'
from public.finance_transactions t
where t.id=e.transaction_id and e.paid_amount=0 and t.direction='sortie' and t.status='valide';
