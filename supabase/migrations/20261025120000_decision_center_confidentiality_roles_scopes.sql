alter table public.decision_proposals
 add column if not exists target_user_id uuid references auth.users(id),
 add column if not exists target_role_code text,
 add column if not exists visibility_scope text not null default 'executive' check (visibility_scope in ('executive','targeted','team','department','national')),
 add column if not exists department_scope text,
 add column if not exists region_scope_id uuid,
 add column if not exists district_scope_id uuid;
create index if not exists decision_proposals_target_idx on public.decision_proposals(target_user_id, created_at desc) where deleted_at is null;
create or replace function public.decision_center_is_pdg()
returns boolean language sql stable security definer set search_path = public, auth as $$
 select exists(select 1 from public.user_roles ur where ur.user_id=auth.uid() and lower(coalesce(ur.role,'')) ~ '(pdg|président|president)');
$$;
create or replace function public.decision_center_can_read_proposal(p_target_user_id uuid, p_target_role_code text, p_scope text, p_department text, p_region uuid, p_district uuid)
returns boolean language sql stable security definer set search_path = public, auth as $$
 select public.decision_center_is_pdg()
 or (p_target_user_id is not null and p_target_user_id <> auth.uid()
   and lower(coalesce(p_target_role_code,'')) not in ('dg','directeur_general','directeur général')
   and public.can_access_decision_center('view')
   and (p_scope = 'targeted'
     or (p_scope = 'department' and p_department is not null and exists(select 1 from public.profiles me where me.user_id=auth.uid() and me.departement=p_department))
     or (p_scope = 'team' and p_region is not null and exists(select 1 from public.profiles me where me.user_id=auth.uid() and me.region_id=p_region))
     or (p_scope = 'national' and exists(select 1 from public.user_roles ur where ur.user_id=auth.uid() and lower(ur.role) in ('manager_commercial_national','mcn','manager_technique_national','mtn','responsable_operations','ressources_humaines')))
   )
 );
$$;
drop policy if exists decision_proposals_access on public.decision_proposals;
create policy decision_proposals_access on public.decision_proposals for select to authenticated using
 (deleted_at is null and (public.decision_center_is_pdg() or (public.can_access_decision_center('view') and public.decision_center_can_read_proposal(target_user_id,target_role_code,visibility_scope,department_scope,region_scope_id,district_scope_id))));
insert into public.app_roles (code,nom,court,description,niveau,niveau_label,actif,niveau_couverture,libelle_couverture)
values
 ('manager_commercial_national','Manager Commercial National','MCN','Pilotage national de la performance commerciale et des équipes commerciales dans les périmètres autorisés.',2,'Direction nationale',true,'global','National'),
 ('manager_technique_national','Manager Technique National','MTN','Pilotage national des opérations techniques, des équipes et des performances techniques dans les périmètres autorisés.',2,'Direction nationale',true,'global','National')
on conflict (code) do update set nom=excluded.nom,court=excluded.court,description=excluded.description,niveau=excluded.niveau,niveau_label=excluded.niveau_label,actif=true,niveau_couverture=excluded.niveau_couverture,libelle_couverture=excluded.libelle_couverture,updated_at=now();
insert into public.app_permissions (code,module,action,libelle,description,actif)
values ('decision_center.view','decision_center','view','Consulter le centre de décision','Consulter uniquement les décisions autorisées par périmètre et confidentialité.',true),
 ('decision_center.create','decision_center','create','Créer une proposition','Créer des propositions de décision dans les limites de son rôle.',true),
 ('decision_center.approve','decision_center','approve','Décider dans son périmètre','Approuver ou rejeter les décisions autorisées, avec motif.',true),
 ('decision_center.manage','decision_center','manage','Gérer le centre de décision','Gérer les règles et les propositions dans les limites de la délégation.',true),
 ('decision_center.governance','decision_center','governance','Gouvernance du centre de décision','Gérer les délégations et paramètres, réservé au PDG/DG selon la politique.',true)
on conflict (code) do update set module=excluded.module,action=excluded.action,libelle=excluded.libelle,description=excluded.description,actif=true,updated_at=now();
insert into public.role_permissions(role_code,permission_code) select r.code,p.code from public.app_roles r cross join public.app_permissions p where r.code in ('pdg','dg','responsable_operations','ressources_humaines','manager_commercial_national','manager_technique_national') and p.code in ('decision_center.view','decision_center.create') on conflict do nothing;
insert into public.role_permissions(role_code,permission_code) select r.code,p.code from public.app_roles r cross join public.app_permissions p where r.code in ('pdg','dg') and p.code in ('decision_center.approve','decision_center.manage','decision_center.governance') on conflict do nothing;
insert into public.role_permissions(role_code,permission_code) select r.code,p.code from public.app_roles r cross join public.app_permissions p where r.code in ('responsable_operations','ressources_humaines','manager_commercial_national','manager_technique_national') and p.code='decision_center.approve' on conflict do nothing;
create or replace function public.can_access_decision_center(required_permission text default 'view')
returns boolean language sql stable security definer set search_path = public, auth as $$
 select exists(select 1 from public.user_roles ur where ur.user_id=auth.uid()
     and lower(coalesce(ur.role,'')) ~ '(pdg|president|président|directeur general|directeur général|(^|[^a-z])dg([^a-z]|$)|admin)')
   or exists(select 1 from public.decision_access_grants g where g.user_id=auth.uid() and g.revoked_at is null
     and (required_permission = any(g.permissions) or 'admin' = any(g.permissions)))
   or exists(select 1 from public.user_roles ur join public.role_permissions rp on rp.role_code=ur.role
     join public.app_permissions ap on ap.code=rp.permission_code and ap.actif=true
     where ur.user_id=auth.uid() and ap.code='decision_center.'||required_permission);
$$;
