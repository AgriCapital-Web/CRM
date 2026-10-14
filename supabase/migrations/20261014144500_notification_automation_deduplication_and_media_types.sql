-- Idempotent configuration fixes for notification delivery.
-- Keep one active client automation per event to prevent duplicate messages.
update public.notification_automations
set actif = false, updated_at = now()
where code in (
  'compte_active_client',
  'document_valide_client',
  'intervention_technique_client',
  'paiement_echeance_client',
  'paiement_recu_client',
  'paiement_retard_client',
  'solde_regle_client',
  'visite_technique_client'
)
and actif = true;

-- Permit the media types accepted by the notification attachment UI.
update storage.buckets
set allowed_mime_types = (
  select array_agg(distinct mime order by mime)
  from unnest(
    coalesce(allowed_mime_types, array[]::text[])
    || array[
      'video/quicktime',
      'video/3gpp',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/csv'
    ]::text[]
  ) as mime
)
where id = 'notification-media';
