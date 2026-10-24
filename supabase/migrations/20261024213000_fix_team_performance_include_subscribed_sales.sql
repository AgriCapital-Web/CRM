-- Align team performance metrics with the production SQL view correction.
-- Commercial dossiers are attributed to their assigned commercial, falling back to the creator.
-- Non-cancelled acquisitions count toward hectares; no metrics are hard-coded.
create or replace view public.v_performance_equipes as
select e.id, e.nom, e.type_equipe, e.region_id,
case when lower(coalesce(e.type_equipe,'')) like '%commercial%' then (
 select count(distinct c.id) from public.clients c
 join public.profiles p on p.user_id=coalesce(c.commercial_id,c.created_by)
 where (p.equipe_id=e.id or exists(select 1 from public.equipe_membres em where em.profile_id=p.id and em.equipe_id=e.id))
 and coalesce(c.is_internal,false)=false
 and lower(coalesce(c.type_client,'')) <> 'proprietaire_foncier'
 and lower(coalesce(c.nom_complet,'')) not like '%agricapital%'
) else 0 end as clients,
case when lower(coalesce(e.type_equipe,'')) like '%commercial%' then coalesce((
 select sum(greatest(coalesce(a.superficie_ha,0),0)) from public.acquisitions a
 join public.clients c on c.id=a.client_id
 join public.profiles p on p.user_id=coalesce(c.commercial_id,a.created_by,c.created_by)
 where (p.equipe_id=e.id or exists(select 1 from public.equipe_membres em where em.profile_id=p.id and em.equipe_id=e.id))
 and lower(coalesce(a.statut,'')) not in ('annule','annulee','annulée','cancelled','supprime','supprimee','supprimé','refuse','refusee','refusé')
 and coalesce(c.is_internal,false)=false
 and lower(coalesce(c.type_client,'')) <> 'proprietaire_foncier'
 and lower(coalesce(c.nom_complet,'')) not like '%agricapital%'
),0) else 0 end as hectares,
case when lower(coalesce(e.type_equipe,'')) like '%technique%' then (
 select count(*) from public.interventions_techniques i join public.profiles p on p.id=i.agent_technique_id
 where p.equipe_id=e.id or exists(select 1 from public.equipe_membres em where em.profile_id=p.id and em.equipe_id=e.id)
) else 0 end as interventions
from public.equipes e where e.actif=true and private.can_view_team_performance(auth.uid(),e.id,e.type_equipe);
