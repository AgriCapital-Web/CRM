-- Central, transactional CRM identifier counters.
-- Unlike nextval(), row updates roll back with the INSERT transaction.
CREATE TABLE IF NOT EXISTS private.crm_identifier_counters (
  category text PRIMARY KEY,
  last_number bigint NOT NULL CHECK (last_number >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON TABLE private.crm_identifier_counters FROM PUBLIC, anon, authenticated;

INSERT INTO private.crm_identifier_counters(category, last_number) VALUES
  ('clients_ac_b', GREATEST(COALESCE((SELECT last_value FROM pg_sequences WHERE schemaname='public' AND sequencename='clients_ac_b_public_id_seq'),0), COALESCE((SELECT max((substring(id_unique from '^AC_B([0-9]+)$'))::bigint) FROM public.clients WHERE id_unique ~ '^AC_B[0-9]+$'),0))),
  ('clients_ac_c', GREATEST(COALESCE((SELECT last_value FROM pg_sequences WHERE schemaname='public' AND sequencename='clients_ac_c_public_id_seq'),0), COALESCE((SELECT max((substring(id_unique from '^AC_C([0-9]+)$'))::bigint) FROM public.clients WHERE id_unique ~ '^AC_C[0-9]+$'),0))),
  ('leads', GREATEST(COALESCE((SELECT last_value FROM pg_sequences WHERE schemaname='public' AND sequencename='leads_public_id_seq'),0), COALESCE((SELECT max((substring(id_unique from '^L([0-9]+)$'))::bigint) FROM public.leads WHERE id_unique ~ '^L[0-9]+$'),0))),
  ('prospects', GREATEST(COALESCE((SELECT last_value FROM pg_sequences WHERE schemaname='public' AND sequencename='prospects_public_id_seq'),0), COALESCE((SELECT max((substring(id_unique from '^P([0-9]+)$'))::bigint) FROM public.prospects WHERE id_unique ~ '^P[0-9]+$'),0))),
  ('plantations', GREATEST(COALESCE((SELECT last_value FROM pg_sequences WHERE schemaname='public' AND sequencename='plantations_plt_id_seq'),0), COALESCE((SELECT max((substring(id_unique from '^PLT-([0-9]+)$'))::bigint) FROM public.plantations WHERE id_unique ~ '^PLT-[0-9]+$'),0))),
  ('parcelles_internal', GREATEST(COALESCE((SELECT last_value FROM pg_sequences WHERE schemaname='public' AND sequencename='parcelles_public_id_seq'),0), COALESCE((SELECT max((substring(id_unique from '^PAR-([0-9]+)$'))::bigint) FROM public.parcelles WHERE id_unique ~ '^PAR-[0-9]+$'),0))),
  ('parcelles_code', GREATEST(COALESCE((SELECT last_value FROM pg_sequences WHERE schemaname='public' AND sequencename='parcelle_code_seq'),0), COALESCE((SELECT max((substring(code_parc from '^PARC([0-9]+)$'))::bigint) FROM public.parcelles WHERE code_parc ~ '^PARC[0-9]+$'),0))),
  ('proprietaires', GREATEST(COALESCE((SELECT last_value FROM pg_sequences WHERE schemaname='public' AND sequencename='proprietaires_terres_public_id_seq'),0), COALESCE((SELECT max((substring(id_unique from '^AC-P([0-9]+)$'))::bigint) FROM public.proprietaires_terres WHERE id_unique ~ '^AC-P[0-9]+$'),0)))
ON CONFLICT (category) DO UPDATE
SET last_number = GREATEST(private.crm_identifier_counters.last_number, EXCLUDED.last_number),
    updated_at = now();

CREATE OR REPLACE FUNCTION private.next_crm_identifier(p_category text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, private
AS $function$
DECLARE v_next bigint;
BEGIN
  UPDATE private.crm_identifier_counters
     SET last_number = last_number + 1, updated_at = clock_timestamp()
   WHERE category = p_category
   RETURNING last_number INTO v_next;
  IF v_next IS NULL THEN
    RAISE EXCEPTION 'Unknown CRM identifier category: %', p_category USING ERRCODE = '22023';
  END IF;
  RETURN v_next;
END;
$function$;

REVOKE ALL ON FUNCTION private.next_crm_identifier(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.generate_client_id(p_type_client text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $function$
DECLARE v_category text; v_prefix text; v_next bigint;
BEGIN
  IF lower(coalesce(p_type_client,'')) = 'beneficiaire_particulier' THEN
    v_category := 'clients_ac_b'; v_prefix := 'AC_B';
  ELSE
    v_category := 'clients_ac_c'; v_prefix := 'AC_C';
  END IF;
  v_next := private.next_crm_identifier(v_category);
  RETURN v_prefix || lpad(v_next::text, 6, '0');
END;
$function$;

CREATE OR REPLACE FUNCTION public.generate_client_id()
RETURNS text LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $function$
  SELECT 'AC_C' || lpad(private.next_crm_identifier('clients_ac_c')::text, 6, '0');
$function$;

CREATE OR REPLACE FUNCTION public.generate_lead_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $function$
BEGIN
  IF NEW.id_unique IS NULL OR btrim(NEW.id_unique) = '' THEN
    NEW.id_unique := 'L' || lpad(private.next_crm_identifier('leads')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.generate_prospect_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $function$
BEGIN
  IF NEW.id_unique IS NULL OR btrim(NEW.id_unique) = '' THEN
    NEW.id_unique := 'P' || lpad(private.next_crm_identifier('prospects')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.generate_plantation_id()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $function$
BEGIN
  RETURN 'PLT-' || lpad(private.next_crm_identifier('plantations')::text, 6, '0');
END;
$function$;

CREATE OR REPLACE FUNCTION public.generate_parcelle_id()
RETURNS text LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $function$
  SELECT 'PAR-' || lpad(private.next_crm_identifier('parcelles_internal')::text, 6, '0');
$function$;

CREATE OR REPLACE FUNCTION public.generate_proprietaire_id()
RETURNS text LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $function$
  SELECT 'AC-P' || lpad(private.next_crm_identifier('proprietaires')::text, 6, '0');
$function$;

CREATE OR REPLACE FUNCTION public.set_parcelle_code()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $function$
BEGIN
  IF NEW.code_parc IS NULL OR btrim(NEW.code_parc) = '' THEN
    NEW.code_parc := 'PARC' || lpad(private.next_crm_identifier('parcelles_code')::text, 3, '0');
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

CREATE UNIQUE INDEX IF NOT EXISTS parcelles_code_parc_uidx
  ON public.parcelles (code_parc)
  WHERE code_parc IS NOT NULL;
