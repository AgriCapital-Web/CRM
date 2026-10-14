-- Modèles de notifications client et garde-fous des longueurs.
-- Les modèles, automatisations, préférences et médias restent persistés en base.
create or replace function public.enforce_notification_message_limits()
returns trigger language plpgsql set search_path=public as $$
begin
  if lower(coalesce(new.canal,'')) in ('sms','email_sms') and char_length(regexp_replace(btrim(coalesce(new.contenu,'')), '\s+', ' ', 'g')) > 155 then
    raise exception 'Le SMS ne peut pas dépasser 155 caractères, espaces et signes compris.';
  end if;
  if lower(coalesce(new.canal,'')) = 'whatsapp' and char_length(coalesce(new.contenu,'')) > 350 then
    raise exception 'Le message WhatsApp ne peut pas dépasser 350 caractères.';
  end if;
  return new;
end $$;

drop trigger if exists notification_campaigns_message_limits on public.notification_campaigns;
create trigger notification_campaigns_message_limits before insert or update of canal,contenu on public.notification_campaigns for each row execute function public.enforce_notification_message_limits();
drop trigger if exists notification_automations_message_limits on public.notification_automations;
create trigger notification_automations_message_limits before insert or update of canal,contenu on public.notification_automations for each row execute function public.enforce_notification_message_limits();
drop trigger if exists notification_templates_message_limits on public.notification_templates;
create trigger notification_templates_message_limits before insert or update of canal,contenu on public.notification_templates for each row execute function public.enforce_notification_message_limits();

insert into public.notification_templates(code,nom,canal,evenement,sujet,contenu,variables,parcours,actif)
values
('paiement_recu_sms','Paiement reçu · SMS','sms','paiement_recu','Paiement reçu','AgriCapital: paiement de {{montant}} FCFA reçu le {{date}}. Réf. {{reference}}. Merci.','["montant","date","reference"]'::jsonb,'commun',true),
('paiement_recu_whatsapp','Paiement reçu · WhatsApp','whatsapp','paiement_recu','Paiement reçu','Bonjour {{prenom}}, paiement de {{montant}} FCFA reçu le {{date}}. Réf. {{reference}}. Merci, AgriCapital.','["prenom","montant","date","reference"]'::jsonb,'commun',true),
('paiement_recu_email','Paiement reçu · E-mail','email','paiement_recu','Confirmation de votre paiement','Bonjour {{prenom}},<p>Nous confirmons la réception de votre paiement de {{montant}} FCFA le {{date}}.</p><p>Référence : {{reference}}</p><p>Merci pour votre confiance.<br>AgriCapital</p>','["prenom","montant","date","reference"]'::jsonb,'commun',true),
('solde_regle_sms','Solde réglé · SMS','sms','solde_regle','Contrat réglé','AgriCapital: contrat {{numero_contrat}} intégralement réglé. Merci pour votre confiance.','["numero_contrat"]'::jsonb,'commun',true),
('solde_regle_whatsapp','Solde réglé · WhatsApp','whatsapp','solde_regle','Contrat intégralement réglé','Bonjour {{prenom}}, votre contrat {{numero_contrat}} est intégralement réglé. Merci pour votre confiance. AgriCapital.','["prenom","numero_contrat"]'::jsonb,'commun',true),
('solde_regle_email','Solde réglé · E-mail','email','solde_regle','Confirmation de règlement intégral','Bonjour {{prenom}},<p>Nous vous confirmons que le contrat {{numero_contrat}} est intégralement réglé.</p><p>Merci pour votre confiance.<br>AgriCapital</p>','["prenom","numero_contrat"]'::jsonb,'commun',true),
('paiement_echeance_sms','Rappel d’échéance · SMS','sms','paiement_echeance','Rappel d’échéance','AgriCapital: échéance de {{montant}} FCFA prévue le {{date_echeance}}. Merci.','["montant","date_echeance"]'::jsonb,'commun',true),
('paiement_echeance_whatsapp','Rappel d’échéance · WhatsApp','whatsapp','paiement_echeance','Rappel d’échéance','Bonjour {{prenom}}, votre échéance de {{montant}} FCFA est prévue le {{date_echeance}}. Merci, AgriCapital.','["prenom","montant","date_echeance"]'::jsonb,'commun',true),
('paiement_echeance_email','Rappel d’échéance · E-mail','email','paiement_echeance','Votre prochaine échéance','Bonjour {{prenom}},<p>Votre échéance de {{montant}} FCFA est prévue le {{date_echeance}}.</p><p>Pour toute question, contactez votre conseiller AgriCapital.</p>','["prenom","montant","date_echeance"]'::jsonb,'commun',true),
('paiement_retard_sms','Retard de paiement · SMS','sms','paiement_retard','Échéance à régulariser','AgriCapital: échéance de {{montant}} FCFA en retard de {{jours_retard}} j. Contactez votre conseiller.','["montant","jours_retard"]'::jsonb,'commun',true),
('paiement_retard_whatsapp','Retard de paiement · WhatsApp','whatsapp','paiement_retard','Échéance à régulariser','Bonjour {{prenom}}, l’échéance de {{montant}} FCFA du {{date_echeance}} présente {{jours_retard}} jour(s) de retard. Contactez AgriCapital.','["prenom","montant","date_echeance","jours_retard"]'::jsonb,'commun',true),
('paiement_retard_email','Retard de paiement · E-mail','email','paiement_retard','Point sur votre échéance','Bonjour {{prenom}},<p>Notre suivi indique une échéance de {{montant}} FCFA en retard de {{jours_retard}} jour(s), prévue le {{date_echeance}}.</p><p>Merci de contacter votre conseiller afin de régulariser la situation.</p>','["prenom","montant","jours_retard","date_echeance"]'::jsonb,'commun',true),
('document_valide_sms','Document validé · SMS','sms','document_valide','Document validé','AgriCapital: votre document a été validé. Votre dossier poursuit son traitement.','[]'::jsonb,'commun',true),
('document_valide_whatsapp','Document validé · WhatsApp','whatsapp','document_valide','Documents validés','Bonjour {{prenom}}, vos documents ont été validés. Votre dossier avance. AgriCapital.','["prenom"]'::jsonb,'commun',true),
('document_valide_email','Document validé · E-mail','email','document_valide','Validation de vos documents','Bonjour {{prenom}},<p>Les documents transmis pour votre dossier ont été validés.</p><p>Votre équipe AgriCapital poursuit le traitement.</p>','["prenom"]'::jsonb,'commun',true),
('compte_active_sms','Compte activé · SMS','sms','compte_active','Compte activé','AgriCapital: votre compte est activé. Bienvenue et merci pour votre confiance.','[]'::jsonb,'commun',true),
('compte_active_whatsapp','Compte activé · WhatsApp','whatsapp','compte_active','Bienvenue chez AgriCapital','Bonjour {{prenom}}, votre compte AgriCapital est activé. Bienvenue !','["prenom"]'::jsonb,'commun',true),
('compte_active_email','Compte activé · E-mail','email','compte_active','Votre compte AgriCapital est activé','Bonjour {{prenom}},<p>Votre compte AgriCapital est activé.</p><p>Bienvenue et merci pour votre confiance.</p>','["prenom"]'::jsonb,'commun',true),
('nouveau_client_whatsapp','Bienvenue client · WhatsApp','whatsapp','nouveau_client','Bienvenue chez AgriCapital','Bonjour {{prenom}}, votre dossier AgriCapital est créé. Notre équipe vous accompagne pour la suite.','["prenom"]'::jsonb,'commun',true),
('nouveau_client_email','Bienvenue client · E-mail','email','nouveau_client','Bienvenue chez AgriCapital','Bonjour {{prenom}},<p>Votre dossier AgriCapital a été créé.</p><p>Notre équipe vous accompagne pour les prochaines étapes.</p>','["prenom"]'::jsonb,'commun',true),
('visite_technique_whatsapp','Visite technique · WhatsApp','whatsapp','visite_technique','Rapport de visite technique','Bonjour {{prenom}}, le rapport de visite de votre plantation {{plantation}} est disponible. AgriCapital.','["prenom","plantation"]'::jsonb,'commun',true),
('visite_technique_email','Visite technique · E-mail','email','visite_technique','Rapport de visite technique','Bonjour {{prenom}},<p>Le rapport de visite de votre plantation {{plantation}} est disponible.</p><p>Votre équipe AgriCapital reste à votre disposition.</p>','["prenom","plantation"]'::jsonb,'commun',true),
('intervention_technique_whatsapp','Intervention technique · WhatsApp','whatsapp','intervention_technique','Intervention technique','Bonjour {{prenom}}, une intervention technique a été enregistrée pour votre plantation {{plantation}}. AgriCapital.','["prenom","plantation"]'::jsonb,'commun',true),
('recolte_whatsapp','Récolte · WhatsApp','whatsapp','recolte','Information récolte','Bonjour {{prenom}}, une mise à jour concernant la récolte de votre plantation {{plantation}} est disponible. AgriCapital.','["prenom","plantation"]'::jsonb,'commun',true),
('lot_attribue_whatsapp','Lot attribué · WhatsApp','whatsapp','lot_attribue','Lot attribué','Bonjour {{prenom}}, le lot {{lot_reference}} de votre dossier a été attribué. AgriCapital.','["prenom","lot_reference"]'::jsonb,'commun',true),
('plantation_activee_whatsapp','Plantation activée · WhatsApp','whatsapp','plantation_activee','Plantation activée','Bonjour {{prenom}}, votre plantation {{plantation}} est activée. Notre équipe vous accompagne. AgriCapital.','["prenom","plantation"]'::jsonb,'commun',true),
('prospect_relance_sms','Relance prospect · SMS','sms','prospect_relance','Votre projet agricole','AgriCapital: nous restons disponibles pour faire le point sur votre projet. Rappelez-nous si besoin.','[]'::jsonb,'commun',true),
('prospect_relance_whatsapp','Relance prospect · WhatsApp','whatsapp','prospect_relance','Votre projet agricole','Bonjour {{prenom}}, souhaitez-vous faire le point sur votre projet avec AgriCapital ?','["prenom"]'::jsonb,'commun',true),
('prospect_relance_email','Relance prospect · E-mail','email','prospect_relance','Faisons le point sur votre projet','Bonjour {{prenom}},<p>Nous revenons vers vous au sujet de votre projet agricole.</p><p>Répondez à ce message pour convenir de la prochaine étape avec AgriCapital.</p>','["prenom"]'::jsonb,'commun',true)
on conflict(code) do update set nom=excluded.nom,canal=excluded.canal,evenement=excluded.evenement,sujet=excluded.sujet,contenu=excluded.contenu,variables=excluded.variables,parcours=excluded.parcours,actif=true;

insert into public.notification_automations(code,nom,description,evenement,canal,sujet,contenu,criteres,actif,cooldown_minutes)
values
('client_paiement_recu_auto','Confirmation de paiement client','Confirmation lors de la validation d’un paiement','paiement_recu','auto','Paiement reçu','Bonjour {{prenom}}, paiement de {{montant}} FCFA reçu le {{date}}. Réf. {{reference}}. Merci, AgriCapital.','{"audience":"clients"}'::jsonb,true,0),
('client_solde_regle_auto','Confirmation de solde intégral réglé','Utilise le canal de finalisation défini dans la fiche client','solde_regle','auto','Contrat intégralement réglé','Bonjour {{prenom}}, votre contrat {{numero_contrat}} est intégralement réglé. Merci pour votre confiance. AgriCapital.','{"audience":"clients"}'::jsonb,true,0),
('client_echeance_auto','Rappel d’échéance client','Rappel ciblé selon les échéances réelles enregistrées','paiement_echeance','auto','Rappel d’échéance','Bonjour {{prenom}}, votre échéance de {{montant}} FCFA est prévue le {{date_echeance}}. Merci, AgriCapital.','{"audience":"clients"}'::jsonb,true,1440),
('client_retard_auto','Rappel de retard client','Rappel ciblé selon les échéances réellement en retard','paiement_retard','auto','Échéance à régulariser','Bonjour {{prenom}}, échéance de {{montant}} FCFA en retard de {{jours_retard}} j. Contactez AgriCapital.','{"audience":"clients"}'::jsonb,true,1440),
('client_document_valide_auto','Document validé client','Confirmation de validation d’un document','document_valide','auto','Document validé','Bonjour {{prenom}}, vos documents ont été validés. Votre dossier avance. AgriCapital.','{"audience":"clients"}'::jsonb,true,0),
('client_compte_active_auto','Compte client activé','Message de bienvenue lors de l’activation','compte_active','auto','Compte activé','Bonjour {{prenom}}, votre compte AgriCapital est activé. Bienvenue !','{"audience":"clients"}'::jsonb,true,0),
('client_visite_technique_auto','Rapport de visite technique','Message après publication d’un rapport visible par le client','visite_technique','auto','Rapport de visite technique','Bonjour {{prenom}}, le rapport de visite de votre plantation {{plantation}} est disponible. AgriCapital.','{"audience":"clients"}'::jsonb,true,0),
('client_intervention_technique_auto','Intervention technique enregistrée','Confirmation d’une intervention technique','intervention_technique','auto','Intervention technique','Bonjour {{prenom}}, une intervention technique a été enregistrée pour votre plantation {{plantation}}. AgriCapital.','{"audience":"clients"}'::jsonb,true,0),
('client_recolte_auto','Information récolte','Notification liée à un événement de récolte enregistré','recolte','auto','Information récolte','Bonjour {{prenom}}, une mise à jour concernant la récolte de votre plantation {{plantation}} est disponible. AgriCapital.','{"audience":"clients"}'::jsonb,true,0),
('client_lot_attribue_auto','Lot attribué','Notification d’attribution d’un lot','lot_attribue','auto','Lot attribué','Bonjour {{prenom}}, le lot {{lot_reference}} de votre dossier a été attribué. AgriCapital.','{"audience":"clients"}'::jsonb,true,0),
('client_plantation_activee_auto','Plantation activée','Notification d’activation de plantation','plantation_activee','auto','Plantation activée','Bonjour {{prenom}}, votre plantation {{plantation}} est activée. Notre équipe vous accompagne. AgriCapital.','{"audience":"clients"}'::jsonb,true,0)
on conflict(code) do update set nom=excluded.nom,description=excluded.description,evenement=excluded.evenement,canal=excluded.canal,sujet=excluded.sujet,contenu=excluded.contenu,criteres=excluded.criteres,actif=excluded.actif,cooldown_minutes=excluded.cooldown_minutes,updated_at=now();
