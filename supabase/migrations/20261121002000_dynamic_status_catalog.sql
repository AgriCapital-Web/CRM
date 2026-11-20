create or replace function public.get_crm_status_catalog()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_result jsonb;
begin
  if auth.uid() is null or not private.crm_has_role_permission('parametres.manage_system') then
    raise exception 'Permission insuffisante pour consulter le référentiel des statuts.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'clients_statut', coalesce((
      select jsonb_agg(jsonb_build_object('valeur', statut, 'nombre', n) order by statut)
      from (select statut, count(*)::bigint n from public.clients where nullif(btrim(statut),'') is not null group by statut) s
    ), '[]'::jsonb),
    'clients_statut_global', coalesce((
      select jsonb_agg(jsonb_build_object('valeur', statut_global, 'nombre', n) order by statut_global)
      from (select statut_global, count(*)::bigint n from public.clients where nullif(btrim(statut_global),'') is not null group by statut_global) s
    ), '[]'::jsonb),
    'clients_validation_statut', coalesce((
      select jsonb_agg(jsonb_build_object('valeur', validation_statut, 'nombre', n) order by validation_statut)
      from (select validation_statut, count(*)::bigint n from public.clients where nullif(btrim(validation_statut),'') is not null group by validation_statut) s
    ), '[]'::jsonb),
    'plantations_statut', coalesce((
      select jsonb_agg(jsonb_build_object('valeur', statut, 'nombre', n) order by statut)
      from (select statut, count(*)::bigint n from public.plantations where nullif(btrim(statut),'') is not null group by statut) s
    ), '[]'::jsonb),
    'plantations_statut_global', coalesce((
      select jsonb_agg(jsonb_build_object('valeur', statut_global, 'nombre', n) order by statut_global)
      from (select statut_global, count(*)::bigint n from public.plantations where nullif(btrim(statut_global),'') is not null group by statut_global) s
    ), '[]'::jsonb),
    'paiements_statut', coalesce((
      select jsonb_agg(jsonb_build_object('valeur', statut, 'nombre', n) order by statut)
      from (select statut, count(*)::bigint n from public.paiements where nullif(btrim(statut),'') is not null group by statut) s
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$function$;

revoke all on function public.get_crm_status_catalog() from public, anon;
grant execute on function public.get_crm_status_catalog() to authenticated;