-- Return only the portfolio collaborator profiles visible to the current user.
-- Financial/global roles see all; team leads see their own team type; mobilization supervisors see their region; others see only themselves.
create or replace function public.list_visible_portfolio_profiles()
returns table(id uuid,user_id uuid,nom_complet text,telephone text,equipe_id uuid,region_id uuid,poste text,actif boolean,roles text[],equipe jsonb,team_memberships jsonb)
language sql stable security definer set search_path to ''
as $function$
 select p.id,p.user_id,p.nom_complet,p.telephone,p.equipe_id,p.region_id,p.poste,p.actif,
  coalesce((select array_agg(ur.role order by ur.role) from public.user_roles ur where ur.user_id=p.user_id),array[]::text[]),
  case when primary_team.id is null then null else jsonb_build_object('id',primary_team.id,'type_equipe',primary_team.type_equipe) end,
  coalesce((select jsonb_agg(jsonb_build_object('profile_id',em.profile_id,'equipe_id',em.equipe_id,'equipe',jsonb_build_object('id',mt.id,'type_equipe',mt.type_equipe))) from public.equipe_membres em join public.equipes mt on mt.id=em.equipe_id where em.profile_id=p.id),'[]'::jsonb)
 from public.profiles p left join public.equipes primary_team on primary_team.id=p.equipe_id
 where p.actif is true and (
  private.is_global_admin(auth.uid()) or private.has_role(auth.uid(),'comptable') or private.has_role_permission('portefeuilles.manage_payouts') or p.user_id=auth.uid()
  or (private.has_role(auth.uid(),'chef_equipe_technique') and exists(
    select 1 from public.profiles viewer join public.equipes t on lower(coalesce(t.type_equipe,'')) like '%technique%'
    where viewer.user_id=auth.uid() and ((viewer.equipe_id=t.id and p.equipe_id=t.id)
      or (exists(select 1 from public.equipe_membres vem where vem.profile_id=viewer.id and vem.equipe_id=t.id)
        and exists(select 1 from public.equipe_membres tem where tem.profile_id=p.id and tem.equipe_id=t.id)))
      and exists(select 1 from public.user_roles tur where tur.user_id=p.user_id and tur.role='technicien')))
  or ((private.has_role(auth.uid(),'chef_equipe_commercial') or private.has_role(auth.uid(),'responsable_commercial')) and exists(
    select 1 from public.profiles viewer join public.equipes t on lower(coalesce(t.type_equipe,'')) like '%commercial%'
    where viewer.user_id=auth.uid() and ((viewer.equipe_id=t.id and p.equipe_id=t.id)
      or (exists(select 1 from public.equipe_membres vem where vem.profile_id=viewer.id and vem.equipe_id=t.id)
        and exists(select 1 from public.equipe_membres tem where tem.profile_id=p.id and tem.equipe_id=t.id)))
      and exists(select 1 from public.user_roles tur where tur.user_id=p.user_id and tur.role in ('commercial','chef_equipe_commercial','responsable_commercial'))))
  or (private.has_role(auth.uid(),'superviseur_mobilisation_fonciere') and exists(select 1 from public.profiles viewer where viewer.user_id=auth.uid() and viewer.region_id is not null and viewer.region_id=p.region_id)
    and exists(select 1 from public.user_roles tur where tur.user_id=p.user_id and tur.role='mobilisateur_foncier'))
 ) order by p.nom_complet;
$function$;
revoke all on function public.list_visible_portfolio_profiles() from public;
grant execute on function public.list_visible_portfolio_profiles() to authenticated;
