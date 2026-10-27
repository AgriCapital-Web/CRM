create temporary table crm_party_identity_merge_map on commit drop as
with normalized as (
 select p.id,
   regexp_replace(coalesce(p.telephone,''),'[^0-9]','','g') as phone_key,
   (select string_agg(token,' ' order by token)
      from regexp_split_to_table(regexp_replace(lower(trim(coalesce(p.nom_complet,''))), '[^[:alnum:]]+', ' ', 'g'), '\s+') as t(token)
     where token <> '') as name_key,
   p.created_at,
   case
    when exists(select 1 from public.crm_party_links l where l.party_id=p.id and l.module_code='proprietaires_terres') then 0
    when exists(select 1 from public.crm_party_links l where l.party_id=p.id and l.module_code='clients') then 1
    when exists(select 1 from public.crm_party_links l where l.party_id=p.id and l.module_code='leads') then 2
    else 3 end as canonical_priority
 from public.crm_parties p
),
eligible as (
 select * from normalized where length(phone_key)>=8 and name_key is not null
 and cardinality(string_to_array(name_key,' '))>=2
),
ranked as (
 select e.*, first_value(id) over(partition by phone_key,name_key order by canonical_priority,created_at,id) canonical_id,
 count(*) over(partition by phone_key,name_key) cluster_size from eligible e
)
select id duplicate_id,canonical_id from ranked where cluster_size>1 and id<>canonical_id;
update public.crm_party_links l set party_id=m.canonical_id,
 metadata=l.metadata || jsonb_build_object('merged_into_central_identity',m.canonical_id,'merge_reason','same_normalized_phone_and_name_tokens')
from crm_party_identity_merge_map m where l.party_id=m.duplicate_id;
update public.crm_party_relationships r set party_id=m.canonical_id from crm_party_identity_merge_map m where r.party_id=m.duplicate_id;
update public.crm_party_relationships r set related_party_id=m.canonical_id from crm_party_identity_merge_map m where r.related_party_id=m.duplicate_id;
delete from public.crm_parties p using crm_party_identity_merge_map m where p.id=m.duplicate_id
and not exists(select 1 from public.crm_party_links l where l.party_id=p.id)
and not exists(select 1 from public.crm_party_relationships r where r.party_id=p.id or r.related_party_id=p.id);
notify pgrst,'reload schema';