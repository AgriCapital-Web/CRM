begin;

CREATE OR REPLACE FUNCTION public.finance_can_manage_payroll()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select private.is_pdg((select auth.uid()))
    or private.crm_has_role_permission('finance.manage')
    or private.crm_has_role_permission('finance.payroll')
    or private.crm_has_role_permission('ressources_humaines.manage_payroll');
$function$


CREATE OR REPLACE FUNCTION public.finance_can_view()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select private.is_pdg((select auth.uid()))
    or private.crm_has_role_permission('finance.manage')
    or (
      private.crm_has_role_permission('finance.view')
      and not private.has_role((select auth.uid()),'ressources_humaines')
      and private.crm_user_has_global_scope((select auth.uid()))
    );
$function$


CREATE OR REPLACE FUNCTION public.finance_can_view_payroll()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select private.is_pdg((select auth.uid()))
    or private.crm_has_role_permission('finance.manage')
    or private.crm_has_role_permission('finance.payroll')
    or private.crm_has_role_permission('ressources_humaines.manage_payroll');
$function$


drop policy if exists finance_transactions_select on public.finance_transactions;
create policy finance_transactions_select_by_permission_and_scope on public.finance_transactions for select to authenticated using (
  public.finance_can_view()
  or (private.crm_has_role_permission('finance.view') and (
    (client_id is not null and private.can_access_client((select auth.uid()),client_id))
    or (plantation_id is not null and exists (select 1 from public.plantations pl where pl.id=finance_transactions.plantation_id
      and (private.can_access_client((select auth.uid()),pl.client_id) or private.can_access_parcelle((select auth.uid()),pl.parcelle_id))))
    or (profile_id is not null and exists (select 1 from public.profiles target where target.id=finance_transactions.profile_id
      and private.crm_user_can_access_geo((select auth.uid()),target.region_id,target.district_id,null::uuid,null::uuid)))
  ))
  or (public.finance_can_view_payroll() and lower(coalesce(source_type,''))='salary' and lower(coalesce(category,''))='payroll')
);

drop policy if exists finance_expenses_select on public.finance_expenses;
create policy finance_expenses_select_by_permission_and_scope on public.finance_expenses for select to authenticated using (
  public.finance_can_view()
  or (private.crm_has_role_permission('finance.view') and (
    (client_id is not null and private.can_access_client((select auth.uid()),client_id))
    or (plantation_id is not null and exists (select 1 from public.plantations pl where pl.id=finance_expenses.plantation_id
      and (private.can_access_client((select auth.uid()),pl.client_id) or private.can_access_parcelle((select auth.uid()),pl.parcelle_id))))
    or (profile_id is not null and exists (select 1 from public.profiles target where target.id=finance_expenses.profile_id
      and private.crm_user_can_access_geo((select auth.uid()),target.region_id,target.district_id,null::uuid,null::uuid)))
  ))
);

drop policy if exists finance_expense_payments_select on public.finance_expense_payments;
create policy finance_expense_payments_select_by_expense_scope on public.finance_expense_payments for select to authenticated using (
  created_by=(select auth.uid()) or public.finance_can_view()
  or exists (select 1 from public.finance_expenses e where e.id=finance_expense_payments.expense_id
    and private.crm_has_role_permission('finance.view') and (
      (e.client_id is not null and private.can_access_client((select auth.uid()),e.client_id))
      or (e.plantation_id is not null and exists (select 1 from public.plantations pl where pl.id=e.plantation_id
        and (private.can_access_client((select auth.uid()),pl.client_id) or private.can_access_parcelle((select auth.uid()),pl.parcelle_id))))
      or (e.profile_id is not null and exists (select 1 from public.profiles target where target.id=e.profile_id
        and private.crm_user_can_access_geo((select auth.uid()),target.region_id,target.district_id,null::uuid,null::uuid)))
    ))
);

drop policy if exists finance_payroll_runs_manage on public.finance_payroll_runs;
create policy finance_payroll_runs_manage on public.finance_payroll_runs for all to authenticated
  using (public.finance_can_manage_payroll()) with check (public.finance_can_manage_payroll());
drop policy if exists finance_payroll_items_manage on public.finance_payroll_items;
create policy finance_payroll_items_manage on public.finance_payroll_items for all to authenticated
  using (public.finance_can_manage_payroll()) with check (public.finance_can_manage_payroll());
drop policy if exists finance_salary_profiles_manage on public.finance_salary_profiles;
create policy finance_salary_profiles_manage on public.finance_salary_profiles for all to authenticated
  using (public.finance_can_manage_payroll()) with check (public.finance_can_manage_payroll());

notify pgrst, 'reload schema';
commit;