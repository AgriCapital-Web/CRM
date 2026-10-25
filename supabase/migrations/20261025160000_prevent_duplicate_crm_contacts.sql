-- Centralized CRM contact identity, database-side silent insert rejection,
-- and an audit view for pre-existing duplicate candidates. Linked lead/prospect
-- pairs created by the conversion workflow are explicitly allowed.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.normalize_crm_phone(value text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog, private, public AS $$
  SELECT CASE WHEN length(digits) = 13 AND left(digits, 3) = '225'
    THEN right(digits, 10) ELSE digits END
  FROM (SELECT regexp_replace(COALESCE(value, ''), '[^0-9]', '', 'g') AS digits) normalized;
$$;

CREATE OR REPLACE FUNCTION private.crm_contact_is_duplicate(a jsonb, b jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog, private, public AS $$
  WITH a_values AS (
    SELECT ARRAY_REMOVE(ARRAY[
      NULLIF(private.normalize_crm_phone(a->>'telephone'), ''),
      NULLIF(private.normalize_crm_phone(a->>'telephone_secondaire'), ''),
      NULLIF(private.normalize_crm_phone(a->>'whatsapp'), '')
    ], NULL) AS phones,
    CASE WHEN lower(trim(COALESCE(a->>'email',''))) LIKE '%@%'
      THEN lower(trim(a->>'email')) END AS email,
    lower(regexp_replace(translate(COALESCE(a->>'prenoms','') || ' ' || COALESCE(a->>'nom',''),
      'ÀÁÂÃÄÅàáâãäåÈÉÊËèéêëÌÍÎÏìíîïÒÓÔÕÖòóôõöÙÚÛÜùúûüÇç',
      'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc'),
      '[^a-zA-Z0-9]+', ' ', 'g')) AS full_name
  ), b_values AS (
    SELECT ARRAY_REMOVE(ARRAY[
      NULLIF(private.normalize_crm_phone(b->>'telephone'), ''),
      NULLIF(private.normalize_crm_phone(b->>'telephone_secondaire'), ''),
      NULLIF(private.normalize_crm_phone(b->>'whatsapp'), '')
    ], NULL) AS phones,
    CASE WHEN lower(trim(COALESCE(b->>'email',''))) LIKE '%@%'
      THEN lower(trim(b->>'email')) END AS email,
    lower(regexp_replace(translate(COALESCE(b->>'prenoms','') || ' ' || COALESCE(b->>'nom',''),
      'ÀÁÂÃÄÅàáâãäåÈÉÊËèéêëÌÍÎÏìíîïÒÓÔÕÖòóôõöÙÚÛÜùúûüÇç',
      'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc'),
      '[^a-zA-Z0-9]+', ' ', 'g')) AS full_name
  )
  SELECT EXISTS (
    SELECT 1 FROM a_values av, b_values bv
    WHERE EXISTS (SELECT 1 FROM unnest(av.phones) ap(phone)
                  JOIN unnest(bv.phones) bp(phone) USING (phone))
       OR (av.email IS NOT NULL AND av.email = bv.email)
  );
$$;

-- Index each normalized contact channel so the trigger stays usable for bulk imports.
CREATE INDEX IF NOT EXISTS leads_phone_normalized_idx ON public.leads (private.normalize_crm_phone(telephone));
CREATE INDEX IF NOT EXISTS leads_phone2_normalized_idx ON public.leads (private.normalize_crm_phone(telephone_secondaire));
CREATE INDEX IF NOT EXISTS leads_whatsapp_normalized_idx ON public.leads (private.normalize_crm_phone(whatsapp));
CREATE INDEX IF NOT EXISTS leads_email_normalized_idx ON public.leads (lower(trim(email))) WHERE email LIKE '%@%';
CREATE INDEX IF NOT EXISTS prospects_phone_normalized_idx ON public.prospects (private.normalize_crm_phone(telephone));
CREATE INDEX IF NOT EXISTS prospects_phone2_normalized_idx ON public.prospects (private.normalize_crm_phone(telephone_secondaire));
CREATE INDEX IF NOT EXISTS prospects_whatsapp_normalized_idx ON public.prospects (private.normalize_crm_phone(whatsapp));
CREATE INDEX IF NOT EXISTS prospects_email_normalized_idx ON public.prospects (lower(trim(email))) WHERE email LIKE '%@%';

CREATE OR REPLACE FUNCTION private.reject_duplicate_crm_contact_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, private AS $$
DECLARE
  candidate jsonb := to_jsonb(NEW);
  candidate_phones text[];
  candidate_email text;
  related_counterpart_id text := CASE WHEN TG_TABLE_NAME = 'prospects' THEN NULLIF(to_jsonb(NEW)->>'lead_id', '') ELSE NULLIF(to_jsonb(NEW)->>'prospect_id', '') END;
  table_name text;
  existing jsonb;
BEGIN
  candidate_phones := ARRAY_REMOVE(ARRAY[
    NULLIF(private.normalize_crm_phone(candidate->>'telephone'), ''),
    NULLIF(private.normalize_crm_phone(candidate->>'telephone_secondaire'), ''),
    NULLIF(private.normalize_crm_phone(candidate->>'whatsapp'), '')
  ], NULL);
  candidate_email := CASE WHEN lower(trim(COALESCE(candidate->>'email',''))) LIKE '%@%'
    THEN lower(trim(candidate->>'email')) END;

  FOREACH table_name IN ARRAY ARRAY['leads', 'prospects', 'clients', 'proprietaires_terres'] LOOP
    FOR existing IN EXECUTE format(
      'SELECT to_jsonb(t) FROM public.%I t
       WHERE (private.normalize_crm_phone(t.telephone) = ANY($1)
          OR private.normalize_crm_phone(t.telephone_secondaire) = ANY($1)
          OR private.normalize_crm_phone(t.whatsapp) = ANY($1)
          OR ($2 IS NOT NULL AND lower(trim(t.email)) = $2))
       AND ($3 IS NULL OR t.id::text <> $3)
       AND NOT (
         ($4 = ''prospects'' AND $5 = ''leads'' AND t.id::text = $6)
         OR ($4 = ''leads'' AND $5 = ''prospects'' AND t.id::text = $6)
         OR ($4 IN (''leads'', ''prospects'') AND $5 = ''clients'' AND t.id::text = $7)
         OR ($4 IN (''leads'', ''prospects'') AND $5 = ''proprietaires_terres'' AND t.id::text = $8)
       )',
      table_name
    ) USING candidate_phones, candidate_email, NULLIF(candidate->>'id',''),
      TG_TABLE_NAME, table_name, related_counterpart_id,
      NULLIF(candidate->>'client_id',''), NULLIF(candidate->>'proprietaire_id','')
    LOOP
      IF private.crm_contact_is_duplicate(candidate, existing) THEN
        RETURN NULL;
      END IF;
    END LOOP;
  END LOOP;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.reject_duplicate_crm_contact_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.crm_contact_is_duplicate(jsonb,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.normalize_crm_phone(text) FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.normalize_crm_phone(text), private.crm_contact_is_duplicate(jsonb,jsonb) TO authenticated;

DROP TRIGGER IF EXISTS leads_reject_duplicate_contact_insert ON public.leads;
CREATE TRIGGER leads_reject_duplicate_contact_insert
BEFORE INSERT OR UPDATE OF telephone, telephone_secondaire, whatsapp, email, nom, prenoms ON public.leads
FOR EACH ROW EXECUTE FUNCTION private.reject_duplicate_crm_contact_insert();

DROP TRIGGER IF EXISTS prospects_reject_duplicate_contact_insert ON public.prospects;
CREATE TRIGGER prospects_reject_duplicate_contact_insert
BEFORE INSERT OR UPDATE OF telephone, telephone_secondaire, whatsapp, email, nom, prenoms ON public.prospects
FOR EACH ROW EXECUTE FUNCTION private.reject_duplicate_crm_contact_insert();

-- Client and landowner registries also reject duplicates within their own entity table.
-- Cross-stage records remain possible for explicit lead/prospect-to-client conversion workflows.
CREATE OR REPLACE FUNCTION private.reject_duplicate_within_entity_table()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, private AS $$
DECLARE
  candidate jsonb := to_jsonb(NEW);
  existing jsonb;
  phone_values text[];
  email_value text;
BEGIN
  phone_values := ARRAY_REMOVE(ARRAY[
    NULLIF(private.normalize_crm_phone(candidate->>'telephone'), ''),
    NULLIF(private.normalize_crm_phone(candidate->>'telephone_secondaire'), ''),
    NULLIF(private.normalize_crm_phone(candidate->>'whatsapp'), '')
  ], NULL);
  email_value := CASE WHEN lower(trim(COALESCE(candidate->>'email',''))) LIKE '%@%'
    THEN lower(trim(candidate->>'email')) END;

  FOR existing IN EXECUTE format(
    'SELECT to_jsonb(t) FROM public.%I t
     WHERE t.id::text <> COALESCE($1, '''')
       AND (private.normalize_crm_phone(t.telephone) = ANY($2)
         OR private.normalize_crm_phone(t.telephone_secondaire) = ANY($2)
         OR private.normalize_crm_phone(t.whatsapp) = ANY($2)
         OR ($3 IS NOT NULL AND lower(trim(t.email)) = $3))',
    TG_TABLE_NAME
  ) USING NULLIF(candidate->>'id',''), phone_values, email_value
  LOOP
    IF private.crm_contact_is_duplicate(candidate, existing) THEN
      RETURN NULL;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.reject_duplicate_within_entity_table() FROM PUBLIC, anon, authenticated;

CREATE INDEX IF NOT EXISTS clients_phone_normalized_idx ON public.clients (private.normalize_crm_phone(telephone));
CREATE INDEX IF NOT EXISTS clients_phone2_normalized_idx ON public.clients (private.normalize_crm_phone(telephone_secondaire));
CREATE INDEX IF NOT EXISTS clients_whatsapp_normalized_idx ON public.clients (private.normalize_crm_phone(whatsapp));
CREATE INDEX IF NOT EXISTS clients_email_normalized_idx ON public.clients (lower(trim(email))) WHERE email LIKE '%@%';
CREATE INDEX IF NOT EXISTS proprietaires_phone_normalized_idx ON public.proprietaires_terres (private.normalize_crm_phone(telephone));
CREATE INDEX IF NOT EXISTS proprietaires_phone2_normalized_idx ON public.proprietaires_terres (private.normalize_crm_phone(telephone_secondaire));
CREATE INDEX IF NOT EXISTS proprietaires_whatsapp_normalized_idx ON public.proprietaires_terres (private.normalize_crm_phone(whatsapp));
CREATE INDEX IF NOT EXISTS proprietaires_email_normalized_idx ON public.proprietaires_terres (lower(trim(email))) WHERE email LIKE '%@%';

DROP TRIGGER IF EXISTS clients_reject_duplicate_contact ON public.clients;
CREATE TRIGGER clients_reject_duplicate_contact
BEFORE INSERT OR UPDATE OF telephone, telephone_secondaire, whatsapp, email, nom, prenoms, nom_complet, nom_famille
ON public.clients FOR EACH ROW EXECUTE FUNCTION private.reject_duplicate_within_entity_table();

DROP TRIGGER IF EXISTS proprietaires_reject_duplicate_contact ON public.proprietaires_terres;
CREATE TRIGGER proprietaires_reject_duplicate_contact
BEFORE INSERT OR UPDATE OF telephone, telephone_secondaire, whatsapp, email, nom, prenoms, nom_complet
ON public.proprietaires_terres FOR EACH ROW EXECUTE FUNCTION private.reject_duplicate_within_entity_table();

CREATE OR REPLACE VIEW public.crm_duplicate_contact_candidates WITH (security_invoker = true) AS
WITH records AS (
  SELECT 'leads'::text AS table_name, id::text AS record_id, to_jsonb(l) AS record FROM public.leads l
  UNION ALL
  SELECT 'prospects'::text AS table_name, id::text AS record_id, to_jsonb(p) AS record FROM public.prospects p
  UNION ALL
  SELECT 'clients'::text AS table_name, id::text AS record_id, to_jsonb(c) AS record FROM public.clients c
  UNION ALL
  SELECT 'proprietaires_terres'::text AS table_name, id::text AS record_id, to_jsonb(o) AS record FROM public.proprietaires_terres o
)
SELECT a.table_name AS first_table, a.record_id AS first_id,
       b.table_name AS duplicate_table, b.record_id AS duplicate_id,
       COALESCE(NULLIF(a.record->>'prenoms','') || ' ', '') || COALESCE(a.record->>'nom','') AS first_name,
       COALESCE(NULLIF(b.record->>'prenoms','') || ' ', '') || COALESCE(b.record->>'nom','') AS duplicate_name,
       CASE WHEN lower(trim(COALESCE(a.record->>'email',''))) LIKE '%@%'
                  AND lower(trim(a.record->>'email')) = lower(trim(b.record->>'email'))
            THEN 'email_identique' ELSE 'telephone_identique' END AS duplicate_reason
FROM records a
JOIN records b ON
  (a.table_name < b.table_name OR (a.table_name = b.table_name AND a.record_id < b.record_id))
 AND private.crm_contact_is_duplicate(a.record, b.record)
WHERE NOT (
  (a.table_name = 'leads' AND b.table_name = 'prospects'
    AND (b.record->>'lead_id' = a.record_id OR a.record->>'prospect_id' = b.record_id))
  OR (a.table_name = 'clients' AND b.table_name = 'proprietaires_terres'
    AND a.record->>'proprietaire_id' = b.record_id)
  OR (a.table_name = 'leads' AND b.table_name = 'clients'
    AND a.record->>'client_id' = b.record_id)
  OR (a.table_name = 'leads' AND b.table_name = 'proprietaires_terres'
    AND a.record->>'proprietaire_id' = b.record_id)
  OR (a.table_name = 'prospects' AND b.table_name = 'clients'
    AND a.record->>'client_id' = b.record_id)
  OR (a.table_name = 'prospects' AND b.table_name = 'proprietaires_terres'
    AND a.record->>'proprietaire_id' = b.record_id)
  OR (a.table_name = 'clients' AND b.table_name = 'leads'
    AND b.record->>'client_id' = a.record_id)
  OR (a.table_name = 'clients' AND b.table_name = 'prospects'
    AND b.record->>'client_id' = a.record_id)
  OR (a.table_name = 'proprietaires_terres' AND b.table_name = 'clients'
    AND b.record->>'proprietaire_id' = a.record_id)
  OR (a.table_name = 'proprietaires_terres' AND b.table_name = 'leads'
    AND b.record->>'proprietaire_id' = a.record_id)
  OR (a.table_name = 'proprietaires_terres' AND b.table_name = 'prospects'
    AND b.record->>'proprietaire_id' = a.record_id)
);

GRANT SELECT ON public.crm_duplicate_contact_candidates TO authenticated;
COMMENT ON VIEW public.crm_duplicate_contact_candidates IS
'Pairs sharing a normalized phone or valid email, excluding linked lead/prospect conversions. Verify name mismatches before merge/deletion.';
