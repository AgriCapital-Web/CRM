-- Restrict technical intervention reassignment to profiles with technical roles only.
CREATE OR REPLACE FUNCTION private.can_assign_technician_to(_actor uuid, _target_profile uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT _target_profile IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.profiles t
      JOIN public.user_roles ur ON ur.user_id = t.user_id
      WHERE t.id = _target_profile
        AND coalesce(t.actif, false) = true
        AND ur.role IN ('technicien', 'chef_equipe_technique', 'responsable_technique')
    )
    AND (
      private.is_global_admin(_actor)
      OR private.has_role(_actor, 'responsable_operations')
      OR _actor = (SELECT user_id FROM public.profiles WHERE id = _target_profile)
      OR (
        private.has_role(_actor, 'chef_equipe_technique')
        AND (
          EXISTS (
            SELECT 1
            FROM public.profiles a, public.profiles t
            WHERE a.user_id = _actor
              AND t.id = _target_profile
              AND (
                (a.equipe_id IS NOT NULL AND a.equipe_id = t.equipe_id)
                OR (a.district_id IS NOT NULL AND a.district_id = t.district_id)
                OR (a.region_id IS NOT NULL AND a.region_id = t.region_id)
              )
          )
          OR EXISTS (
            SELECT 1
            FROM public.zone_assignments z
            JOIN public.profiles t ON t.id = _target_profile
            WHERE z.user_id = _actor
              AND (
                (z.zone_type = 'region' AND z.zone_id = t.region_id)
                OR (z.zone_type = 'district' AND z.zone_id = t.district_id)
                OR (
                  z.zone_type = 'departement'
                  AND EXISTS (
                    SELECT 1 FROM public.departements d
                    WHERE d.id = z.zone_id AND d.region_id = t.region_id
                  )
                )
              )
          )
        )
      )
    );
$function$;

CREATE OR REPLACE FUNCTION public.list_assignable_technicians()
RETURNS TABLE(id uuid, nom_complet text, user_id uuid, equipe_id uuid, region_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  IF NOT (
    private.is_global_admin(auth.uid())
    OR private.has_role(auth.uid(), 'responsable_operations')
    OR private.has_role(auth.uid(), 'chef_equipe_technique')
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT DISTINCT p.id, p.nom_complet, p.user_id, p.equipe_id, p.region_id
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.user_id
  WHERE p.actif IS TRUE
    AND ur.role IN ('technicien', 'chef_equipe_technique', 'responsable_technique')
    AND private.can_assign_technician_to(auth.uid(), p.id)
  ORDER BY p.nom_complet;
END;
$function$;
