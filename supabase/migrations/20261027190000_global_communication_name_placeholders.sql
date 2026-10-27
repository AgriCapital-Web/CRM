-- Uniformise les anciens modèles : le prénom seul n'est plus utilisé en communication.
UPDATE public.notification_templates
SET contenu = regexp_replace(contenu, '\\{\\{\\s*prenom\\s*\\}\\}', '{{nom_complet}}', 'gi')
WHERE contenu ~* '\\{\\{\\s*prenom\\s*\\}\\}';

UPDATE public.notification_campaigns
SET contenu = regexp_replace(contenu, '\\{\\{\\s*prenom\\s*\\}\\}', '{{nom_complet}}', 'gi')
WHERE contenu ~* '\\{\\{\\s*prenom\\s*\\}\\}';

UPDATE public.notification_automations
SET contenu = regexp_replace(contenu, '\\{\\{\\s*prenom\\s*\\}\\}', '{{nom_complet}}', 'gi')
WHERE contenu ~* '\\{\\{\\s*prenom\\s*\\}\\}';
