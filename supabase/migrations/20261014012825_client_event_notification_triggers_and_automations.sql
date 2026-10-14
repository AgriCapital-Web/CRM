-- Déclencher les notifications client sur les événements CRM réellement enregistrés
create or replace function public.trg_notification_client_created() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if coalesce(new.is_internal,false)=false then
  perform public.notification_emit_event('nouveau_client',jsonb_build_object('client_id',new.id,'numero_contrat',new.numero_contrat,'offre',coalesce(new.formule_nom,new.famille_offre,''),'date',new.created_at,'prenom',split_part(coalesce(new.nom_complet,new.nom,'Client'),' ',1)));
 end if; return new;
end $$;
drop trigger if exists trg_notification_client_created on public.clients;
create trigger trg_notification_client_created after insert on public.clients for each row execute function public.trg_notification_client_created();

create or replace function public.trg_notification_document_validated() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if lower(coalesce(new.statut,'')) in ('valide','validé','approved','approuve','approuvé') and (tg_op='INSERT' or lower(coalesce(old.statut,'')) is distinct from lower(coalesce(new.statut,''))) then
  perform public.notification_emit_event('document_valide',jsonb_build_object('client_id',new.client_id,'document_id',new.id,'type_document',coalesce(new.type_document,new.categorie,''),'date',coalesce(new.validated_at,now())));
 end if; return new;
end $$;
drop trigger if exists trg_notification_document_validated on public.documents_acquisition;
create trigger trg_notification_document_validated after insert or update of statut on public.documents_acquisition for each row execute function public.trg_notification_document_validated();

create or replace function public.trg_notification_technical_visit() returns trigger language plpgsql security definer set search_path=public as $$
declare v_plantation text;
begin
 if coalesce(new.client_visible,false)=true and lower(coalesce(new.statut,'')) in ('valide','validé','termine','terminé','terminee','terminée','realise','réalisé','realisee','réalisée','publie','publié')
 and (tg_op='INSERT' or lower(coalesce(old.statut,'')) is distinct from lower(coalesce(new.statut,'')) or coalesce(old.client_visible,false)=false) then
  select coalesce(p.nom_plantation,p.id_unique,'Plantation') into v_plantation from public.plantations p where p.id=new.plantation_id;
  perform public.notification_emit_event('visite_technique',jsonb_build_object('client_id',new.client_id,'rapport_id',new.id,'plantation_id',new.plantation_id,'plantation',coalesce(v_plantation,'Plantation'),'date_visite',new.date_visite,'etat',new.etat_plantation,'recommandations',new.recommandations));
 end if; return new;
end $$;
drop trigger if exists trg_notification_technical_visit on public.rapports_visites_techniques;
create trigger trg_notification_technical_visit after insert or update of statut,client_visible on public.rapports_visites_techniques for each row execute function public.trg_notification_technical_visit();

create or replace function public.trg_notification_technical_intervention() returns trigger language plpgsql security definer set search_path=public as $$
declare v_plantation text;
begin
 if lower(coalesce(new.statut,'')) in ('valide','validé','termine','terminé','terminee','terminée','realise','réalisé','realisee','réalisée','cloture','clôturé')
 and (tg_op='INSERT' or lower(coalesce(old.statut,'')) is distinct from lower(coalesce(new.statut,''))) then
  select coalesce(p.nom_plantation,p.id_unique,'Plantation') into v_plantation from public.plantations p where p.id=new.plantation_id;
  perform public.notification_emit_event('intervention_technique',jsonb_build_object('client_id',new.client_id,'intervention_id',new.id,'plantation_id',new.plantation_id,'plantation',coalesce(v_plantation,'Plantation'),'date_intervention',new.date_intervention,'type_intervention',new.type_intervention,'recommandations',new.recommandations));
 end if; return new;
end $$;
drop trigger if exists trg_notification_technical_intervention on public.interventions_techniques;
create trigger trg_notification_technical_intervention after insert or update of statut on public.interventions_techniques for each row execute function public.trg_notification_technical_intervention();

insert into public.notification_automations(code,nom,description,evenement,canal,sujet,contenu,criteres,actif,cooldown_minutes) values
('nouveau_client_bienvenue','Bienvenue nouveau client','','nouveau_client','auto','Bienvenue chez AgriCapital','Bonjour {{prenom}}, bienvenue chez AgriCapital. Votre dossier {{numero_contrat}} est enregistré. Notre équipe vous accompagne.','{"audience":"clients"}'::jsonb,true,0),
('document_valide_client','Confirmation de validation des documents','','document_valide','auto','Documents validés','Bonjour {{prenom}}, vos documents ont été validés. Votre dossier avance. AgriCapital.','{"audience":"clients"}'::jsonb,true,0),
('visite_technique_client','Compte rendu de visite technique disponible','','visite_technique','auto','Votre visite technique','Bonjour {{prenom}}, le rapport de visite du {{date_visite}} pour {{plantation}} est disponible. AgriCapital.','{"audience":"clients"}'::jsonb,true,0),
('intervention_technique_client','Intervention technique enregistrée','','intervention_technique','auto','Intervention technique','Bonjour {{prenom}}, une intervention technique a été enregistrée pour {{plantation}} le {{date_intervention}}. AgriCapital.','{"audience":"clients"}'::jsonb,true,0)
on conflict(code) do update set nom=excluded.nom,evenement=excluded.evenement,sujet=excluded.sujet,contenu=excluded.contenu,criteres=excluded.criteres,updated_at=now();

insert into public.notification_templates(code,nom,canal,evenement,sujet,contenu,variables,parcours,actif) values
('nouveau_client_sms','Bienvenue nouveau client SMS','sms','nouveau_client','Bienvenue','AgriCapital: bienvenue {{prenom}}. Votre dossier {{numero_contrat}} est enregistré.','["prenom","numero_contrat"]'::jsonb,'commun',true),
('nouveau_client_whatsapp','Bienvenue nouveau client WhatsApp','whatsapp','nouveau_client','Bienvenue chez AgriCapital','Bonjour {{prenom}}, bienvenue chez AgriCapital. Votre dossier {{numero_contrat}} est enregistré. Notre équipe vous accompagne.','["prenom","numero_contrat"]'::jsonb,'commun',true),
('document_valide_sms','Documents validés SMS','sms','document_valide','Documents validés','AgriCapital: vos documents sont validés. Votre dossier avance. Merci.','[]'::jsonb,'commun',true),
('visite_technique_sms','Rapport technique disponible SMS','sms','visite_technique','Rapport technique','AgriCapital: rapport de visite du {{date_visite}} disponible dans votre espace client.','["date_visite"]'::jsonb,'commun',true),
('intervention_technique_sms','Intervention technique SMS','sms','intervention_technique','Intervention technique','AgriCapital: intervention réalisée le {{date_intervention}} sur {{plantation}}.','["date_intervention","plantation"]'::jsonb,'commun',true)
on conflict(code) do update set nom=excluded.nom,canal=excluded.canal,evenement=excluded.evenement,sujet=excluded.sujet,contenu=excluded.contenu,variables=excluded.variables,parcours=excluded.parcours,actif=true;