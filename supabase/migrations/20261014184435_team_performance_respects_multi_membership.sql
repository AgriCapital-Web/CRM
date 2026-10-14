-- Keep team performance scoped to the teams the current user belongs to.
CREATE OR REPLACE FUNCTION private.can_view_team_performance(_user_id uuid, _team_id uuid, _team_type text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p record;
begin
 if _user_id is null then return false; end if;
 if private.is_global_admin(_user_id) or private.has_role(_user_id,'responsable_operations') then return true; end if;
 select * into p from public.profiles where user_id=_user_id limit 1;
 if private.has_role(_user_id,'responsable_commercial') and lower(coalesce(_team_type,''))='commercial' then return true; end if;
 if (
   (private.has_role(_user_id,'chef_equipe_commercial') and lower(coalesce(_team_type,''))='commercial') or
   (private.has_role(_user_id,'chef_equipe_technique') and lower(coalesce(_team_type,''))='technique')
 ) and (
   p.equipe_id=_team_id
   or exists (
     select 1 from public.equipe_membres em
     join public.profiles viewer on viewer.id=em.profile_id
     where viewer.user_id=_user_id and em.equipe_id=_team_id
   )
 ) then return true; end if;
 return false;
end; $function$
;

-- Aggregate team performance through explicit memberships; keep RLS active on underlying tables.
create or replace view public.v_performance_equipes with (security_invoker = true) as
 SELECT id,
    nom,
    type_equipe,
    region_id,
        CASE
            WHEN lower(COALESCE(type_equipe, ''::text)) ~~ '%commercial%'::text THEN ( SELECT count(*) AS count
               FROM clients c
                 JOIN profiles p ON p.user_id = c.created_by
              WHERE p.equipe_id = e.id OR (EXISTS ( SELECT 1
                       FROM equipe_membres em
                      WHERE em.profile_id = p.id AND em.equipe_id = e.id)))
            ELSE 0::bigint
        END AS clients,
        CASE
            WHEN lower(COALESCE(type_equipe, ''::text)) ~~ '%commercial%'::text THEN COALESCE(( SELECT sum(COALESCE(c.total_hectares, 0::numeric)) AS sum
               FROM clients c
                 JOIN profiles p ON p.user_id = c.created_by
              WHERE p.equipe_id = e.id OR (EXISTS ( SELECT 1
                       FROM equipe_membres em
                      WHERE em.profile_id = p.id AND em.equipe_id = e.id))), 0::numeric)
            ELSE 0::numeric
        END AS hectares,
        CASE
            WHEN lower(COALESCE(type_equipe, ''::text)) ~~ '%technique%'::text THEN ( SELECT count(*) AS count
               FROM interventions_techniques i
                 JOIN profiles p ON p.id = i.agent_technique_id
              WHERE p.equipe_id = e.id OR (EXISTS ( SELECT 1
                       FROM equipe_membres em
                      WHERE em.profile_id = p.id AND em.equipe_id = e.id)))
            ELSE 0::bigint
        END AS interventions
   FROM equipes e
  WHERE actif = true AND private.can_view_team_performance(auth.uid(), id, type_equipe);;
alter view public.v_performance_equipes set (security_invoker = true);
