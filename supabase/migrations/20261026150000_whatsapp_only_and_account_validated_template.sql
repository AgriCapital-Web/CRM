-- AgriCapital CRM 1.7.2: messages WhatsApp concis et canal SMS suspendu.
-- Le service d'expédition doit aussi appliquer la règle de canal; cette migration
-- désactive les automatisations SMS/e-mail afin qu'aucune campagne planifiée ne les lance.
update public.notification_templates
set actif = false
where lower(coalesce(canal, '')) in ('sms', 'email', 'email_sms');

update public.notification_automations
set actif = false
where lower(coalesce(canal, '')) in ('sms', 'email', 'email_sms', 'auto');

update public.notification_campaigns
set statut = 'annulee'
where lower(coalesce(canal, '')) in ('sms', 'email', 'email_sms', 'auto')
  and lower(coalesce(statut, '')) in ('brouillon', 'planifiee', 'programmee', 'en_attente');

insert into public.notification_templates
  (code, nom, canal, evenement, sujet, contenu, variables, parcours, actif)
values
  ('compte_valide_whatsapp', 'Compte AgriCapital validé · WhatsApp', 'whatsapp',
   'compte_active', 'Votre compte AgriCapital est validé',
   'Bonjour {{prenom}}, votre compte AgriCapital a été validé. Vous pouvez désormais accéder à votre espace client : https://client.agricapital.ci',
   '["prenom"]'::jsonb, 'commun', true),
  ('intervention_technique_whatsapp', 'Intervention technique · WhatsApp', 'whatsapp',
   'intervention_technique', 'Intervention technique AgriCapital',
   'Bonjour {{prenom}}, une intervention technique a été enregistrée pour votre plantation {{plantation}}. Notre équipe AgriCapital reste à votre disposition.',
   '["prenom","plantation"]'::jsonb, 'commun', true)
on conflict (code) do update
set nom = excluded.nom,
    canal = excluded.canal,
    evenement = excluded.evenement,
    sujet = excluded.sujet,
    contenu = excluded.contenu,
    variables = excluded.variables,
    parcours = excluded.parcours,
    actif = true;

update public.notification_templates
set contenu = 'Bonjour {{prenom}}, votre compte AgriCapital a été validé. Vous pouvez désormais accéder à votre espace client : https://client.agricapital.ci',
    sujet = 'Votre compte AgriCapital est validé',
    actif = true
where code = 'compte_active_whatsapp';
