-- Align the national leadership and HR role matrices with their defined responsibilities.
-- The live database was updated and verified before this migration was added to source control.

insert into public.role_permissions (role_code, permission_code)
select v.role_code, v.permission_code
from (values
  ('manager_commercial_national','dashboard.view'),
  ('manager_commercial_national','clients.view'),
  ('manager_commercial_national','leads.view'),
  ('manager_commercial_national','leads.create'),
  ('manager_commercial_national','leads.update'),
  ('manager_commercial_national','leads.assign'),
  ('manager_commercial_national','commissions.view'),
  ('manager_commercial_national','messagerie.view'),
  ('manager_commercial_national','messagerie.send'),
  ('manager_commercial_national','offres.view'),
  ('manager_commercial_national','paiements.view'),
  ('manager_commercial_national','parcelles.view'),
  ('manager_commercial_national','plantations.view'),
  ('manager_commercial_national','portefeuilles.view'),
  ('manager_commercial_national','proprietaires.view'),
  ('manager_commercial_national','documents.view'),
  ('manager_commercial_national','tickets.view'),
  ('manager_commercial_national','tickets.create'),
  ('manager_commercial_national','tickets.update'),
  ('manager_commercial_national','system.can_supervise_leads'),
  ('manager_commercial_national','system.commercial_manager'),
  ('manager_commercial_national','system.commercial_director'),
  ('manager_commercial_national','system.view_team_commissions'),

  ('manager_technique_national','dashboard.view'),
  ('manager_technique_national','clients.view'),
  ('manager_technique_national','documents.upload'),
  ('manager_technique_national','documents.view'),
  ('manager_technique_national','messagerie.view'),
  ('manager_technique_national','parcelles.view'),
  ('manager_technique_national','plantations.create'),
  ('manager_technique_national','plantations.update'),
  ('manager_technique_national','plantations.view'),
  ('manager_technique_national','proprietaires.view'),
  ('manager_technique_national','rapports.manage_technique'),
  ('manager_technique_national','rapports.view_technique'),
  ('manager_technique_national','tickets.create'),
  ('manager_technique_national','tickets.update'),
  ('manager_technique_national','tickets.view'),
  ('manager_technique_national','system.role_technique'),
  ('manager_technique_national','system.technical_manager'),

  ('ressources_humaines','dashboard.view')
) as v(role_code, permission_code)
where exists (select 1 from public.app_roles r where r.code = v.role_code and r.actif is true)
  and exists (select 1 from public.app_permissions p where p.code = v.permission_code and p.actif is true)
  and not exists (
    select 1 from public.role_permissions rp
    where rp.role_code = v.role_code and rp.permission_code = v.permission_code
  );

create or replace function private.can_supervise_leads(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists(
    select 1
    from public.user_roles
    where user_id = _user_id
      and role in (
        'responsable_operations',
        'responsable_commercial',
        'chef_equipe_commercial',
        'manager_commercial_national',
        'service_client',
        'chef_equipe_service_client',
        'pdg'
      )
  );
$function$;

-- Remove only the obsolete permission mapping for a role absent from both the
-- role catalogue and all user assignments.
delete from public.role_permissions rp
where rp.role_code = 'directeur_tc'
  and not exists (select 1 from public.app_roles r where r.code = rp.role_code)
  and not exists (select 1 from public.user_roles ur where ur.role = rp.role_code);


-- The operations lead coordinates the national operating model and therefore
-- has national visibility rather than an unassigned single-region perimeter.
update public.app_roles
set niveau_couverture = 'global',
    libelle_couverture = 'National',
    description = 'Pilotage transversal des opérations, des offres, des paramètres métier et de la coordination opérationnelle à l’échelle nationale.',
    updated_at = now()
where code = 'responsable_operations';

-- Assign the existing technical team lead to the only active technical team
-- and its existing Daloa department coverage.
insert into public.zone_assignments (user_id, zone_type, zone_id, created_by)
select 'aaca1b35-dc74-48ee-9592-b646432825c8'::uuid, 'departement', d.id,
       'bd9579fd-1d07-4431-9cc4-b57dfeeab593'::uuid
from public.departements d
where d.nom = 'Daloa'
  and d.region_id = 'd7738144-14cf-43f6-be4d-500f21a9cee5'::uuid
  and not exists (
    select 1 from public.zone_assignments z
    where z.user_id = 'aaca1b35-dc74-48ee-9592-b646432825c8'::uuid
  );

select set_config('app.internal_coverage_sync', 'true', true);
update public.profiles
set equipe_id = '75242b1a-4b1f-45b1-a0e3-a075f427e005'::uuid,
    departement = 'Technique',
    updated_at = now()
where user_id = 'aaca1b35-dc74-48ee-9592-b646432825c8'::uuid;
select set_config('app.internal_coverage_sync', 'false', true);

insert into public.equipe_membres (equipe_id, profile_id, created_by)
select '75242b1a-4b1f-45b1-a0e3-a075f427e005'::uuid,
       'aaca1b35-dc74-48ee-9592-b646432825c8'::uuid,
       'bd9579fd-1d07-4431-9cc4-b57dfeeab593'::uuid
where not exists (
  select 1 from public.equipe_membres em
  where em.equipe_id = '75242b1a-4b1f-45b1-a0e3-a075f427e005'::uuid
    and em.profile_id = 'aaca1b35-dc74-48ee-9592-b646432825c8'::uuid
);

update public.equipes
set responsable_id = 'aaca1b35-dc74-48ee-9592-b646432825c8'::uuid,
    updated_at = now()
where id = '75242b1a-4b1f-45b1-a0e3-a075f427e005'::uuid;

-- The PDG remains a global administrator, not an operational team member.
delete from public.equipe_membres
where profile_id = 'bd9579fd-1d07-4431-9cc4-b57dfeeab593'::uuid
  and equipe_id in (
    'a3fe031b-c37d-41df-92e5-df3048a5a39c'::uuid,
    '75242b1a-4b1f-45b1-a0e3-a075f427e005'::uuid
  );


-- HR may prepare payroll and manage salary records, but must not see the general
-- finance ledger or independently approve/execute payroll payments.
delete from public.role_permissions
where role_code = 'ressources_humaines'
  and permission_code = 'finance.view';

create or replace function public.finance_validate_payroll_run(p_run_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if not (
    private.crm_is_global_admin((select auth.uid()))
    or private.crm_has_role_permission('finance.manage')
    or private.crm_has_role_permission('finance.payouts')
  ) then
    raise exception 'La validation de la paie est réservée à la comptabilité et à la Direction.';
  end if;
  if not exists (select 1 from public.finance_payroll_items i where i.payroll_run_id = p_run_id) then
    raise exception 'Ce lot de paie ne contient aucune ligne.';
  end if;
  update public.finance_payroll_runs
  set status = 'valide', validated_at = now()
  where id = p_run_id and status = 'brouillon';
  if not found then raise exception 'Lot de paie introuvable ou déjà traité.'; end if;
  update public.finance_payroll_items set status = 'valide'
  where payroll_run_id = p_run_id and status = 'calcule';
end;
$function$;

create or replace function public.finance_payroll_mark_paid(
  p_run_id uuid,
  p_payment_method text,
  p_payment_reference text,
  p_payment_proof_url text default null,
  p_payment_proof_name text default null,
  p_payment_proof_mime_type text default null,
  p_fee_applied boolean default false
)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_run public.finance_payroll_runs%rowtype;
  v_item record;
  v_amount numeric;
  v_fee_amount numeric;
  v_total_amount numeric;
  v_fee_applied boolean;
  v_transaction_id uuid;
begin
  if not (
    private.crm_is_global_admin((select auth.uid()))
    or private.crm_has_role_permission('finance.manage')
    or private.crm_has_role_permission('finance.payouts')
  ) then
    raise exception 'Le paiement de la paie est réservé à la comptabilité et à la Direction.';
  end if;
  if p_payment_method not in ('virement','mobile_money','especes','cheque','autre') then
    raise exception 'Mode de paiement invalide.';
  end if;
  if coalesce(trim(p_payment_reference),'') = ''
     and coalesce(trim(p_payment_proof_url),'') = ''
     and p_payment_method <> 'especes' then
    raise exception 'Une référence ou un justificatif de paiement est obligatoire pour ce mode de paiement.';
  end if;
  select * into v_run from public.finance_payroll_runs where id = p_run_id for update;
  if not found or v_run.status <> 'valide' then
    raise exception 'Le lot doit être validé avant paiement.';
  end if;
  if exists (select 1 from public.finance_payroll_items where payroll_run_id = p_run_id and transaction_id is not null) then
    raise exception 'Au moins une ligne possède déjà une transaction financière; vérification manuelle requise.';
  end if;
  if not exists (select 1 from public.finance_payroll_items where payroll_run_id = p_run_id and status = 'valide') then
    raise exception 'Aucune ligne de paie validée à payer.';
  end if;
  v_fee_applied := coalesce(p_fee_applied,false) and p_payment_method <> 'especes';
  for v_item in
    select i.*, p.nom_complet
    from public.finance_payroll_items i
    join public.profiles p on p.id = i.profile_id
    where i.payroll_run_id = p_run_id and i.status = 'valide'
    for update of i
  loop
    v_amount := greatest(0, coalesce(v_item.base_salary,0) + coalesce(v_item.bonuses,0) - coalesce(v_item.deductions,0));
    if v_amount <= 0 then raise exception 'Montant net nul ou négatif pour %.', v_item.nom_complet; end if;
    v_fee_amount := case when v_fee_applied then round(v_amount * 0.01) else 0 end;
    v_total_amount := v_amount + v_fee_amount;
    insert into public.finance_transactions(
      direction,category,label,amount,gross_amount,fee_rate,fee_amount,fee_applied,
      payment_method,reference,proof_path,proof_name,proof_mime_type,
      profile_id,source_type,source_id,status,notes,created_by
    ) values (
      'sortie','SALAIRES','Salaire — ' || v_item.nom_complet,
      v_total_amount,v_amount,case when v_fee_applied then 1 else 0 end,v_fee_amount,v_fee_applied,
      p_payment_method,nullif(trim(p_payment_reference),''),
      nullif(trim(p_payment_proof_url),''),nullif(trim(p_payment_proof_name),''),
      nullif(trim(p_payment_proof_mime_type),''),v_item.profile_id,'paie_salaire',v_item.id,'valide',
      'Lot de paie ' || to_char(v_run.period_start,'YYYY-MM'),auth.uid()
    ) returning id into v_transaction_id;
    update public.finance_payroll_items
    set transaction_id = v_transaction_id, net_salary = v_amount, status = 'paye'
    where id = v_item.id;
  end loop;
  update public.finance_payroll_runs
  set status = 'paye', paid_at = now(), payment_method = p_payment_method,
      payment_reference = nullif(trim(p_payment_reference),''),
      payment_proof_url = nullif(trim(p_payment_proof_url),'')
  where id = p_run_id;
end;
$function$;


-- Separate HR salary configuration from accounting control of payroll runs.
create or replace function public.finance_can_manage_payroll()
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select private.is_pdg((select auth.uid()))
    or private.crm_has_role_permission('finance.manage')
    or private.crm_has_role_permission('finance.payouts');
$function$;

create or replace function public.finance_can_manage_salary_profiles()
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select public.finance_can_manage_payroll()
    or private.crm_has_role_permission('finance.payroll')
    or private.crm_has_role_permission('ressources_humaines.manage_payroll');
$function$;

drop policy if exists finance_salary_profiles_manage on public.finance_salary_profiles;
create policy finance_salary_profiles_manage
on public.finance_salary_profiles
for all
using (public.finance_can_manage_salary_profiles())
with check (public.finance_can_manage_salary_profiles());

drop policy if exists finance_payroll_runs_manage on public.finance_payroll_runs;
create policy finance_payroll_runs_manage
on public.finance_payroll_runs
for all
using (public.finance_can_manage_payroll())
with check (public.finance_can_manage_payroll());

drop policy if exists finance_payroll_items_manage on public.finance_payroll_items;
create policy finance_payroll_items_manage
on public.finance_payroll_items
for all
using (public.finance_can_manage_payroll())
with check (public.finance_can_manage_payroll());


-- Preserve the separate surname and given-name fields throughout staff onboarding.
alter table public.account_requests
  add column if not exists nom text,
  add column if not exists prenoms text;


-- National managers inherit the operational permissions of their regional/team
-- counterparts, while remaining limited to their own business domain.
insert into public.role_permissions (role_code, permission_code)
select v.role_code, v.permission_code
from (values
  ('manager_commercial_national','clients.create'),
  ('manager_commercial_national','parcelles.create'),
  ('manager_commercial_national','parcelles.update'),
  ('manager_commercial_national','proprietaires.create'),
  ('manager_commercial_national','parametres.manage_teams'),
  ('manager_technique_national','parcelles.create'),
  ('manager_technique_national','parcelles.update'),
  ('manager_technique_national','proprietaires.view'),
  ('assistant_administratif','proprietaires.view')
) as v(role_code, permission_code)
where exists (select 1 from public.app_roles r where r.code = v.role_code and r.actif is true)
  and exists (select 1 from public.app_permissions p where p.code = v.permission_code and p.actif is true)
  and not exists (
    select 1 from public.role_permissions rp
    where rp.role_code = v.role_code and rp.permission_code = v.permission_code
  );
