BEGIN;
DROP VIEW IF EXISTS public.client_souscriptions;
DROP FUNCTION IF EXISTS public.create_client_souscription(uuid,uuid,text,numeric,text,uuid,uuid,text);
DROP FUNCTION IF EXISTS public.subscription_current_payment_state(uuid);
DROP TRIGGER IF EXISTS sync_acquisition_id_aliases ON public.acquisition_lots;
DROP TRIGGER IF EXISTS sync_acquisition_id_aliases ON public.interventions_techniques;
DROP TRIGGER IF EXISTS sync_acquisition_id_aliases ON public.lots_hectares;
DROP TRIGGER IF EXISTS sync_acquisition_id_aliases ON public.paiements;
DROP TRIGGER IF EXISTS sync_acquisition_id_aliases ON public.plantations;
DROP FUNCTION IF EXISTS public.sync_acquisition_id_aliases();
UPDATE public.paiements
SET metadata = (metadata - 'souscription_id') || jsonb_build_object('acquisition_id', metadata->'souscription_id')
WHERE metadata ? 'souscription_id';
ALTER TABLE public.acquisition_lots DROP COLUMN IF EXISTS souscription_id;
ALTER TABLE public.interventions_techniques DROP COLUMN IF EXISTS souscription_id;
ALTER TABLE public.lots_hectares DROP COLUMN IF EXISTS souscription_id;
ALTER TABLE public.paiements DROP COLUMN IF EXISTS souscription_id;
ALTER TABLE public.plantations DROP COLUMN IF EXISTS souscription_id;
DO $cleanup$
DECLARE r record; v_new_name text;
BEGIN
  FOR r IN SELECT conrelid::regclass AS relation_name, conname FROM pg_constraint WHERE conname ILIKE '%souscription%' LOOP
    v_new_name := replace(r.conname, 'souscription', 'acquisition');
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = v_new_name) THEN
      EXECUTE format('ALTER TABLE %s RENAME CONSTRAINT %I TO %I', r.relation_name, r.conname, v_new_name);
    END IF;
  END LOOP;
  FOR r IN SELECT schemaname, tablename, policyname FROM pg_policies WHERE schemaname='public' AND policyname ILIKE '%souscription%' LOOP
    v_new_name := replace(r.policyname, 'souscription', 'acquisition');
    EXECUTE format('ALTER POLICY %I ON %I.%I RENAME TO %I', r.policyname, r.schemaname, r.tablename, v_new_name);
  END LOOP;
  FOR r IN SELECT t.tgname, t.tgrelid::regclass AS relation_name FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE NOT t.tgisinternal AND n.nspname='public' AND t.tgname ILIKE '%souscription%' LOOP
    v_new_name := replace(r.tgname, 'souscription', 'acquisition');
    EXECUTE format('ALTER TRIGGER %I ON %s RENAME TO %I', r.tgname, r.relation_name, v_new_name);
  END LOOP;
  FOR r IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='i' AND c.relname ILIKE '%souscription%' LOOP
    v_new_name := replace(r.relname, 'souscription', 'acquisition');
    IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname=v_new_name AND relnamespace='public'::regnamespace) THEN
      EXECUTE format('ALTER INDEX public.%I RENAME TO %I', r.relname, v_new_name);
    END IF;
  END LOOP;
END;
$cleanup$;
COMMIT;
