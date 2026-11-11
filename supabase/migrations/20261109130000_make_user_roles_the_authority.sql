-- user_roles is the sole source of authority for PDG/DG access.
-- Profile labels must never silently grant privileged roles.

CREATE OR REPLACE FUNCTION public.guard_profiles_sensitive_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF current_setting('app.internal_coverage_sync', true) = 'true'
     OR current_setting('app.internal_account_link', true) = 'true' THEN
    RETURN NEW;
  END IF;

  IF private.crm_is_global_admin((SELECT auth.uid())) THEN
    IF EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = COALESCE(OLD.user_id, OLD.id) AND ur.role = 'pdg'
    ) AND NOT private.crm_is_global_admin((SELECT auth.uid())) THEN
      RAISE EXCEPTION 'Seul le rôle PDG peut modifier le profil d’un compte PDG.'
        USING errcode = '42501';
    END IF;
    IF (
      OLD.relation_rh IN ('PDG','DG')
      OR NEW.relation_rh IN ('PDG','DG')
    ) AND NOT private.crm_is_global_admin((SELECT auth.uid())) THEN
      RAISE EXCEPTION 'Seul le rôle PDG peut modifier une fonction de gouvernance.'
        USING errcode = '42501';
    END IF;
    RETURN NEW;
  END IF;

  NEW.user_id := OLD.user_id;
  NEW.taux_commission := OLD.taux_commission;
  NEW.poste := OLD.poste;
  NEW.equipe_id := OLD.equipe_id;
  NEW.actif := OLD.actif;
  NEW.district_id := OLD.district_id;
  NEW.region_id := OLD.region_id;
  NEW.departement := OLD.departement;
  NEW.relation_rh := OLD.relation_rh;
  NEW.username := OLD.username;
  NEW.email := OLD.email;
  NEW.telephone := OLD.telephone;
  NEW.telephone_indicatif := OLD.telephone_indicatif;
  NEW.telephone_local := OLD.telephone_local;
  NEW.telephone_secondaire := OLD.telephone_secondaire;
  NEW.telephone_secondaire_indicatif := OLD.telephone_secondaire_indicatif;
  NEW.telephone_secondaire_local := OLD.telephone_secondaire_local;
  NEW.whatsapp := OLD.whatsapp;
  NEW.whatsapp_indicatif := OLD.whatsapp_indicatif;
  NEW.whatsapp_local := OLD.whatsapp_local;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF current_setting('app.internal_coverage_sync', true) = 'true'
     OR current_setting('app.internal_account_link', true) = 'true' THEN
    RETURN NEW;
  END IF;

  IF private.crm_is_global_admin((SELECT auth.uid())) THEN
    IF EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = COALESCE(OLD.user_id, OLD.id) AND ur.role = 'pdg'
    ) AND NOT private.crm_is_global_admin((SELECT auth.uid())) THEN
      RAISE EXCEPTION 'Seul le rôle PDG peut modifier le profil d’un compte PDG.'
        USING errcode = '42501';
    END IF;
    IF (
      OLD.relation_rh IN ('PDG','DG')
      OR NEW.relation_rh IN ('PDG','DG')
    ) AND NOT private.crm_is_global_admin((SELECT auth.uid())) THEN
      RAISE EXCEPTION 'Seul le rôle PDG peut modifier une fonction de gouvernance.'
        USING errcode = '42501';
    END IF;
    RETURN NEW;
  END IF;

  NEW.taux_commission := OLD.taux_commission;
  NEW.actif := OLD.actif;
  NEW.equipe_id := OLD.equipe_id;
  NEW.poste := OLD.poste;
  NEW.district_id := OLD.district_id;
  NEW.region_id := OLD.region_id;
  NEW.departement := OLD.departement;
  NEW.user_id := OLD.user_id;
  NEW.username := OLD.username;
  NEW.relation_rh := OLD.relation_rh;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.guard_profiles_sensitive_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  -- Service-role inserts are performed only by the authenticated admin Edge
  -- Function, which validates the actor and role list before writing.
  IF (SELECT auth.uid()) IS NULL THEN
    RETURN NEW;
  END IF;

  IF private.crm_is_global_admin((SELECT auth.uid())) THEN
    IF NEW.relation_rh IN ('PDG','DG')
       AND NOT private.crm_is_global_admin((SELECT auth.uid())) THEN
      RAISE EXCEPTION 'Seul le rôle PDG peut créer un profil de gouvernance.'
        USING errcode = '42501';
    END IF;
    RETURN NEW;
  END IF;

  NEW.role := 'user';
  NEW.taux_commission := NULL;
  NEW.poste := NULL;
  NEW.equipe_id := NULL;
  NEW.departement := NULL;
  NEW.relation_rh := NULL;
  NEW.actif := false;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_governance_role_from_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- PDG and DG are assigned only through public.user_roles and the
  -- authorized role-management path. relation_rh is descriptive metadata.
  IF NEW.relation_rh = 'Associé / Actionnaire' THEN
    INSERT INTO public.user_roles(user_id, role)
    SELECT NEW.user_id, 'associe_actionnaire'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = NEW.user_id AND role = 'associe_actionnaire'
    );
  END IF;

  IF lower(trim(COALESCE(NEW.poste, ''))) IN ('technicien','technicien terrain') THEN
    INSERT INTO public.user_roles(user_id, role)
    SELECT NEW.user_id, 'technicien'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = NEW.user_id AND role = 'technicien'
    );
  ELSIF lower(trim(COALESCE(NEW.poste, ''))) IN ('commercial','commercial terrain') THEN
    INSERT INTO public.user_roles(user_id, role)
    SELECT NEW.user_id, 'commercial'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = NEW.user_id AND role = 'commercial'
    );
  ELSIF lower(trim(COALESCE(NEW.poste, ''))) IN ('service_client','service client') THEN
    INSERT INTO public.user_roles(user_id, role)
    SELECT NEW.user_id, 'service_client'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = NEW.user_id AND role = 'service_client'
    );
  END IF;

  RETURN NEW;
END;
$function$;
