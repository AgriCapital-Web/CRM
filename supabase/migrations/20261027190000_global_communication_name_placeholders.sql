-- Tous les messages utilisent un seul jeton de nom : {dernier_prenom_nom}.
-- Convertit les anciens alias, en accolades simples ou doubles, dans les textes sauvegardés.
UPDATE public.notification_templates
SET contenu = regexp_replace(contenu, '\{\{?\s*(prenom|nom_complet|nom_famille|nom_prenom|nom)\s*\}?\}', '{dernier_prenom_nom}', 'gi')
WHERE contenu ~* '\{\{?\s*(prenom|nom_complet|nom_famille|nom_prenom|nom)\s*\}?\}';

UPDATE public.notification_campaigns
SET contenu = regexp_replace(contenu, '\{\{?\s*(prenom|nom_complet|nom_famille|nom_prenom|nom)\s*\}?\}', '{dernier_prenom_nom}', 'gi')
WHERE contenu ~* '\{\{?\s*(prenom|nom_complet|nom_famille|nom_prenom|nom)\s*\}?\}';

UPDATE public.notification_automations
SET contenu = regexp_replace(contenu, '\{\{?\s*(prenom|nom_complet|nom_famille|nom_prenom|nom)\s*\}?\}', '{dernier_prenom_nom}', 'gi')
WHERE contenu ~* '\{\{?\s*(prenom|nom_complet|nom_famille|nom_prenom|nom)\s*\}?\}';
