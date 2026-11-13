update public.notification_automations
set actif = false, updated_at = now()
where id in (
  'e868cf25-d84b-4e32-ae27-d9b3c1e41dce',
  'e548000e-a4f6-428a-8202-bb23bf1eda68',
  'c350cf16-b415-4e56-82d8-cc582a5b6e7c',
  'afb32e7e-17fe-45e2-a06a-e99cf6c10149',
  'bc33884b-a38b-485a-b0f0-0b0fc56faac6',
  '26a287fb-fff7-4c46-ae8c-711d63a40084',
  '98e9a1ed-b61e-480f-ad59-92922d667515',
  '470a0ea7-dfda-4261-b975-db43580adfe3'
) and actif = true;

update public.notification_automations
set contenu = 'Bonjour {dernier_prenom_nom}, échéance de {{montant}} FCFA du {{date_echeance}} en retard de {{jours_retard}} j. Contactez AgriCapital.',
    updated_at = now()
where id = 'ccb8de55-f66e-4c46-ae8c-711d63a40084' and actif = true;