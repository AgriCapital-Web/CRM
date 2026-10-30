-- Backfill the canonical Nom field and remove the legacy surname column from CRM identity tables.
update public.clients
set nom = coalesce(nullif(btrim(nom_famille), ''), nullif(btrim(nom), '')),
    nom_complet = coalesce(nullif(btrim(nom_complet), ''), nullif(btrim(concat_ws(' ', nullif(btrim(nom_famille), ''), nullif(btrim(prenoms), ''))), ''))
where nullif(btrim(nom_famille), '') is not null;

update public.leads
set nom = coalesce(nullif(btrim(nom), ''), nullif(btrim(nom_famille), ''))
where nullif(btrim(nom), '') is null and nullif(btrim(nom_famille), '') is not null;

update public.prospects
set nom = coalesce(nullif(btrim(nom), ''), nullif(btrim(nom_famille), ''))
where nullif(btrim(nom), '') is null and nullif(btrim(nom_famille), '') is not null;

update public.crm_parties
set nom = coalesce(nullif(btrim(nom), ''), nullif(btrim(nom_famille), ''))
where nullif(btrim(nom), '') is null and nullif(btrim(nom_famille), '') is not null;

drop trigger if exists sync_crm_party_identity_clients on public.clients;
drop trigger if exists sync_crm_party_identity_leads on public.leads;
drop trigger if exists sync_crm_party_identity_prospects on public.prospects;
drop trigger if exists trg_clients_normalize_person_names on public.clients;
drop trigger if exists trg_sync_lead_identity_compatibility on public.leads;
drop trigger if exists trg_sync_prospect_identity_compatibility on public.prospects;

create trigger sync_crm_party_identity_clients after insert or update of nom, prenoms, nom_complet, civilite, telephone, whatsapp, email, type_personne, denomination_sociale, nature_organisation_code, forme_juridique_code, numero_enregistrement, nombre_membres, responsable_legal_nom, responsable_legal_prenoms, responsable_legal_telephone on public.clients for each row execute function private.sync_crm_party_identity();
create trigger sync_crm_party_identity_leads after insert or update of nom, prenoms, nom_complet, civilite, telephone, whatsapp, email, proprietaire_id, prospect_id, client_id, type_personne, denomination_sociale, nature_organisation_code, forme_juridique_code, numero_enregistrement, nombre_membres, responsable_legal_nom, responsable_legal_prenoms, responsable_legal_telephone on public.leads for each row execute function private.sync_crm_party_identity();
create trigger sync_crm_party_identity_prospects after insert or update of nom, prenoms, nom_complet, civilite, telephone, whatsapp, email, lead_id, client_id, proprietaire_id, type_personne, denomination_sociale, nature_organisation_code, forme_juridique_code, numero_enregistrement, nombre_membres, responsable_legal_nom, responsable_legal_prenoms, responsable_legal_telephone on public.prospects for each row execute function private.sync_crm_party_identity();
create trigger trg_clients_normalize_person_names before insert or update of nom, prenoms, nom_complet, profession, nom_pere, nom_mere, contact_urgence_nom on public.clients for each row execute function public.normalize_person_names();
create trigger trg_sync_lead_identity_compatibility before insert or update of nom, prenoms, nom_complet, civilite on public.leads for each row execute function public.sync_crm_identity_compatibility();
create trigger trg_sync_prospect_identity_compatibility before insert or update of nom, prenoms, nom_complet, civilite on public.prospects for each row execute function public.sync_crm_identity_compatibility();

do $view$
declare v_def text;
begin
  v_def := pg_get_viewdef('public.v_client_synthese'::regclass, true);
  v_def := replace(v_def, 'c_1.nom_famille,', '');
  if position('nom_famille' in v_def) > 0 then raise exception 'v_client_synthese still references nom_famille'; end if;
  drop view public.v_client_synthese;
  execute 'create view public.v_client_synthese with (security_invoker=true) as ' || v_def;
  grant select on public.v_client_synthese to authenticated, service_role;
end
$view$;

alter table public.clients drop column if exists nom_famille;
alter table public.leads drop column if exists nom_famille;
alter table public.prospects drop column if exists nom_famille;
alter table public.crm_parties drop column if exists nom_famille;
notify pgrst, 'reload schema';
