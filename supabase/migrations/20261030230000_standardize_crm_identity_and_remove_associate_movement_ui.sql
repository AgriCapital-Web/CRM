begin;

update public.leads set nom=coalesce(nullif(btrim(nom),''),nullif(btrim(nom_famille),''))
where nullif(btrim(nom),'') is null and nullif(btrim(nom_famille),'') is not null;
update public.prospects set nom=coalesce(nullif(btrim(nom),''),nullif(btrim(nom_famille),''))
where nullif(btrim(nom),'') is null and nullif(btrim(nom_famille),'') is not null;

update public.clients
set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('legacy_nom_before_identity_standardization',nom),
    nom=nullif(btrim(nom_famille),''),
    nom_complet=coalesce(nullif(btrim(nom_complet),''),trim(concat_ws(' ',nullif(btrim(nom_famille),''),nullif(btrim(prenoms),''))))
where nullif(btrim(nom_famille),'') is not null and nullif(btrim(nom),'') is not null and btrim(nom)<>btrim(nom_famille);
update public.clients
set nom=coalesce(nullif(btrim(nom),''),nullif(btrim(nom_famille),'')),
    nom_complet=coalesce(nullif(btrim(nom_complet),''),trim(concat_ws(' ',nullif(btrim(nom_famille),''),nullif(btrim(prenoms),''))))
where nullif(btrim(nom),'') is null and nullif(btrim(nom_famille),'') is not null;
update public.crm_parties set nom=coalesce(nullif(btrim(nom),''),nullif(btrim(nom_famille),''))
where nullif(btrim(nom),'') is null and nullif(btrim(nom_famille),'') is not null;

do $$
declare v_definition text;
begin
 if to_regclass('public.v_client_synthese') is not null then
  v_definition:=pg_get_viewdef('public.v_client_synthese'::regclass,true);
  v_definition:=replace(v_definition,'c_1.nom_famille,','');
  execute 'create or replace view public.v_client_synthese as '||v_definition;
 end if;
end $$;

do $$
declare r record; v_definition text;
begin
 for r in
  select p.oid,pg_get_functiondef(p.oid) definition
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','private') and p.prokind='f'
    and position('nom_famille' in pg_get_functiondef(p.oid))>0
 loop
  v_definition:=replace(r.definition,'nom_famille','nom');
  v_definition:=replace(v_definition,'clients(nom,prenoms,nom_complet,nom,telephone','clients(nom,prenoms,nom_complet,telephone');
  v_definition:=replace(v_definition,'values(p.nom,p.prenoms,trim(concat_ws('' '',p.prenoms,p.nom)),trim(concat_ws('' '',p.prenoms,p.nom)),p.telephone','values(p.nom,p.prenoms,trim(concat_ws('' '',p.nom,p.prenoms)),p.telephone');
  v_definition:=replace(v_definition,'nom,nom,prenoms,nom_complet','nom,prenoms,nom_complet');
  v_definition:=replace(v_definition,'v_nom,v_nom,v_prenoms,v_nom_complet','v_nom,v_prenoms,v_nom_complet');
  v_definition:=replace(v_definition,'numero_enregistrement,nom,nombre_membres','numero_enregistrement,nombre_membres');
  v_definition:=replace(v_definition,'nullif(d->>''numero_enregistrement'',''''),v_nom,nullif(d->>''nombre_membres'','''')::integer','nullif(d->>''numero_enregistrement'',''''),nullif(d->>''nombre_membres'','''')::integer');
  v_definition:=replace(v_definition,'civilite, nom, prenoms, nom_complet, nom,','civilite, nom, prenoms, nom_complet,');
  v_definition:=replace(v_definition,'NEW.civilite, NEW.nom, NEW.prenoms, v_name, NEW.nom,','NEW.civilite, NEW.nom, NEW.prenoms, v_name,');
  v_definition:=replace(v_definition,'concat_ws('' '',c.prenoms,c.nom)','concat_ws('' '',c.nom,c.prenoms)');
  v_definition:=replace(v_definition,'concat_ws('' '',NEW.prenoms,NEW.nom)','concat_ws('' '',NEW.nom,NEW.prenoms)');
  execute v_definition;
 end loop;
end $$;

-- Recreate identity/normalization triggers without legacy-column dependencies.
drop trigger if exists sync_crm_party_identity_leads on public.leads;
drop trigger if exists trg_sync_lead_identity_compatibility on public.leads;
drop trigger if exists sync_crm_party_identity_prospects on public.prospects;
drop trigger if exists trg_sync_prospect_identity_compatibility on public.prospects;
drop trigger if exists sync_crm_party_identity_clients on public.clients;
drop trigger if exists trg_clients_normalize_person_names on public.clients;

alter table public.leads drop column if exists nom_famille;
alter table public.prospects drop column if exists nom_famille;
alter table public.clients drop column if exists nom_famille;
alter table public.crm_parties drop column if exists nom_famille;

create trigger sync_crm_party_identity_leads
after insert or update of nom,prenoms,nom_complet,civilite,telephone,whatsapp,email,proprietaire_id,prospect_id,client_id,type_personne,denomination_sociale,nature_organisation_code,forme_juridique_code,numero_enregistrement,nombre_membres,responsable_legal_nom,responsable_legal_prenoms,responsable_legal_telephone
on public.leads for each row execute function private.sync_crm_party_identity();

create trigger trg_sync_lead_identity_compatibility
before insert or update of nom,prenoms,nom_complet,civilite
on public.leads for each row execute function public.sync_crm_identity_compatibility();

create trigger sync_crm_party_identity_prospects
after insert or update of nom,prenoms,nom_complet,civilite,telephone,whatsapp,email,lead_id,client_id,proprietaire_id,type_personne,denomination_sociale,nature_organisation_code,forme_juridique_code,numero_enregistrement,nombre_membres,responsable_legal_nom,responsable_legal_prenoms,responsable_legal_telephone
on public.prospects for each row execute function private.sync_crm_party_identity();

create trigger trg_sync_prospect_identity_compatibility
before insert or update of nom,prenoms,nom_complet,civilite
on public.prospects for each row execute function public.sync_crm_identity_compatibility();

create trigger sync_crm_party_identity_clients
after insert or update of nom,prenoms,nom_complet,civilite,telephone,whatsapp,email,type_personne,denomination_sociale,nature_organisation_code,forme_juridique_code,numero_enregistrement,nombre_membres,responsable_legal_nom,responsable_legal_prenoms,responsable_legal_telephone
on public.clients for each row execute function private.sync_crm_party_identity();

create trigger trg_clients_normalize_person_names
before insert or update of nom,prenoms,nom_complet,profession,nom_pere,nom_mere,contact_urgence_nom
on public.clients for each row execute function public.normalize_person_names();

commit;