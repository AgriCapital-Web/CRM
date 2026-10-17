BEGIN;
ALTER TABLE public.acquisition_lots ADD COLUMN acquisition_id uuid;
ALTER TABLE public.interventions_techniques ADD COLUMN acquisition_id uuid;
ALTER TABLE public.lots_hectares ADD COLUMN acquisition_id uuid;
ALTER TABLE public.paiements ADD COLUMN acquisition_id uuid;
ALTER TABLE public.plantations ADD COLUMN acquisition_id uuid;
UPDATE public.acquisition_lots SET acquisition_id = souscription_id;
UPDATE public.interventions_techniques SET acquisition_id = souscription_id;
UPDATE public.lots_hectares SET acquisition_id = souscription_id;
UPDATE public.paiements SET acquisition_id = souscription_id;
UPDATE public.plantations SET acquisition_id = souscription_id;
ALTER TABLE public.acquisition_lots ADD CONSTRAINT acquisition_lots_acquisition_id_fkey FOREIGN KEY (acquisition_id) REFERENCES public.client_souscriptions(id) ON DELETE SET NULL;
ALTER TABLE public.interventions_techniques ADD CONSTRAINT interventions_techniques_acquisition_id_fkey FOREIGN KEY (acquisition_id) REFERENCES public.client_souscriptions(id) ON DELETE SET NULL;
ALTER TABLE public.lots_hectares ADD CONSTRAINT lots_hectares_acquisition_id_fkey FOREIGN KEY (acquisition_id) REFERENCES public.client_souscriptions(id) ON DELETE SET NULL;
ALTER TABLE public.paiements ADD CONSTRAINT paiements_acquisition_id_fkey FOREIGN KEY (acquisition_id) REFERENCES public.client_souscriptions(id) ON DELETE RESTRICT;
ALTER TABLE public.plantations ADD CONSTRAINT plantations_acquisition_id_fkey FOREIGN KEY (acquisition_id) REFERENCES public.client_souscriptions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_acquisition_lots_acquisition_id_v2 ON public.acquisition_lots(acquisition_id);
CREATE INDEX IF NOT EXISTS idx_interventions_techniques_acquisition_id_v2 ON public.interventions_techniques(acquisition_id);
CREATE INDEX IF NOT EXISTS idx_lots_hectares_acquisition_id ON public.lots_hectares(acquisition_id);
CREATE INDEX IF NOT EXISTS idx_paiements_acquisition_id ON public.paiements(acquisition_id);
CREATE INDEX IF NOT EXISTS idx_plantations_acquisition_id_v2 ON public.plantations(acquisition_id);
CREATE OR REPLACE FUNCTION public.sync_acquisition_id_aliases() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $function$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.acquisition_id IS NULL THEN NEW.acquisition_id:=NEW.souscription_id;
    ELSIF NEW.souscription_id IS NULL THEN NEW.souscription_id:=NEW.acquisition_id;
    ELSIF NEW.acquisition_id IS DISTINCT FROM NEW.souscription_id THEN RAISE EXCEPTION 'Les références d’acquisition sont incohérentes'; END IF;
  ELSE
    IF NEW.acquisition_id IS DISTINCT FROM OLD.acquisition_id AND NEW.souscription_id IS NOT DISTINCT FROM OLD.souscription_id THEN NEW.souscription_id:=NEW.acquisition_id;
    ELSIF NEW.souscription_id IS DISTINCT FROM OLD.souscription_id AND NEW.acquisition_id IS NOT DISTINCT FROM OLD.acquisition_id THEN NEW.acquisition_id:=NEW.souscription_id;
    ELSIF NEW.acquisition_id IS DISTINCT FROM NEW.souscription_id THEN RAISE EXCEPTION 'Les références d’acquisition sont incohérentes'; END IF;
  END IF;
  RETURN NEW;
END; $function$;
CREATE TRIGGER sync_acquisition_id_aliases BEFORE INSERT OR UPDATE OF acquisition_id,souscription_id ON public.acquisition_lots FOR EACH ROW EXECUTE FUNCTION public.sync_acquisition_id_aliases();
CREATE TRIGGER sync_acquisition_id_aliases BEFORE INSERT OR UPDATE OF acquisition_id,souscription_id ON public.interventions_techniques FOR EACH ROW EXECUTE FUNCTION public.sync_acquisition_id_aliases();
CREATE TRIGGER sync_acquisition_id_aliases BEFORE INSERT OR UPDATE OF acquisition_id,souscription_id ON public.lots_hectares FOR EACH ROW EXECUTE FUNCTION public.sync_acquisition_id_aliases();
CREATE TRIGGER sync_acquisition_id_aliases BEFORE INSERT OR UPDATE OF acquisition_id,souscription_id ON public.paiements FOR EACH ROW EXECUTE FUNCTION public.sync_acquisition_id_aliases();
CREATE TRIGGER sync_acquisition_id_aliases BEFORE INSERT OR UPDATE OF acquisition_id,souscription_id ON public.plantations FOR EACH ROW EXECUTE FUNCTION public.sync_acquisition_id_aliases();
ALTER TABLE public.client_souscriptions RENAME TO acquisitions;
DO $migration$
DECLARE f record; v_definition text; v_marker text; v_pos integer; v_prefix text; v_body text;
BEGIN
  FOR f IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.prokind='f' AND n.nspname IN ('public','private') LOOP
    v_definition:=pg_get_functiondef(f.oid);
    IF position('client_souscriptions' in v_definition)=0 AND position('souscription_id' in v_definition)=0 AND position('subscription_current_payment_state' in v_definition)=0 AND position('create_client_souscription' in v_definition)=0 AND position('validate_client_souscription_foncier' in v_definition)=0 THEN CONTINUE; END IF;
    v_marker:='AS $function$'; v_pos:=strpos(v_definition,v_marker);
    IF v_pos=0 THEN v_marker:='AS $$'; v_pos:=strpos(v_definition,v_marker); END IF;
    IF v_pos=0 THEN RAISE EXCEPTION 'Cannot safely rewrite function definition for OID %',f.oid; END IF;
    v_prefix:=substring(v_definition FROM 1 FOR v_pos+length(v_marker)-1); v_body:=substring(v_definition FROM v_pos+length(v_marker));
    v_body:=replace(v_body,'_souscription_id','__LEGACY_ACQUISITION_PARAM__');
    v_body:=replace(v_body,'client_souscriptions','acquisitions');
    v_body:=replace(v_body,'souscription_id','acquisition_id');
    v_body:=replace(v_body,'subscription_current_payment_state','acquisition_current_payment_state');
    v_body:=replace(v_body,'create_client_souscription','create_client_acquisition');
    v_body:=replace(v_body,'validate_client_souscription_foncier','validate_client_acquisition_foncier');
    v_body:=replace(v_body,'souscription','acquisition');
    v_body:=replace(v_body,'subscription','acquisition');
    v_body:=replace(v_body,'__LEGACY_ACQUISITION_PARAM__','_souscription_id');
    EXECUTE v_prefix||v_body;
  END LOOP;
END; $migration$;
DO $migration$
DECLARE v_definition text;
BEGIN
  v_definition:=pg_get_functiondef('public.create_client_souscription(uuid,uuid,text,numeric,text,uuid,uuid,text)'::regprocedure);
  v_definition:=replace(v_definition,'FUNCTION public.create_client_souscription','FUNCTION public.create_client_acquisition'); EXECUTE v_definition;
  v_definition:=pg_get_functiondef('public.subscription_current_payment_state(uuid)'::regprocedure);
  v_definition:=replace(v_definition,'FUNCTION public.subscription_current_payment_state','FUNCTION public.acquisition_current_payment_state');
  v_definition:=replace(v_definition,'_souscription_id','_acquisition_id'); EXECUTE v_definition;
END; $migration$;
ALTER FUNCTION public.validate_client_souscription_foncier() RENAME TO validate_client_acquisition_foncier;
CREATE VIEW public.client_souscriptions WITH (security_invoker=true) AS SELECT * FROM public.acquisitions;
DO $migration$
DECLARE r record; v_new_name text;
BEGIN
  FOR r IN SELECT conrelid::regclass AS relation_name,conname FROM pg_constraint WHERE conname ILIKE '%souscription%' LOOP
    v_new_name:=replace(r.conname,'souscription','acquisition');
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname=v_new_name) THEN EXECUTE format('ALTER TABLE %s RENAME CONSTRAINT %I TO %I',r.relation_name,r.conname,v_new_name); END IF;
  END LOOP;
  FOR r IN SELECT schemaname,tablename,policyname FROM pg_policies WHERE schemaname='public' AND policyname ILIKE '%souscription%' LOOP
    v_new_name:=replace(r.policyname,'souscription','acquisition'); EXECUTE format('ALTER POLICY %I ON %I.%I RENAME TO %I',r.policyname,r.schemaname,r.tablename,v_new_name);
  END LOOP;
  FOR r IN SELECT t.tgname,t.tgrelid::regclass AS relation_name FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE NOT t.tgisinternal AND n.nspname='public' AND t.tgname ILIKE '%souscription%' LOOP
    v_new_name:=replace(r.tgname,'souscription','acquisition'); EXECUTE format('ALTER TRIGGER %I ON %s RENAME TO %I',r.tgname,r.relation_name,v_new_name);
  END LOOP;
  FOR r IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='i' AND c.relname ILIKE '%souscription%' LOOP
    v_new_name:=replace(r.relname,'souscription','acquisition');
    IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname=v_new_name AND relnamespace='public'::regnamespace) THEN EXECUTE format('ALTER INDEX public.%I RENAME TO %I',r.relname,v_new_name); END IF;
  END LOOP;
END; $migration$;
COMMIT;
