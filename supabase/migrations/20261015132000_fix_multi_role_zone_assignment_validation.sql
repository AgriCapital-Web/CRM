-- Allow zone assignments to match any active coverage role held by a user.
-- Users may have multiple roles with different coverage levels (e.g. region + department).
CREATE OR REPLACE FUNCTION public.validate_zone_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  role_matches_zone boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.app_roles ar ON ar.code = ur.role
    WHERE ur.user_id = NEW.user_id
      AND ar.actif = true
      AND ar.niveau_couverture = NEW.zone_type
  ) INTO role_matches_zone;

  IF NOT role_matches_zone THEN
    RAISE EXCEPTION 'Affectation impossible : aucun rôle actif de cet utilisateur ne correspond au niveau de couverture %.', NEW.zone_type
      USING ERRCODE = '23514';
  END IF;

  IF NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;

  RETURN NEW;
END;
$function$;
