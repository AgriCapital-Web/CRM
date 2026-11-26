-- Additive compatibility fields for the three identity categories.
alter table public.leads add column if not exists type_personne text not null default 'personne_physique';
alter table public.prospects add column if not exists type_personne text not null default 'personne_physique';
alter table public.clients add column if not exists type_personne text not null default 'personne_physique';
alter table public.proprietaires_terres add column if not exists type_personne text not null default 'personne_physique';
do $$ begin alter table public.leads add constraint leads_type_personne_check check(type_personne in ('personne_physique','personne_morale','famille_informelle')); exception when duplicate_object then null; end $$;
do $$ begin alter table public.prospects add constraint prospects_type_personne_check check(type_personne in ('personne_physique','personne_morale','famille_informelle')); exception when duplicate_object then null; end $$;
do $$ begin alter table public.clients add constraint clients_type_personne_check check(type_personne in ('personne_physique','personne_morale','famille_informelle')); exception when duplicate_object then null; end $$;
do $$ begin alter table public.proprietaires_terres add constraint proprietaires_terres_type_personne_check check(type_personne in ('personne_physique','personne_morale','famille_informelle')); exception when duplicate_object then null; end $$;
alter table public.leads add column if not exists denomination_sociale text;
alter table public.leads add column if not exists nature_organisation_code text;
alter table public.leads add column if not exists forme_juridique_code text;
alter table public.leads add column if not exists numero_enregistrement text;
alter table public.leads add column if not exists nombre_membres integer;
alter table public.leads add column if not exists responsable_legal_nom text;
alter table public.leads add column if not exists responsable_legal_prenoms text;
alter table public.leads add column if not exists responsable_legal_telephone text;
alter table public.prospects add column if not exists denomination_sociale text;
alter table public.prospects add column if not exists nature_organisation_code text;
alter table public.prospects add column if not exists forme_juridique_code text;
alter table public.prospects add column if not exists numero_enregistrement text;
alter table public.prospects add column if not exists nombre_membres integer;
alter table public.prospects add column if not exists responsable_legal_nom text;
alter table public.prospects add column if not exists responsable_legal_prenoms text;
alter table public.prospects add column if not exists responsable_legal_telephone text;
alter table public.clients add column if not exists denomination_sociale text;
alter table public.clients add column if not exists nature_organisation_code text;
alter table public.clients add column if not exists forme_juridique_code text;
alter table public.clients add column if not exists numero_enregistrement text;
alter table public.clients add column if not exists nombre_membres integer;
alter table public.clients add column if not exists responsable_legal_nom text;
alter table public.clients add column if not exists responsable_legal_prenoms text;
alter table public.clients add column if not exists responsable_legal_telephone text;
alter table public.proprietaires_terres add column if not exists nature_organisation_code text;
alter table public.proprietaires_terres add column if not exists forme_juridique_code text;
alter table public.proprietaires_terres add column if not exists responsable_legal_nom text;
alter table public.proprietaires_terres add column if not exists responsable_legal_prenoms text;
alter table public.proprietaires_terres add column if not exists responsable_legal_telephone text;
update public.proprietaires_terres set type_personne=case when type_proprietaire='personne_morale' then 'personne_morale' when type_proprietaire in ('famille_groupement','famille_informelle') then 'famille_informelle' else 'personne_physique' end where type_proprietaire is not null;
CREATE OR REPLACE FUNCTION private.sync_crm_party_identity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  d jsonb := to_jsonb(new);
  v_module text := tg_table_name;
  v_record_id uuid := (to_jsonb(new)->>'id')::uuid;
  v_party uuid;
  v_type text := coalesce(d->>'type_personne','personne_physique');
  v_nom text := coalesce(nullif(d->>'nom_famille',''), nullif(d->>'nom',''));
  v_prenoms text := nullif(d->>'prenoms','');
  v_nom_complet text := nullif(d->>'nom_complet','');
  v_phone text := nullif(d->>'telephone','');
  v_email text := nullif(d->>'email','');
  v_whatsapp text := nullif(d->>'whatsapp','');
begin
  if v_module not in ('leads','prospects','clients','proprietaires_terres') then return new; end if;
  if v_module='proprietaires_terres' then
    v_type := case when d->>'type_proprietaire'='personne_morale' then 'personne_morale'
      when d->>'type_proprietaire' in ('famille_groupement','famille_informelle') then 'famille_informelle'
      else coalesce(d->>'type_personne','personne_physique') end;
    if v_type='personne_morale' then
      v_nom_complet := coalesce(nullif(d->>'denomination_sociale',''),v_nom_complet);
    elsif v_type='famille_informelle' then
      v_nom_complet := coalesce(nullif(d->>'nom',''),nullif(d->>'nom_complet',''));
    else
      v_nom_complet := coalesce(v_nom_complet,concat_ws(' ',v_prenoms,v_nom));
    end if;
  else
    v_nom_complet := coalesce(v_nom_complet,concat_ws(' ',v_prenoms,v_nom));
  end if;

  select l.party_id into v_party from public.crm_party_links l
    where l.module_code=v_module and l.record_id=v_record_id;

  if v_party is null and v_module='leads' then
    select l.party_id into v_party from public.crm_party_links l where
      (l.module_code='prospects' and l.record_id=(d->>'prospect_id')::uuid)
      or (l.module_code='proprietaires_terres' and l.record_id=(d->>'proprietaire_id')::uuid)
      or (l.module_code='clients' and l.record_id=(d->>'client_id')::uuid)
    limit 1;
  elsif v_party is null and v_module='prospects' then
    select l.party_id into v_party from public.crm_party_links l where
      (l.module_code='leads' and l.record_id=(d->>'lead_id')::uuid)
      or (l.module_code='clients' and l.record_id=(d->>'client_id')::uuid)
      or (l.module_code='proprietaires_terres' and l.record_id=(d->>'proprietaire_id')::uuid)
    limit 1;
  elsif v_party is null and v_module='clients' then
    select l.party_id into v_party from public.crm_party_links l
    where (l.module_code='leads' and l.record_id in (select id from public.leads where client_id=v_record_id))
       or (l.module_code='prospects' and l.record_id in (select id from public.prospects where client_id=v_record_id))
    limit 1;
  end if;

  if v_party is null then
    insert into public.crm_parties(type_personne,civilite,nom,prenoms,nom_complet,denomination_sociale,
      nature_organisation_code,forme_juridique_code,numero_enregistrement,nom_famille,
      responsable_legal_nom,responsable_legal_prenoms,responsable_legal_telephone,
      telephone,telephone_secondaire,whatsapp,email,region_id,district_id,departement_id,
      sous_prefecture_id,village_id,metadata,created_at,updated_at,created_by)
    values(v_type,nullif(d->>'civilite',''),v_nom,v_prenoms,v_nom_complet,
      nullif(d->>'denomination_sociale',''),nullif(d->>'nature_organisation_code',''),
      nullif(d->>'forme_juridique_code',''),nullif(d->>'numero_enregistrement',''),v_nom,
      nullif(d->>'responsable_legal_nom',''),nullif(d->>'responsable_legal_prenoms',''),
      nullif(d->>'responsable_legal_telephone',''),v_phone,nullif(d->>'telephone_secondaire',''),
      v_whatsapp,v_email,nullif(d->>'region_id','')::uuid,nullif(d->>'district_id','')::uuid,
      nullif(d->>'departement_id','')::uuid,nullif(d->>'sous_prefecture_id','')::uuid,
      nullif(d->>'village_id','')::uuid,jsonb_build_object('source_module',v_module,'source_record_id',v_record_id),
      coalesce(nullif(d->>'created_at','')::timestamptz,now()),
      coalesce(nullif(d->>'updated_at','')::timestamptz,now()),nullif(d->>'created_by','')::uuid)
    returning id into v_party;
  else
    update public.crm_parties set
      type_personne=case when v_module='proprietaires_terres' then v_type when crm_parties.type_personne <> 'personne_physique' and v_type='personne_physique' then crm_parties.type_personne else v_type end,
      civilite=coalesce(nullif(d->>'civilite',''),civilite),
      nom=coalesce(v_nom,nom), prenoms=coalesce(v_prenoms,prenoms),
      nom_complet=coalesce(v_nom_complet,nom_complet),
      denomination_sociale=coalesce(nullif(d->>'denomination_sociale',''),denomination_sociale),
      nature_organisation_code=coalesce(nullif(d->>'nature_organisation_code',''),nature_organisation_code),
      forme_juridique_code=coalesce(nullif(d->>'forme_juridique_code',''),forme_juridique_code),
      numero_enregistrement=coalesce(nullif(d->>'numero_enregistrement',''),numero_enregistrement),
      nom_famille=coalesce(v_nom,nom_famille),
      responsable_legal_nom=coalesce(nullif(d->>'responsable_legal_nom',''),responsable_legal_nom),
      responsable_legal_prenoms=coalesce(nullif(d->>'responsable_legal_prenoms',''),responsable_legal_prenoms),
      responsable_legal_telephone=coalesce(nullif(d->>'responsable_legal_telephone',''),responsable_legal_telephone),
      telephone=coalesce(v_phone,telephone), whatsapp=coalesce(v_whatsapp,whatsapp), email=coalesce(v_email,email),
      region_id=coalesce(nullif(d->>'region_id','')::uuid,region_id),
      district_id=coalesce(nullif(d->>'district_id','')::uuid,district_id),
      departement_id=coalesce(nullif(d->>'departement_id','')::uuid,departement_id),
      sous_prefecture_id=coalesce(nullif(d->>'sous_prefecture_id','')::uuid,sous_prefecture_id),
      village_id=coalesce(nullif(d->>'village_id','')::uuid,village_id),
      metadata=metadata || jsonb_build_object('last_synced_module',v_module,'last_synced_record_id',v_record_id),
      updated_at=now()
    where id=v_party;
  end if;

  insert into public.crm_party_links(party_id,module_code,record_id,linked_by,metadata)
  values(v_party,v_module,v_record_id,nullif(d->>'updated_by','')::uuid,jsonb_build_object('managed_by_trigger',true))
  on conflict(module_code,record_id) do update set party_id=excluded.party_id, metadata=public.crm_party_links.metadata || excluded.metadata;
  return new;
end;
$function$
;
revoke all on function private.sync_crm_party_identity() from public, anon, authenticated;
drop trigger if exists sync_crm_party_identity_leads on public.leads;
create trigger sync_crm_party_identity_leads after insert or update of nom,prenoms,nom_famille,nom_complet,civilite,telephone,whatsapp,email,proprietaire_id,prospect_id,client_id,type_personne,denomination_sociale,nature_organisation_code,forme_juridique_code,numero_enregistrement,responsable_legal_nom,responsable_legal_prenoms,responsable_legal_telephone on public.leads for each row execute function private.sync_crm_party_identity();
drop trigger if exists sync_crm_party_identity_prospects on public.prospects;
create trigger sync_crm_party_identity_prospects after insert or update of nom,prenoms,nom_famille,nom_complet,civilite,telephone,whatsapp,email,lead_id,client_id,proprietaire_id,type_personne,denomination_sociale,nature_organisation_code,forme_juridique_code,numero_enregistrement,responsable_legal_nom,responsable_legal_prenoms,responsable_legal_telephone on public.prospects for each row execute function private.sync_crm_party_identity();
drop trigger if exists sync_crm_party_identity_clients on public.clients;
create trigger sync_crm_party_identity_clients after insert or update of nom,prenoms,nom_famille,nom_complet,civilite,telephone,whatsapp,email,type_personne,denomination_sociale,nature_organisation_code,forme_juridique_code,numero_enregistrement,responsable_legal_nom,responsable_legal_prenoms,responsable_legal_telephone on public.clients for each row execute function private.sync_crm_party_identity();
drop trigger if exists sync_crm_party_identity_owners on public.proprietaires_terres;
create trigger sync_crm_party_identity_owners after insert or update of nom,prenoms,nom_complet,civilite,telephone,whatsapp,email,type_proprietaire,denomination_sociale,numero_enregistrement,type_personne,nature_organisation_code,forme_juridique_code,responsable_legal_nom,responsable_legal_prenoms,responsable_legal_telephone on public.proprietaires_terres for each row execute function private.sync_crm_party_identity();
notify pgrst,'reload schema';