create or replace view public.v_performance_equipes as
select
  e.id,
  e.nom,
  e.type_equipe,
  e.region_id,
  case when lower(coalesce(e.type_equipe,'')) like '%commercial%' then (
    select count(distinct c.id)
    from public.clients c
    join public.profiles p on p.user_id=c.created_by
    where p.equipe_id=e.id
       or exists(select 1 from public.equipe_membres em where em.profile_id=p.id and em.equipe_id=e.id)
  ) else 0::bigint end as clients,
  case when lower(coalesce(e.type_equipe,'')) like '%commercial%' then coalesce((
    select sum(greatest(coalesce(a.superficie_ha,0),0))
    from public.acquisitions a
    join public.clients c on c.id=a.client_id
    join public.profiles p on p.user_id=coalesce(a.created_by,c.created_by)
    where (p.equipe_id=e.id or exists(select 1 from public.equipe_membres em where em.profile_id=p.id and em.equipe_id=e.id))
      and lower(coalesce(a.statut,'')) not in ('annule','annulee','annulée','cancelled','supprime','supprimee','supprimé','refuse','refusee','refusé')
  ),0::numeric) else 0::numeric end as hectares,
  case when lower(coalesce(e.type_equipe,'')) like '%technique%' then (
    select count(*)
    from public.interventions_techniques i
    join public.profiles p on p.id=i.agent_technique_id
    where p.equipe_id=e.id
       or exists(select 1 from public.equipe_membres em where em.profile_id=p.id and em.equipe_id=e.id)
  ) else 0::bigint end as interventions
from public.equipes e
where e.actif=true and private.can_view_team_performance(auth.uid(),e.id,e.type_equipe);