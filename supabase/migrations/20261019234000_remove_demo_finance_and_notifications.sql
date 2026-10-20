-- Nettoyage ciblé des données de démonstration historiques du CRM.
-- Les journaux d'audit sont volontairement conservés.
DELETE FROM public.finance_transactions
WHERE reference IN ('DEMO-PI-2026', 'DEMO-M01-2026', 'DEMO-M02-2026')
  AND notes ILIKE '%démonstration%';

DELETE FROM public.notification_event_outbox
WHERE context->>'reference' LIKE 'DEMO-%'
   OR context->>'dedupe_key' LIKE 'demo-%';

DELETE FROM public.notifications
WHERE type = 'message_portail'
  AND message = 'KOUASSI DEMO vous a écrit.';
