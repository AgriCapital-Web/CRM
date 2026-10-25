-- CRM contact deduplication: normalize phone/email, silently reject duplicate INSERTs,
-- and expose existing duplicate pairs for a controlled merge that preserves relationships.
-- A name alone is never considered sufficient to delete/reject a person.

CREATE OR REPLACE FUNCTION public.crm_contact_is_duplicate(a jsonb, b jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  WITH a_values AS (
    SELECT
      ARRAY_REMOVE(ARRAY[
        NULLIF(regexp_replace(COALESCE(a->>'telephone',''), '[^0-9]', '', 'g'), ''),
        NULLIF(regexp_replace(COALESCE(a->>'telephone_secondaire',''), '[^0-9]', '', 'g'), ''),
        NULLIF(regexp_replace(COALESCE(a->>'whatsapp',''), '[^0-9]', '', 'g'), '')
      ], NULL) AS phones,
      NULLIF(lower(trim(COALESCE(a->>'email',''))), '') AS email,
      lower(regexp_replace(translate(COALESCE(a->>'prenoms','') || ' ' || COALESCE(a->>'nom',''),
        'ÀÁÂÃÄÅàáâãäåÈÉÊËèéêëÌÍÎÏìíîïÒÓÔÕÖòóôõöÙÚÛÜùúûüÇç',
        'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc'),
        '[^a-zA-Z0-9]+', ' ', 'g')) AS full_name
  ), b_values AS (
    SELECT
      ARRAY_REMOVE(ARRAY[
        NULLIF(regexp_replace(COALESCE(b->>'telephone',''), '[^0-9]', '', 'g'), ''),
        NULLIF(regexp_replace(COALESCE(b->>'telephone_secondaire',''), '[^0-9]', '', 'g'), ''),
        NULLIF(regexp_replace(COALESCE(b->>'whatsapp',''), '[^0-9]', '', 'g'), '')
      ], NULL) AS phones,
      NULLIF(lower(trim(COALESCE(b->>'email',''))), '') AS email,
      lower(regexp_replace(translate(COALESCE(b->>'prenoms','') || ' ' || COALESCE(b->>'nom',''),
        'ÀÁÂÃÄÅàáâãäåÈÉÊËèéêëÌÍÎÏìíîïÒÓÔÕÖòóôõöÙÚÛÜùúûüÇç',
        'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc'),
        '[^a-zA-Z0-9]+', ' ', 'g')) AS full_name
  )
  SELECT
    EXISTS (SELECT 1 FROM a_values av, b_values bv
      WHERE EXISTS (SELECT 1 FROM unnest(av.phones) ap(phone) JOIN unnest(bv.phones) bp(phone) USING (phone))
         OR (av.email IS NOT NULL AND av.email = bv.email))
    OR EXISTS (SELECT 1 FROM a_values av, b_values bv
      WHERE av.full_name <> '' AND av.full_name = bv.full_name
        AND (cardinality(av.phones) > 0 OR av.email IS NOT NULL)
        AND (cardinality(bv.phones) > 0 OR bv.email IS NOT NULL)
        AND (EXISTS (SELECT 1 FROM unnest(av.phones) ap(phone) JOIN unnest(bv.phones) bp(phone) USING (phone))
          OR (av.email IS NOT NULL AND av.email = bv.email)));
$$;

CREATE OR REPLACE FUNCTION public.crm_reject_duplicate_contact_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  candidate jsonb := to_jsonb(NEW);
  existing jsonb;
  related_lead_id text := NULLIF(to_jsonb(NEW)->>'lead_id', '');
  table_name text;
  new_id text := NULLIF(to_jsonb(NEW)->>'id', '');
BEGIN
  FOREACH table_name IN ARRAY ARRAY['leads', 'prospects'] LOOP
    FOR existing IN EXECUTE format('SELECT to_jsonb(t) FROM public.%I t', table_name)
    LOOP
      -- Do not reject the legitimate lead/prospect pair created by the conversion workflow.
      IF table_name = 'leads' AND TG_TABLE_NAME = 'prospects'
         AND related_lead_id IS NOT NULL
         AND existing->>'id' = related_lead_id THEN
        CONTINUE;
      END IF;
      IF new_id IS NOT NULL AND existing->>'id' = new_id THEN
        CONTINUE;
      END IF;
      IF public.crm_contact_is_duplicate(candidate, existing) THEN
        -- BEFORE INSERT returning NULL is a silent, idempotent rejection in PostgreSQL.
        RETURN NULL;
      END IF;
    END LOOP;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS leads_reject_duplicate_contact_insert ON public.leads;
CREATE TRIGGER leads_reject_duplicate_contact_insert
BEFORE INSERT ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.crm_reject_duplicate_contact_insert();

DROP TRIGGER IF EXISTS prospects_reject_duplicate_contact_insert ON public.prospects;
CREATE TRIGGER prospects_reject_duplicate_contact_insert
BEFORE INSERT ON public.prospects
FOR EACH ROW EXECUTE FUNCTION public.crm_reject_duplicate_contact_insert();

CREATE OR REPLACE VIEW public.crm_duplicate_contact_candidates AS
WITH records AS (
  SELECT 'leads'::text AS table_name, id::text AS record_id, to_jsonb(l) AS record
  FROM public.leads l
  UNION ALL
  SELECT 'prospects'::text AS table_name, id::text AS record_id, to_jsonb(p) AS record
  FROM public.prospects p
)
SELECT a.table_name AS first_table, a.record_id AS first_id,
       b.table_name AS duplicate_table, b.record_id AS duplicate_id,
       COALESCE(NULLIF(a.record->>'prenoms','') || ' ', '') || COALESCE(a.record->>'nom','') AS first_name,
       COALESCE(NULLIF(b.record->>'prenoms','') || ' ', '') || COALESCE(b.record->>'nom','') AS duplicate_name,
       CASE
         WHEN lower(trim(COALESCE(a.record->>'email',''))) <> ''
          AND lower(trim(COALESCE(a.record->>'email',''))) = lower(trim(COALESCE(b.record->>'email','')))
           THEN 'email_identique'
         ELSE 'telephone_identique'
       END AS duplicate_reason
FROM records a
JOIN records b ON
  (a.table_name < b.table_name OR (a.table_name = b.table_name AND a.record_id < b.record_id))
 AND public.crm_contact_is_duplicate(a.record, b.record);

COMMENT ON VIEW public.crm_duplicate_contact_candidates IS
'Paires de leads/prospects partageant un téléphone ou un e-mail normalisé. Vérifier et fusionner en conservant les historiques avant toute suppression.';
