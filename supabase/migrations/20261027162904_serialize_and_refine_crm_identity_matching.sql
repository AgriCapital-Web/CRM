create or replace function private.resolve_crm_party_for_record(p_module text,p_record_id uuid,p_data jsonb,p_type text)
returns uuid language plpgsql volatile set search_path = pg_catalog,public,private
as $fn$
declare
 v_name text := private.crm_identity_name_key(coalesce(nullif(p_data->>'denomination_sociale',''),case when p_type='famille_informelle' then nullif(p_data->>'nom_famille','') end,nullif(p_data->>'nom_complet',''),concat_ws(' ',nullif(p_data->>'prenoms',''),nullif(p_data->>'nom',''))));
 v_email text := lower(trim(coalesce(p_data->>'email','')));
 v_phone_a text := private.crm_normalize_phone(p_data->>'telephone');
 v_phone_b text := private.crm_normalize_phone(p_data->>'telephone_secondaire');
 v_phone_c text := private.crm_normalize_phone(p_data->>'whatsapp');
 v_match_count integer := 0; v_party uuid;
begin
 if v_name='' or (v_email='' and v_phone_a is null and v_phone_b is null and v_phone_c is null) then return null; end if;
 perform pg_advisory_xact_lock(hashtextextended(v_name,0));
 with source_rows as (
  select l.module_code,l.record_id,l.party_id,to_jsonb(t) d from public.crm_party_links l join public.leads t on l.module_code='leads' and t.id=l.record_id
  union all select l.module_code,l.record_id,l.party_id,to_jsonb(t) from public.crm_party_links l join public.prospects t on l.module_code='prospects' and t.id=l.record_id
  union all select l.module_code,l.record_id,l.party_id,to_jsonb(t) from public.crm_party_links l join public.clients t on l.module_code='clients' and t.id=l.record_id
  union all select l.module_code,l.record_id,l.party_id,to_jsonb(t) from public.crm_party_links l join public.proprietaires_terres t on l.module_code='proprietaires_terres' and t.id=l.record_id
 ), typed as (
  select s.module_code,s.party_id,s.d,
   coalesce(nullif(s.d->>'type_personne',''),case when s.module_code='proprietaires_terres' and s.d->>'type_proprietaire'='personne_morale' then 'personne_morale' when s.module_code='proprietaires_terres' and s.d->>'type_proprietaire' in ('famille_groupement','famille_informelle') then 'famille_informelle' else null end) person_type,
   lower(trim(coalesce(s.d->>'email',''))) email_key,
   private.crm_normalize_phone(s.d->>'telephone') phone_a,private.crm_normalize_phone(s.d->>'telephone_secondaire') phone_b,private.crm_normalize_phone(s.d->>'whatsapp') phone_c
  from source_rows s where not (s.module_code=p_module and s.record_id=p_record_id)
 ), normalized as (
  select t.party_id,t.person_type,t.email_key,t.phone_a,t.phone_b,t.phone_c,
   private.crm_identity_name_key(coalesce(nullif(t.d->>'denomination_sociale',''),case when t.person_type='famille_informelle' then nullif(t.d->>'nom_famille','') end,nullif(t.d->>'nom_complet',''),concat_ws(' ',nullif(t.d->>'prenoms',''),nullif(t.d->>'nom','')))) name_key
  from typed t
 ), matches as (
  select distinct n.party_id from normalized n
  where n.name_key=v_name and (p_type is null or n.person_type is null or n.person_type=p_type)
   and ((v_email<>'' and n.email_key=v_email) or (v_phone_a is not null and v_phone_a in(n.phone_a,n.phone_b,n.phone_c)) or (v_phone_b is not null and v_phone_b in(n.phone_a,n.phone_b,n.phone_c)) or (v_phone_c is not null and v_phone_c in(n.phone_a,n.phone_b,n.phone_c)))
 )
 select count(*),(array_agg(party_id))[1] into v_match_count,v_party from matches;
 if v_match_count=1 then return v_party; end if;
 return null;
end; $fn$;
revoke all on function private.resolve_crm_party_for_record(text,uuid,jsonb,text) from public,anon,authenticated;