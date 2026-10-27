-- Central identity foundation for AgriCapital CRM.
-- Additive/backward-compatible: source module rows and legacy columns are preserved.
create table if not exists public.crm_parties (
 id uuid primary key default gen_random_uuid(),
 type_personne text not null default 'personne_physique'
   check (type_personne in ('personne_physique','personne_morale','famille_informelle')),
 civilite text, nom text, prenoms text, nom_complet text,
 denomination_sociale text, nature_organisation_code text, forme_juridique_code text,
 numero_enregistrement text, nom_famille text,
 responsable_legal_nom text, responsable_legal_prenoms text, responsable_legal_telephone text,
 telephone text, telephone_secondaire text, whatsapp text, email text, adresse text,
 region_id uuid, district_id uuid, departement_id uuid, sous_prefecture_id uuid, village_id uuid,
 metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid
);
create table if not exists public.crm_party_links (
 id uuid primary key default gen_random_uuid(),
 party_id uuid not null references public.crm_parties(id) on delete restrict,
 module_code text not null check (module_code in ('leads','prospects','clients','proprietaires_terres')),
 record_id uuid not null, linked_at timestamptz not null default now(), linked_by uuid,
 metadata jsonb not null default '{}'::jsonb,
 constraint crm_party_links_module_record_key unique(module_code,record_id)
);
create table if not exists public.crm_party_relationships (
 id uuid primary key default gen_random_uuid(),
 party_id uuid not null references public.crm_parties(id) on delete restrict,
 related_party_id uuid not null references public.crm_parties(id) on delete restrict,
 relationship_code text not null, metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(), created_by uuid,
 constraint crm_party_relationships_not_self check(party_id <> related_party_id),
 constraint crm_party_relationships_unique unique(party_id,related_party_id,relationship_code)
);
create index if not exists crm_party_links_party_id_idx on public.crm_party_links(party_id);
create index if not exists crm_party_links_record_idx on public.crm_party_links(module_code,record_id);
create index if not exists crm_party_relationships_related_idx on public.crm_party_relationships(related_party_id);
create index if not exists crm_parties_type_idx on public.crm_parties(type_personne);
create index if not exists crm_parties_phone_idx on public.crm_parties(telephone);
create index if not exists crm_parties_email_idx on public.crm_parties(lower(email));
alter table public.crm_parties enable row level security;
alter table public.crm_party_links enable row level security;
alter table public.crm_party_relationships enable row level security;

drop policy if exists crm_parties_read_linked_records on public.crm_parties;
create policy crm_parties_read_linked_records on public.crm_parties for select to authenticated
 using(exists(select 1 from public.crm_party_links l where l.party_id=crm_parties.id));
drop policy if exists crm_parties_create_by_crm_permission on public.crm_parties;
create policy crm_parties_create_by_crm_permission on public.crm_parties for insert to authenticated
 with check(private.has_role_permission('leads.create') or private.has_role_permission('prospects.create')
 or private.has_role_permission('clients.create') or private.has_role_permission('proprietaires.create'));
drop policy if exists crm_parties_update_linked_records on public.crm_parties;
create policy crm_parties_update_linked_records on public.crm_parties for update to authenticated
 using(exists(select 1 from public.crm_party_links l where l.party_id=crm_parties.id)
 and (private.has_role_permission('leads.update') or private.has_role_permission('prospects.update')
 or private.has_role_permission('clients.update') or private.has_role_permission('proprietaires.update')))
 with check(exists(select 1 from public.crm_party_links l where l.party_id=crm_parties.id)
 and (private.has_role_permission('leads.update') or private.has_role_permission('prospects.update')
 or private.has_role_permission('clients.update') or private.has_role_permission('proprietaires.update')));

drop policy if exists crm_party_links_read_source_scope on public.crm_party_links;
create policy crm_party_links_read_source_scope on public.crm_party_links for select to authenticated using(
 (module_code='leads' and exists(select 1 from public.leads s where s.id=record_id))
 or (module_code='prospects' and exists(select 1 from public.prospects s where s.id=record_id))
 or (module_code='clients' and exists(select 1 from public.clients s where s.id=record_id))
 or (module_code='proprietaires_terres' and exists(select 1 from public.proprietaires_terres s where s.id=record_id)));
drop policy if exists crm_party_links_create_source_permission on public.crm_party_links;
create policy crm_party_links_create_source_permission on public.crm_party_links for insert to authenticated with check(
 (module_code='leads' and private.has_role_permission('leads.create') and exists(select 1 from public.leads s where s.id=record_id))
 or (module_code='prospects' and private.has_role_permission('prospects.create') and exists(select 1 from public.prospects s where s.id=record_id))
 or (module_code='clients' and private.has_role_permission('clients.create') and exists(select 1 from public.clients s where s.id=record_id))
 or (module_code='proprietaires_terres' and private.has_role_permission('proprietaires.create') and exists(select 1 from public.proprietaires_terres s where s.id=record_id)));
drop policy if exists crm_party_links_update_source_permission on public.crm_party_links;
create policy crm_party_links_update_source_permission on public.crm_party_links for update to authenticated
 using((module_code='leads' and private.has_role_permission('leads.update'))
 or (module_code='prospects' and private.has_role_permission('prospects.update'))
 or (module_code='clients' and private.has_role_permission('clients.update'))
 or (module_code='proprietaires_terres' and private.has_role_permission('proprietaires.update')))
 with check((module_code='leads' and private.has_role_permission('leads.update') and exists(select 1 from public.leads s where s.id=record_id))
 or (module_code='prospects' and private.has_role_permission('prospects.update') and exists(select 1 from public.prospects s where s.id=record_id))
 or (module_code='clients' and private.has_role_permission('clients.update') and exists(select 1 from public.clients s where s.id=record_id))
 or (module_code='proprietaires_terres' and private.has_role_permission('proprietaires.update') and exists(select 1 from public.proprietaires_terres s where s.id=record_id)));
drop policy if exists crm_party_relationships_read_linked_parties on public.crm_party_relationships;
create policy crm_party_relationships_read_linked_parties on public.crm_party_relationships for select to authenticated using(
 exists(select 1 from public.crm_party_links l where l.party_id=crm_party_relationships.party_id)
 and exists(select 1 from public.crm_party_links l where l.party_id=crm_party_relationships.related_party_id));
drop policy if exists crm_party_relationships_manage_by_crm_permission on public.crm_party_relationships;
create policy crm_party_relationships_manage_by_crm_permission on public.crm_party_relationships for all to authenticated
 using(private.has_role_permission('leads.update') or private.has_role_permission('prospects.update')
 or private.has_role_permission('clients.update') or private.has_role_permission('proprietaires.update'))
 with check(private.has_role_permission('leads.update') or private.has_role_permission('prospects.update')
 or private.has_role_permission('clients.update') or private.has_role_permission('proprietaires.update'));

insert into public.referentiels_systeme(categorie,code,libelle,actif,ordre,metadata) values
 ('type_personne','personne_physique','Personne physique',true,10,'{"source":"crm_identity_v1"}'),
 ('type_personne','personne_morale','Personne morale',true,20,'{"source":"crm_identity_v1"}'),
 ('type_personne','famille_informelle','Famille (organisation familiale informelle)',true,30,'{"source":"crm_identity_v1"}'),
 ('nature_organisation','entreprise','Entreprise',true,10,'{"source":"crm_identity_v1"}'),
 ('nature_organisation','association','Association',true,20,'{"source":"crm_identity_v1"}'),
 ('nature_organisation','ong','ONG',true,30,'{"source":"crm_identity_v1"}'),
 ('nature_organisation','cooperative','Coopérative',true,40,'{"source":"crm_identity_v1"}'),
 ('nature_organisation','fondation','Fondation',true,50,'{"source":"crm_identity_v1"}'),
 ('nature_organisation','communaute','Communauté / groupement communautaire',true,60,'{"source":"crm_identity_v1"}'),
 ('nature_organisation','autre','Autre organisation',true,90,'{"source":"crm_identity_v1"}'),
 ('forme_juridique','sarl','SARL',true,10,'{"source":"crm_identity_v1"}'),
 ('forme_juridique','sa','SA',true,20,'{"source":"crm_identity_v1"}'),
 ('forme_juridique','sas','SAS',true,30,'{"source":"crm_identity_v1"}'),
 ('forme_juridique','snc','SNC',true,40,'{"source":"crm_identity_v1"}'),
 ('forme_juridique','entreprise_individuelle','Entreprise individuelle',true,50,'{"source":"crm_identity_v1"}'),
 ('forme_juridique','association_declaree','Association déclarée',true,60,'{"source":"crm_identity_v1"}'),
 ('forme_juridique','cooperative_ohada','Société coopérative OHADA',true,70,'{"source":"crm_identity_v1"}'),
 ('forme_juridique','groupement_non_formalise','Groupement non formalisé',true,80,'{"source":"crm_identity_v1"}'),
 ('forme_juridique','autre','Autre forme juridique',true,90,'{"source":"crm_identity_v1"}')
on conflict do nothing;

-- Backfill from existing modules. Reuse only explicit existing relations, never fuzzy matches.
do $$
declare r record; v_party uuid;
begin
 for r in select * from public.proprietaires_terres loop
  select party_id into v_party from public.crm_party_links where module_code='proprietaires_terres' and record_id=r.id;
  if v_party is null then
   insert into public.crm_parties(type_personne,civilite,nom,prenoms,nom_complet,telephone,telephone_secondaire,whatsapp,email,region_id,district_id,departement_id,sous_prefecture_id,village_id,metadata,created_at,updated_at)
   values('personne_physique',r.civilite,r.nom,r.prenoms,coalesce(nullif(r.nom_complet,''),concat_ws(' ',r.prenoms,r.nom)),r.telephone,r.telephone_secondaire,r.whatsapp,r.email,r.region_id,r.district_id,r.departement_id,r.sous_prefecture_id,r.village_id,jsonb_build_object('backfill_source','proprietaires_terres','source_record_id',r.id),coalesce(r.created_at,now()),coalesce(r.updated_at,now())) returning id into v_party;
   insert into public.crm_party_links(party_id,module_code,record_id,metadata) values(v_party,'proprietaires_terres',r.id,'{"backfilled":true}') on conflict(module_code,record_id) do nothing;
  end if;
 end loop;
 for r in select * from public.leads loop
  select party_id into v_party from public.crm_party_links where module_code='proprietaires_terres' and record_id=r.proprietaire_id;
  if v_party is null then select party_id into v_party from public.crm_party_links where module_code='leads' and record_id=r.id; end if;
  if v_party is null then
   insert into public.crm_parties(type_personne,civilite,nom,prenoms,nom_complet,telephone,telephone_secondaire,whatsapp,email,region_id,district_id,departement_id,sous_prefecture_id,village_id,metadata,created_at,updated_at,created_by)
   values('personne_physique',r.civilite,coalesce(nullif(r.nom_famille,''),r.nom),r.prenoms,coalesce(nullif(r.nom_complet,''),concat_ws(' ',r.prenoms,coalesce(nullif(r.nom_famille,''),r.nom))),r.telephone,r.telephone_secondaire,r.whatsapp,r.email,r.region_id,r.district_id,r.departement_id,r.sous_prefecture_id,r.village_id,jsonb_build_object('backfill_source','leads','source_record_id',r.id),r.created_at,r.updated_at,r.created_by) returning id into v_party;
  end if;
  insert into public.crm_party_links(party_id,module_code,record_id,metadata) values(v_party,'leads',r.id,'{"backfilled":true}') on conflict(module_code,record_id) do nothing;
 end loop;
 for r in select * from public.clients loop
  select l.party_id into v_party from public.leads ld join public.crm_party_links l on l.module_code='leads' and l.record_id=ld.id where ld.client_id=r.id order by ld.created_at limit 1;
  if v_party is null then select party_id into v_party from public.crm_party_links where module_code='clients' and record_id=r.id; end if;
  if v_party is null then
   insert into public.crm_parties(type_personne,civilite,nom,prenoms,nom_complet,telephone,whatsapp,email,region_id,district_id,departement_id,sous_prefecture_id,village_id,metadata,created_at,updated_at,created_by)
   values('personne_physique',r.civilite,coalesce(nullif(r.nom_famille,''),r.nom),r.prenoms,coalesce(nullif(r.nom_complet,''),concat_ws(' ',r.prenoms,coalesce(nullif(r.nom_famille,''),r.nom))),r.telephone,r.whatsapp,r.email,r.region_id,r.district_id,r.departement_id,r.sous_prefecture_id,r.village_id,jsonb_build_object('backfill_source','clients','source_record_id',r.id),coalesce(r.created_at,now()),coalesce(r.updated_at,now()),r.created_by) returning id into v_party;
  end if;
  insert into public.crm_party_links(party_id,module_code,record_id,metadata) values(v_party,'clients',r.id,'{"backfilled":true}') on conflict(module_code,record_id) do nothing;
 end loop;
 for r in select * from public.prospects loop
  select party_id into v_party from public.crm_party_links where module_code='leads' and record_id=r.lead_id;
  if v_party is null then select party_id into v_party from public.crm_party_links where module_code='clients' and record_id=r.client_id; end if;
  if v_party is null then select party_id into v_party from public.crm_party_links where module_code='proprietaires_terres' and record_id=r.proprietaire_id; end if;
  if v_party is null then select party_id into v_party from public.crm_party_links where module_code='prospects' and record_id=r.id; end if;
  if v_party is null then
   insert into public.crm_parties(type_personne,civilite,nom,prenoms,nom_complet,telephone,telephone_secondaire,whatsapp,email,region_id,district_id,departement_id,sous_prefecture_id,village_id,metadata,created_at,updated_at,created_by)
   values('personne_physique',r.civilite,coalesce(nullif(r.nom_famille,''),r.nom),r.prenoms,coalesce(nullif(r.nom_complet,''),concat_ws(' ',r.prenoms,coalesce(nullif(r.nom_famille,''),r.nom))),r.telephone,r.telephone_secondaire,r.whatsapp,r.email,r.region_id,r.district_id,r.departement_id,r.sous_prefecture_id,r.village_id,jsonb_build_object('backfill_source','prospects','source_record_id',r.id),r.created_at,r.updated_at,r.created_by) returning id into v_party;
  end if;
  insert into public.crm_party_links(party_id,module_code,record_id,metadata) values(v_party,'prospects',r.id,'{"backfilled":true}') on conflict(module_code,record_id) do nothing;
 end loop;
end $$;

create or replace view public.crm_party_duplicate_review with (security_invoker=true) as
select a.id party_id_a,b.id party_id_b,a.nom_complet nom_a,b.nom_complet nom_b,
 a.telephone telephone_a,b.telephone telephone_b,a.email email_a,b.email email_b,
 case when nullif(trim(a.telephone),'') is not null and trim(a.telephone)=trim(b.telephone) then 'telephone_identique'
 when nullif(trim(a.email),'') is not null and lower(trim(a.email))=lower(trim(b.email)) then 'email_identique' else 'nom_identique' end motif
from public.crm_parties a join public.crm_parties b on a.id<b.id
where (nullif(trim(a.telephone),'') is not null and trim(a.telephone)=trim(b.telephone))
 or (nullif(trim(a.email),'') is not null and lower(trim(a.email))=lower(trim(b.email)))
 or (nullif(trim(a.nom_complet),'') is not null and lower(trim(a.nom_complet))=lower(trim(b.nom_complet)));
grant select,insert,update on public.crm_parties to authenticated;
grant select,insert,update on public.crm_party_links to authenticated;
grant select,insert,update,delete on public.crm_party_relationships to authenticated;
grant select on public.crm_party_duplicate_review to authenticated;
notify pgrst,'reload schema';
