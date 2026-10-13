-- Client creation failed: invoker trigger called a revoked helper.
CREATE OR REPLACE FUNCTION public.trg_recalculer_parametres_financiers_client()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin perform public.recalculer_parametres_financiers_client(new.id); return new; end $function$;
REVOKE EXECUTE ON FUNCTION public.trg_recalculer_parametres_financiers_client() FROM anon;

-- The creator of a record is always recorded from the session (never trusted from the browser when omitted).
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.table_name FROM information_schema.columns c
    JOIN information_schema.tables t ON t.table_schema=c.table_schema AND t.table_name=c.table_name AND t.table_type='BASE TABLE'
    WHERE c.table_schema='public' AND c.column_name='created_by' AND c.data_type='uuid' AND c.column_default IS NULL
  LOOP
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN created_by SET DEFAULT auth.uid()', r.table_name);
  END LOOP;
END $$;

-- The creator of a client must be able to read back what he just saved.
CREATE OR REPLACE FUNCTION private.can_access_client(_user_id uuid, _client_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c record; p record; g record;
begin
 if _user_id is null or _client_id is null then return false; end if;
 if private.is_global_admin(_user_id)
    or private.has_role(_user_id,'responsable_operations')
    or private.has_role(_user_id,'service_client')
    or private.has_role(_user_id,'chef_equipe_service_client')
    or private.has_role(_user_id,'comptable') then return true; end if;
 select * into c from public.clients where id=_client_id;
 if not found then return false; end if;
 if c.commercial_id=_user_id or c.user_id=_user_id or c.created_by=_user_id then return true; end if;
 if exists(select 1 from public.interventions_techniques i where i.client_id=_client_id and i.agent_technique_id=_user_id) then return true; end if;
 select * into p from public.profiles where user_id=_user_id limit 1;
 if not found then return false; end if;
 if exists (
   select 1 from public.plantations pl
   where pl.client_id=_client_id and (
     (pl.district_id is not null and p.district_id=pl.district_id)
     or (pl.region_id is not null and p.region_id=pl.region_id)
   )
 ) then return true; end if;
 if exists (
   select 1 from public.plantations pl
   join public.zone_assignments z on z.user_id=_user_id
   where pl.client_id=_client_id and (
     (z.zone_type='district' and z.zone_id=pl.district_id)
     or (z.zone_type='region' and z.zone_id=pl.region_id)
     or (z.zone_type='departement' and z.zone_id=pl.departement_id)
     or (z.zone_type='sous_prefecture' and z.zone_id=pl.sous_prefecture_id)
   )
 ) then return true; end if;
 select coalesce(c.district_id, pa.district_id) as district_id,
        coalesce(c.region_id, pa.region_id) as region_id,
        coalesce(c.departement_id, pa.departement_id) as departement_id,
        coalesce(c.sous_prefecture_id, pa.sous_prefecture_id) as sous_prefecture_id
 into g from (select 1) x left join public.parcelles pa on pa.id=c.parcelle_id;
 if g.district_id is not null and p.district_id=g.district_id then return true; end if;
 if g.region_id is not null and p.region_id=g.region_id then return true; end if;
 if exists(
   select 1 from public.zone_assignments z
   where z.user_id=_user_id
     and ((z.zone_type='district' and z.zone_id=g.district_id)
       or (z.zone_type='region' and z.zone_id=g.region_id)
       or (z.zone_type='departement' and z.zone_id=g.departement_id)
       or (z.zone_type='sous_prefecture' and z.zone_id=g.sous_prefecture_id))
 ) then return true; end if;
 if p.equipe_id is not null
    and (private.has_role(_user_id,'chef_equipe_commercial')
      or private.has_role(_user_id,'chef_equipe_technique')
      or private.has_role(_user_id,'responsable_commercial')) then
   if exists(
     select 1 from public.profiles member
     where member.equipe_id=p.equipe_id
       and (
         member.user_id=c.commercial_id
         or (g.region_id is not null and member.region_id=g.region_id)
         or (g.district_id is not null and member.district_id=g.district_id)
         or exists(
           select 1 from public.zone_assignments z
           where z.user_id=member.user_id
             and ((z.zone_type='district' and z.zone_id=g.district_id)
               or (z.zone_type='region' and z.zone_id=g.region_id)
               or (z.zone_type='departement' and z.zone_id=g.departement_id)
               or (z.zone_type='sous_prefecture' and z.zone_id=g.sous_prefecture_id)
             )
         )
       )
   ) then return true; end if;
 end if;
 return false;
end;
$function$;