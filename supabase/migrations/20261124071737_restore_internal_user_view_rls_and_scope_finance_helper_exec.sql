begin;

alter view public.v_internal_users set (security_invoker = true);

revoke execute on function public.finance_can_manage_payroll() from public, anon;
grant execute on function public.finance_can_manage_payroll() to authenticated;

revoke execute on function public.finance_can_manage_salary_profiles() from public, anon;
grant execute on function public.finance_can_manage_salary_profiles() to authenticated;

commit;
