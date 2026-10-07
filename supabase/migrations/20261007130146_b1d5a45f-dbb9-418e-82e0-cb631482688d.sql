ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS contact_urgence_email text;

CREATE OR REPLACE FUNCTION public.guard_profiles_sensitive_update()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF current_setting('app.internal_coverage_sync', true)='true' OR public.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;
  NEW.user_id:=OLD.user_id;
  NEW.taux_commission:=OLD.taux_commission;
  NEW.poste:=OLD.poste;
  NEW.equipe_id:=OLD.equipe_id;
  NEW.actif:=OLD.actif;
  NEW.district_id:=OLD.district_id;
  NEW.region_id:=OLD.region_id;
  NEW.departement:=OLD.departement;
  NEW.relation_rh:=OLD.relation_rh;
  NEW.username:=OLD.username;
  NEW.email:=OLD.email;
  NEW.telephone:=OLD.telephone;
  NEW.telephone_indicatif:=OLD.telephone_indicatif;
  NEW.telephone_local:=OLD.telephone_local;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_profile_poste(_user_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v text;
BEGIN
  SELECT string_agg(coalesce(ar.nom, ur.role::text), ', ' ORDER BY coalesce(ar.niveau,99), coalesce(ar.nom, ur.role::text))
    INTO v
  FROM public.user_roles ur LEFT JOIN public.app_roles ar ON ar.code = ur.role::text
  WHERE ur.user_id = _user_id;
  PERFORM set_config('app.internal_coverage_sync','true',true);
  UPDATE public.profiles SET poste = v WHERE user_id = _user_id;
  PERFORM set_config('app.internal_coverage_sync','false',true);
END $$;
REVOKE ALL ON FUNCTION public.sync_profile_poste(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.trg_sync_profile_poste()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP IN ('INSERT','UPDATE') THEN PERFORM public.sync_profile_poste(NEW.user_id); END IF;
  IF TG_OP IN ('DELETE','UPDATE') THEN PERFORM public.sync_profile_poste(OLD.user_id); END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_user_roles_sync_poste ON public.user_roles;
CREATE TRIGGER trg_user_roles_sync_poste AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.trg_sync_profile_poste();

DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT DISTINCT user_id FROM public.profiles WHERE user_id IS NOT NULL LOOP
    PERFORM public.sync_profile_poste(r.user_id);
  END LOOP;
END $$;

DROP POLICY IF EXISTS "Admins delete clients" ON public.clients;
CREATE POLICY "Admins delete clients" ON public.clients FOR DELETE TO authenticated
USING (private.is_admin((select auth.uid())));

DROP POLICY IF EXISTS "Authorized staff delete proprietaires" ON public.proprietaires_terres;
CREATE POLICY "Authorized staff delete proprietaires" ON public.proprietaires_terres FOR DELETE TO authenticated
USING (private.has_role_permission('proprietaires.delete'));

DROP POLICY IF EXISTS "Users upload own id documents" ON storage.objects;
CREATE POLICY "Users upload own id documents" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id='pieces-identite' AND (storage.foldername(name))[1] = (select auth.uid())::text);
DROP POLICY IF EXISTS "Users update own id documents" ON storage.objects;
CREATE POLICY "Users update own id documents" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id='pieces-identite' AND (storage.foldername(name))[1] = (select auth.uid())::text);
DROP POLICY IF EXISTS "Users read own id documents" ON storage.objects;
CREATE POLICY "Users read own id documents" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id='pieces-identite' AND ((storage.foldername(name))[1] = (select auth.uid())::text OR private.is_admin((select auth.uid()))));