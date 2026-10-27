drop policy if exists crm_party_links_update_source_permission on public.crm_party_links;
create policy crm_party_links_update_source_permission on public.crm_party_links
for update to authenticated
using (
 (module_code='leads' and private.has_role_permission('leads.update') and exists(select 1 from public.leads s where s.id=record_id))
 or (module_code='prospects' and private.has_role_permission('prospects.update') and exists(select 1 from public.prospects s where s.id=record_id))
 or (module_code='clients' and private.has_role_permission('clients.update') and exists(select 1 from public.clients s where s.id=record_id))
 or (module_code='proprietaires_terres' and private.has_role_permission('proprietaires.update') and exists(select 1 from public.proprietaires_terres s where s.id=record_id))
)
with check (
 (module_code='leads' and private.has_role_permission('leads.update') and exists(select 1 from public.leads s where s.id=record_id))
 or (module_code='prospects' and private.has_role_permission('prospects.update') and exists(select 1 from public.prospects s where s.id=record_id))
 or (module_code='clients' and private.has_role_permission('clients.update') and exists(select 1 from public.clients s where s.id=record_id))
 or (module_code='proprietaires_terres' and private.has_role_permission('proprietaires.update') and exists(select 1 from public.proprietaires_terres s where s.id=record_id))
);
drop policy if exists crm_party_relationships_manage_by_crm_permission on public.crm_party_relationships;
create policy crm_party_relationships_create_by_crm_permission on public.crm_party_relationships
for insert to authenticated with check (
 (private.has_role_permission('leads.update') or private.has_role_permission('prospects.update') or private.has_role_permission('clients.update') or private.has_role_permission('proprietaires.update'))
 and exists(select 1 from public.crm_party_links l where l.party_id=crm_party_relationships.party_id)
 and exists(select 1 from public.crm_party_links l where l.party_id=crm_party_relationships.related_party_id)
);
create policy crm_party_relationships_update_by_crm_permission on public.crm_party_relationships
for update to authenticated using (
 (private.has_role_permission('leads.update') or private.has_role_permission('prospects.update') or private.has_role_permission('clients.update') or private.has_role_permission('proprietaires.update'))
 and exists(select 1 from public.crm_party_links l where l.party_id=crm_party_relationships.party_id)
 and exists(select 1 from public.crm_party_links l where l.party_id=crm_party_relationships.related_party_id)
) with check (
 (private.has_role_permission('leads.update') or private.has_role_permission('prospects.update') or private.has_role_permission('clients.update') or private.has_role_permission('proprietaires.update'))
 and exists(select 1 from public.crm_party_links l where l.party_id=crm_party_relationships.party_id)
 and exists(select 1 from public.crm_party_links l where l.party_id=crm_party_relationships.related_party_id)
);
create policy crm_party_relationships_delete_by_crm_permission on public.crm_party_relationships
for delete to authenticated using (
 (private.has_role_permission('leads.update') or private.has_role_permission('prospects.update') or private.has_role_permission('clients.update') or private.has_role_permission('proprietaires.update'))
 and exists(select 1 from public.crm_party_links l where l.party_id=crm_party_relationships.party_id)
 and exists(select 1 from public.crm_party_links l where l.party_id=crm_party_relationships.related_party_id)
);