CREATE OR REPLACE FUNCTION private.crm_identity_name_key(p_value text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog'
AS $function$ select coalesce((select string_agg(token,' ' order by token) from regexp_split_to_table(regexp_replace(lower(coalesce(p_value,'')),'[^[:alnum:]]+',' ','g'),'\s+') as t(token) where token<>''),''); $function$
;

CREATE OR REPLACE FUNCTION private.crm_normalize_phone(p_value text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog'
AS $function$
declare v text := regexp_replace(coalesce(p_value,''),'[^0-9]','','g');
begin if left(v,2)='00' then v:=substr(v,3); end if; if left(v,3)='225' and length(v)=13 then v:=substr(v,4); end if; if length(v)<8 then return null; end if; return v; end; $function$
;

CREATE OR REPLACE FUNCTION private.resolve_crm_party_for_record(p_module text, p_record_id uuid, p_data jsonb, p_type text)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
 v_name text := private.crm_identity_name_key(coalesce(nullif(p_data->>'denomination_sociale',''),nullif(p_data->>'nom_famille',''),nullif(p_data->>'nom_complet',''),concat_ws(' ',nullif(p_data->>'prenoms',''),nullif(p_data->>'nom',''))));
 v_email text := lower(trim(coalesce(p_data->>'email','')));
 v_phone_a text := private.crm_normalize_phone(p_data->>'telephone');
 v_phone_b text := private.crm_normalize_phone(p_data->>'telephone_secondaire');
 v_phone_c text := private.crm_normalize_phone(p_data->>'whatsapp');
 v_match_count integer := 0; v_party uuid;
begin
 if v_name='' or (v_email='' and v_phone_a is null and v_phone_b is null and v_phone_c is null) then return null; end if;
 with source_rows as (
  select l.module_code,l.record_id,l.party_id,to_jsonb(t) d from public.crm_party_links l join public.leads t on l.module_code='leads' and t.id=l.record_id
  union all select l.module_code,l.record_id,l.party_id,to_jsonb(t) from public.crm_party_links l join public.prospects t on l.module_code='prospects' and t.id=l.record_id
  union all select l.module_code,l.record_id,l.party_id,to_jsonb(t) from public.crm_party_links l join public.clients t on l.module_code='clients' and t.id=l.record_id
  union all select l.module_code,l.record_id,l.party_id,to_jsonb(t) from public.crm_party_links l join public.proprietaires_terres t on l.module_code='proprietaires_terres' and t.id=l.record_id
 ), normalized as (
  select s.party_id,private.crm_identity_name_key(coalesce(nullif(s.d->>'denomination_sociale',''),nullif(s.d->>'nom_famille',''),nullif(s.d->>'nom_complet',''),concat_ws(' ',nullif(s.d->>'prenoms',''),nullif(s.d->>'nom','')))) name_key,
   lower(trim(coalesce(s.d->>'email',''))) email_key,
   coalesce(nullif(s.d->>'type_personne',''),case when s.module_code='proprietaires_terres' and s.d->>'type_proprietaire'='personne_morale' then 'personne_morale' when s.module_code='proprietaires_terres' and s.d->>'type_proprietaire' in ('famille_groupement','famille_informelle') then 'famille_informelle' else null end) person_type,
   private.crm_normalize_phone(s.d->>'telephone') phone_a,private.crm_normalize_phone(s.d->>'telephone_secondaire') phone_b,private.crm_normalize_phone(s.d->>'whatsapp') phone_c
  from source_rows s where not (s.module_code=p_module and s.record_id=p_record_id)
 ), matches as (
  select distinct n.party_id from normalized n where n.name_key=v_name and (p_type is null or n.person_type is null or n.person_type=p_type)
  and ((v_email<>'' and n.email_key=v_email) or (v_phone_a is not null and v_phone_a in(n.phone_a,n.phone_b,n.phone_c)) or (v_phone_b is not null and v_phone_b in(n.phone_a,n.phone_b,n.phone_c)) or (v_phone_c is not null and v_phone_c in(n.phone_a,n.phone_b,n.phone_c)))
 )
 select count(*),(array_agg(party_id))[1] into v_match_count,v_party from matches;
 if v_match_count=1 then return v_party; end if; return null;
end; $function$
;

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
    v_party := private.resolve_crm_party_for_record(v_module, v_record_id, d, v_type);
  end if;

  if v_party is null then
    insert into public.crm_parties(type_personne,civilite,nom,prenoms,nom_complet,denomination_sociale,
      nature_organisation_code,forme_juridique_code,numero_enregistrement,nom_famille,nombre_membres,
      responsable_legal_nom,responsable_legal_prenoms,responsable_legal_telephone,
      telephone,telephone_secondaire,whatsapp,email,region_id,district_id,departement_id,
      sous_prefecture_id,village_id,metadata,created_at,updated_at,created_by)
    values(v_type,nullif(d->>'civilite',''),v_nom,v_prenoms,v_nom_complet,
      nullif(d->>'denomination_sociale',''),nullif(d->>'nature_organisation_code',''),
      nullif(d->>'forme_juridique_code',''),nullif(d->>'numero_enregistrement',''),v_nom,nullif(d->>'nombre_membres','')::integer,
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
      type_personne=case when v_module='proprietaires_terres' then v_type when exists(select 1 from public.crm_party_links owner_link where owner_link.party_id=crm_parties.id and owner_link.module_code='proprietaires_terres') then crm_parties.type_personne else v_type end,
      civilite=coalesce(nullif(d->>'civilite',''),civilite),
      nom=coalesce(v_nom,nom), prenoms=coalesce(v_prenoms,prenoms),
      nom_complet=coalesce(v_nom_complet,nom_complet),
      denomination_sociale=coalesce(nullif(d->>'denomination_sociale',''),denomination_sociale),
      nature_organisation_code=coalesce(nullif(d->>'nature_organisation_code',''),nature_organisation_code),
      forme_juridique_code=coalesce(nullif(d->>'forme_juridique_code',''),forme_juridique_code),
      numero_enregistrement=coalesce(nullif(d->>'numero_enregistrement',''),numero_enregistrement),
      nom_famille=coalesce(v_nom,nom_famille),
      nombre_membres=coalesce(nullif(d->>'nombre_membres','')::integer,nombre_membres),
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

CREATE OR REPLACE FUNCTION public.notification_resolve_recipients(_criteres jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(source_type text, source_id uuid, user_id uuid, nom_complet text, email text, telephone text, role_code text, offre_id uuid, offre_code text, offre_nom text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
with contacts(source_type,source_id,user_id,nom_complet,email,telephone,role_code,offre_id,offre_code,offre_nom) as (
 select 'equipe',p.id,p.user_id,p.nom_complet,p.email,coalesce(p.telephone,p.whatsapp),ur.role,null::uuid,null::text,null::text
 from public.profiles p
 left join lateral (select r.role from public.user_roles r where r.user_id=p.user_id order by r.created_at limit 1) ur on true
 where coalesce(p.actif,true) and public.is_staff(p.user_id)
 union all
 select case when c.proprietaire_id is not null and c.type_client='beneficiaire_particulier' then 'proprietaire_foncier+beneficiaire_particulier'
 when c.proprietaire_id is not null then 'proprietaire_foncier' when c.type_client='beneficiaire_particulier' then 'beneficiaire_particulier' else 'client' end,
 c.id,c.user_id,coalesce(nullif(c.nom_complet,''),concat_ws(' ',c.prenoms,c.nom_famille)),c.email,coalesce(c.telephone,c.whatsapp),null::text,c.offre_id,o.code,o.nom
 from public.clients c left join public.offres o on o.id=c.offre_id
 where coalesce(c.statut_global,'actif') not in ('archive','supprime') and coalesce(c.compte_actif,true)
 union all
 select 'prospect',l.id,null::uuid,concat_ws(' ',nullif(l.prenoms,''),nullif(l.nom,'')),l.email,coalesce(nullif(l.whatsapp,''),l.telephone),null::text,o.id,l.offre_code,o.nom
 from public.leads l left join public.offres o on lower(o.code)=lower(l.offre_code)
 where l.etape_pipeline='prospect' and coalesce(l.statut,'') not in ('converti','converti_client','archive','supprime') and l.client_id is null
 and l.proprietaire_id is null
 and not exists (select 1 from public.crm_party_links lead_link join public.crm_party_links effective_link on effective_link.party_id=lead_link.party_id where lead_link.module_code='leads' and lead_link.record_id=l.id and effective_link.module_code in ('clients','proprietaires_terres'))
 union all
 select 'lead',l.id,null::uuid,concat_ws(' ',nullif(l.prenoms,''),nullif(l.nom,'')),l.email,coalesce(nullif(l.whatsapp,''),l.telephone),null::text,o.id,l.offre_code,o.nom
 from public.leads l left join public.offres o on lower(o.code)=lower(l.offre_code)
 where coalesce(l.etape_pipeline,'lead') <> 'prospect'
 and coalesce(l.statut,'') not in ('converti','converti_client','archive','supprime')
 and l.client_id is null
 and l.proprietaire_id is null
 and not exists (select 1 from public.crm_party_links lead_link join public.crm_party_links effective_link on effective_link.party_id=lead_link.party_id where lead_link.module_code='leads' and lead_link.record_id=l.id and effective_link.module_code in ('clients','proprietaires_terres'))
)
select c.* from contacts c
where (
 coalesce(_criteres->>'audience','tous') in ('tous','all')
 or (coalesce(_criteres->>'audience','') in ('clients','client') and c.source_type='client')
 or (coalesce(_criteres->>'audience','') in ('leads','lead') and c.source_type='lead')
 or (coalesce(_criteres->>'audience','') in ('prospects','prospect') and c.source_type='prospect')
 or (coalesce(_criteres->>'audience','') in ('proprietaires_fonciers','proprietaire_foncier','owners') and c.source_type like 'proprietaire_foncier%')
 or (coalesce(_criteres->>'audience','') in ('beneficiaires_particuliers','beneficiaire_particulier','beneficiaries') and c.source_type like '%beneficiaire_particulier%')
 or (coalesce(_criteres->>'audience','') in ('equipe','equipe_interne','staff','team') and c.source_type='equipe')
 or (coalesce(_criteres->>'audience','')='commerciaux' and c.role_code in ('commercial','responsable_commercial','chef_equipe_commercial'))
 or (coalesce(_criteres->>'audience','')='palminvest' and lower(coalesce(c.offre_code,''))='palm-invest')
 or (coalesce(_criteres->>'audience','')='terrapalm' and lower(coalesce(c.offre_code,''))='terra-palm')
 or (coalesce(_criteres->>'audience','')='palmterroir' and lower(coalesce(c.offre_code,''))='palmterroir')
)
and (nullif(_criteres->>'offer_code','') is null or lower(coalesce(c.offre_code,''))=lower(_criteres->>'offer_code'))
and (nullif(_criteres->>'role_code','') is null or c.role_code=_criteres->>'role_code')
and (nullif(_criteres->>'has_email','') is null or case when (_criteres->>'has_email')::boolean then nullif(trim(c.email),'') is not null else nullif(trim(c.email),'') is null end)
and (nullif(_criteres->>'has_phone','') is null or case when (_criteres->>'has_phone')::boolean then nullif(trim(c.telephone),'') is not null else nullif(trim(c.telephone),'') is null end);
$function$
;

revoke all on function private.crm_identity_name_key(text) from public, anon, authenticated;

revoke all on function private.crm_normalize_phone(text) from public, anon, authenticated;

revoke all on function private.resolve_crm_party_for_record(text, uuid, jsonb, text) from public, anon, authenticated;

notify pgrst, 'reload schema';