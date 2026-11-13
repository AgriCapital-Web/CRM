update public.notification_campaigns
set statut = 'partiel', updated_at = now()
where id in (
  '64c6fa70-2275-4f8b-a1b2-fef72437d42a',
  'f213f6f4-8d81-42ad-be19-d6696088c9e0',
  '1b1fe83b-6908-43e5-9d58-5032607a0832'
)
and statut = 'active'
and termine_le is not null
and total_echecs > 0;