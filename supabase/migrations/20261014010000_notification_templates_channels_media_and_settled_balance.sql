-- Notification CRM: médias privés, préférences de canal, modèles et événement de solde réglé
alter table public.notification_campaigns add column if not exists media_attachments jsonb not null default '[]'::jsonb;
alter table public.notification_automations add column if not exists media_attachments jsonb not null default '[]'::jsonb;
alter table public.notification_templates add column if not exists media_attachments jsonb not null default '[]'::jsonb;
alter table public.notification_deliveries add column if not exists media_attachments jsonb not null default '[]'::jsonb;
create table if not exists public.notification_client_preferences (
 client_id uuid primary key references public.clients(id) on delete cascade,
 canal_finalisation text not null default 'auto' check(canal_finalisation in ('auto','sms','whatsapp','email','email_sms')),
 canal_rappel text not null default 'auto' check(canal_rappel in ('auto','sms','whatsapp','email','email_sms')),
 updated_at timestamptz not null default now(), updated_by uuid references auth.users(id)
);
alter table public.notification_client_preferences enable row level security;
drop policy if exists notification_client_preferences_admin_select on public.notification_client_preferences;
create policy notification_client_preferences_admin_select on public.notification_client_preferences for select to authenticated using(exists(select 1 from public.user_roles ur where ur.user_id=auth.uid() and lower(ur.role) in ('pdg','dg','admin','super_admin')));
drop policy if exists notification_client_preferences_admin_write on public.notification_client_preferences;
create policy notification_client_preferences_admin_write on public.notification_client_preferences for all to authenticated using(exists(select 1 from public.user_roles ur where ur.user_id=auth.uid() and lower(ur.role) in ('pdg','dg','admin','super_admin'))) with check(exists(select 1 from public.user_roles ur where ur.user_id=auth.uid() and lower(ur.role) in ('pdg','dg','admin','super_admin')));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('notification-media','notification-media',false,52428800,array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/plain']) on conflict(id) do update set public=false,file_size_limit=52428800;
drop policy if exists notification_media_admin_upload on storage.objects;
create policy notification_media_admin_upload on storage.objects for insert to authenticated with check(bucket_id='notification-media' and exists(select 1 from public.user_roles ur where ur.user_id=auth.uid() and lower(ur.role) in ('pdg','dg','admin','super_admin')));
drop policy if exists notification_media_admin_read on storage.objects;
create policy notification_media_admin_read on storage.objects for select to authenticated using(bucket_id='notification-media' and exists(select 1 from public.user_roles ur where ur.user_id=auth.uid() and lower(ur.role) in ('pdg','dg','admin','super_admin')));
drop policy if exists notification_media_admin_delete on storage.objects;
create policy notification_media_admin_delete on storage.objects for delete to authenticated using(bucket_id='notification-media' and exists(select 1 from public.user_roles ur where ur.user_id=auth.uid() and lower(ur.role) in ('pdg','dg','admin','super_admin')));
update public.notification_templates set contenu='AgriCapital: paiement de {{montant}} FCFA reçu le {{date}}. Réf. {{reference}}. Merci.' where code='paiement_recu';
update public.notification_templates set contenu='AgriCapital: échéance de {{montant}} FCFA prévue le {{date_echeance}}. Merci.' where code='echeance_proche';
update public.notification_templates set contenu='AgriCapital: échéance de {{montant}} FCFA en retard de {{jours_retard}} j. Contactez votre conseiller.' where code='paiement_retard';
insert into public.notification_templates(code,nom,canal,evenement,sujet,contenu,variables,parcours,actif) values
('paiement_recu_whatsapp','Confirmation de paiement WhatsApp','whatsapp','paiement_recu','Paiement reçu','Bonjour {{prenom}}, nous confirmons votre paiement de {{montant}} FCFA le {{date}}. Réf. {{reference}}. Merci, AgriCapital.','["prenom","montant","date","reference"]'::jsonb,'commun',true),
('paiement_recu_email','Confirmation de paiement e-mail','email','paiement_recu','Confirmation de votre paiement','Bonjour {{prenom}},<p>Nous confirmons la réception de votre paiement de {{montant}} FCFA le {{date}}.</p><p>Référence : {{reference}}</p><p>Merci pour votre confiance.<br>AgriCapital</p>','["prenom","montant","date","reference"]'::jsonb,'commun',true),
('solde_regle_sms','Contrat intégralement réglé SMS','sms','solde_regle','Contrat réglé','AgriCapital: contrat {{numero_contrat}} intégralement réglé. Merci pour votre confiance.','["numero_contrat"]'::jsonb,'commun',true),
('solde_regle_whatsapp','Contrat intégralement réglé WhatsApp','whatsapp','solde_regle','Contrat intégralement réglé','Bonjour {{prenom}}, votre contrat {{numero_contrat}} est intégralement réglé. Merci pour votre confiance. AgriCapital.','["prenom","numero_contrat"]'::jsonb,'commun',true),
('solde_regle_email','Contrat intégralement réglé e-mail','email','solde_regle','Confirmation de règlement intégral','Bonjour {{prenom}},<p>Nous vous confirmons que le contrat {{numero_contrat}} est intégralement réglé.</p><p>Merci pour votre confiance. Votre équipe AgriCapital reste à votre disposition.</p>','["prenom","numero_contrat"]'::jsonb,'commun',true),
('echeance_whatsapp','Rappel d’échéance WhatsApp','whatsapp','paiement_echeance','Rappel d’échéance','Bonjour {{prenom}}, votre échéance de {{montant}} FCFA est prévue le {{date_echeance}}. Merci, AgriCapital.','["prenom","montant","date_echeance"]'::jsonb,'commun',true),
('retard_whatsapp','Rappel de retard WhatsApp','whatsapp','paiement_retard','Échéance à régulariser','Bonjour {{prenom}}, l’échéance de {{montant}} FCFA du {{date_echeance}} présente {{jours_retard}} jour(s) de retard. Contactez votre conseiller AgriCapital.','["prenom","montant","date_echeance","jours_retard"]'::jsonb,'commun',true),
('compte_active_sms','Compte activé SMS','sms','compte_active','Compte activé','AgriCapital: votre compte est activé. Bienvenue et merci pour votre confiance.','[]'::jsonb,'commun',true),
('document_valide_whatsapp','Documents validés WhatsApp','whatsapp','document_valide','Documents validés','Bonjour {{prenom}}, vos documents ont été validés. Votre dossier avance. AgriCapital.','["prenom"]'::jsonb,'commun',true),
('plantation_activee_whatsapp','Plantation activée WhatsApp','whatsapp','plantation_activee','Plantation activée','Bonjour {{prenom}}, votre plantation {{plantation}} est activée. Notre équipe vous accompagne. AgriCapital.','["prenom","plantation"]'::jsonb,'commun',true)
on conflict(code) do update set nom=excluded.nom,canal=excluded.canal,evenement=excluded.evenement,sujet=excluded.sujet,contenu=excluded.contenu,variables=excluded.variables,parcours=excluded.parcours,actif=true;
insert into public.notification_automations(code,nom,description,evenement,canal,sujet,contenu,criteres,actif,cooldown_minutes) values
('solde_regle_client','Confirmation de solde réglé','','solde_regle','auto','Contrat intégralement réglé','Bonjour {{prenom}}, votre contrat {{numero_contrat}} est intégralement réglé. Merci pour votre confiance. AgriCapital.','{"audience":"clients"}'::jsonb,true,0),
('paiement_echeance_client','Rappel d’échéance client','','paiement_echeance','auto','Rappel d’échéance','Bonjour {{prenom}}, votre échéance de {{montant}} FCFA est prévue le {{date_echeance}}. Merci, AgriCapital.','{"audience":"clients"}'::jsonb,true,1440),
('paiement_retard_client','Rappel de retard client','','paiement_retard','auto','Échéance à régulariser','Bonjour {{prenom}}, l’échéance de {{montant}} FCFA du {{date_echeance}} présente {{jours_retard}} jour(s) de retard. Contactez votre conseiller AgriCapital.','{"audience":"clients"}'::jsonb,true,1440)
on conflict(code) do update set nom=excluded.nom,evenement=excluded.evenement,sujet=excluded.sujet,contenu=excluded.contenu,criteres=excluded.criteres,updated_at=now();
create or replace function public.trg_paiement_notification() returns trigger language plpgsql security definer set search_path=public as $$
declare v_total numeric:=0; v_paid numeric:=0; v_paid_before numeric:=0; v_contract text;
begin
 if tg_op='INSERT' and lower(coalesce(new.statut,'')) in ('valide','paye','paid','success','successful','completed') then
  perform public.notification_emit_event('paiement_recu',jsonb_build_object('paiement_id',new.id,'client_id',new.client_id,'montant',coalesce(new.montant_paye,new.montant),'reference',new.reference,'date_paiement',new.date_paiement));
 elsif tg_op='UPDATE' and lower(coalesce(new.statut,'')) in ('valide','paye','paid','success','successful','completed') and lower(coalesce(old.statut,'')) is distinct from lower(coalesce(new.statut,'')) then
  perform public.notification_emit_event('paiement_recu',jsonb_build_object('paiement_id',new.id,'client_id',new.client_id,'montant',coalesce(new.montant_paye,new.montant),'reference',new.reference,'date_paiement',new.date_paiement));
 else return new; end if;
 select coalesce(c.montant_total_contrat,0),coalesce(c.numero_contrat,'') into v_total,v_contract from public.clients c where c.id=new.client_id;
 if coalesce(v_total,0)>0 then
  select coalesce(sum(coalesce(p.montant_paye,p.montant)),0) into v_paid from public.paiements p where p.client_id=new.client_id and lower(coalesce(p.statut,'')) in ('valide','paye','paid','success','successful','completed');
  select coalesce(sum(coalesce(p.montant_paye,p.montant)),0) into v_paid_before from public.paiements p where p.client_id=new.client_id and p.id<>new.id and lower(coalesce(p.statut,'')) in ('valide','paye','paid','success','successful','completed');
  if v_paid>=v_total and v_paid_before<v_total then perform public.notification_emit_event('solde_regle',jsonb_build_object('paiement_id',new.id,'client_id',new.client_id,'numero_contrat',v_contract,'total_paye',v_paid,'montant_total',v_total,'solde',greatest(v_total-v_paid,0))); end if;
 end if;
 return new;
end $$;
create or replace function public.enforce_notification_sms_length() returns trigger language plpgsql set search_path=public as $$
begin if lower(coalesce(new.canal,'')) in ('sms','email_sms') and char_length(coalesce(new.contenu,''))>155 then raise exception 'Le SMS ne peut pas dépasser 155 caractères, espaces et signes compris.'; end if; return new; end $$;
drop trigger if exists notification_templates_sms_length on public.notification_templates;
create trigger notification_templates_sms_length before insert or update on public.notification_templates for each row execute function public.enforce_notification_sms_length();
drop trigger if exists notification_automations_sms_length on public.notification_automations;
create trigger notification_automations_sms_length before insert or update on public.notification_automations for each row execute function public.enforce_notification_sms_length();
drop trigger if exists notification_campaigns_sms_length on public.notification_campaigns;
create trigger notification_campaigns_sms_length before insert or update on public.notification_campaigns for each row execute function public.enforce_notification_sms_length();
