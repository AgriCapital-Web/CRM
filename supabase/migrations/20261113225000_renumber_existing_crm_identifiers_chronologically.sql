-- Immutable crosswalk for identifiers changed during chronological compaction.
CREATE TABLE IF NOT EXISTS private.crm_identifier_history (
  id bigserial PRIMARY KEY,
  entity_table text NOT NULL,
  record_id uuid NOT NULL,
  old_identifier text NOT NULL,
  new_identifier text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  reason text NOT NULL DEFAULT 'Renumbering existing CRM identifiers in chronological order',
  CONSTRAINT crm_identifier_history_change_uniq UNIQUE(entity_table, record_id, old_identifier)
);
REVOKE ALL ON TABLE private.crm_identifier_history FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE private.crm_identifier_history IS
  'Private immutable crosswalk of prior CRM public identifiers to their current identifiers.';

CREATE TEMP TABLE _crm_identifier_renumber_map ON COMMIT DROP AS
WITH ranked AS (
  SELECT 'leads'::text AS entity_table, id AS record_id, id_unique AS old_identifier,
         'L' || lpad(row_number() OVER (ORDER BY created_at, id)::text, 6, '0') AS new_identifier
  FROM public.leads
  UNION ALL
  SELECT 'prospects', id, id_unique,
         'P' || lpad(row_number() OVER (ORDER BY created_at, id)::text, 6, '0')
  FROM public.prospects
  UNION ALL
  SELECT 'plantations', id, id_unique,
         'PLT-' || lpad(row_number() OVER (
           ORDER BY created_at,
             CASE WHEN id_unique ~ '^PLT-[0-9]+$' THEN substring(id_unique from '^PLT-([0-9]+)$')::bigint ELSE 0 END,
             id
         )::text, 6, '0')
  FROM public.plantations
)
SELECT * FROM ranked;

INSERT INTO private.crm_identifier_history(entity_table, record_id, old_identifier, new_identifier)
SELECT entity_table, record_id, old_identifier, new_identifier
FROM _crm_identifier_renumber_map
WHERE old_identifier IS DISTINCT FROM new_identifier
ON CONFLICT (entity_table, record_id, old_identifier) DO UPDATE
SET new_identifier = EXCLUDED.new_identifier;

UPDATE public.leads l SET id_unique = '__CRM_RENUMBER__' || l.id::text
FROM _crm_identifier_renumber_map m
WHERE m.entity_table = 'leads' AND m.record_id = l.id
  AND m.old_identifier IS DISTINCT FROM m.new_identifier;

UPDATE public.prospects p SET id_unique = '__CRM_RENUMBER__' || p.id::text
FROM _crm_identifier_renumber_map m
WHERE m.entity_table = 'prospects' AND m.record_id = p.id
  AND m.old_identifier IS DISTINCT FROM m.new_identifier;

UPDATE public.plantations p SET id_unique = '__CRM_RENUMBER__' || p.id::text
FROM _crm_identifier_renumber_map m
WHERE m.entity_table = 'plantations' AND m.record_id = p.id
  AND m.old_identifier IS DISTINCT FROM m.new_identifier;

UPDATE public.leads l SET id_unique = m.new_identifier
FROM _crm_identifier_renumber_map m
WHERE m.entity_table = 'leads' AND m.record_id = l.id
  AND l.id_unique LIKE '__CRM_RENUMBER__%';

UPDATE public.prospects p SET id_unique = m.new_identifier
FROM _crm_identifier_renumber_map m
WHERE m.entity_table = 'prospects' AND m.record_id = p.id
  AND p.id_unique LIKE '__CRM_RENUMBER__%';

UPDATE public.plantations p SET id_unique = m.new_identifier
FROM _crm_identifier_renumber_map m
WHERE m.entity_table = 'plantations' AND m.record_id = p.id
  AND p.id_unique LIKE '__CRM_RENUMBER__%';

UPDATE private.crm_identifier_counters c
SET last_number = CASE c.category
  WHEN 'leads' THEN (SELECT count(*) FROM public.leads)
  WHEN 'prospects' THEN (SELECT count(*) FROM public.prospects)
  WHEN 'plantations' THEN (SELECT count(*) FROM public.plantations)
  WHEN 'clients_ac_c' THEN (
    SELECT count(*) FROM public.clients
    WHERE type_client IN ('avec_terre','client')
      AND coalesce(is_internal,false) = false
      AND lower(coalesce(nom_complet,'')) NOT LIKE '%agricapital%'
  )
  WHEN 'clients_ac_b' THEN (
    SELECT count(*) FROM public.clients
    WHERE type_client = 'beneficiaire_particulier'
  )
  WHEN 'parcelles_internal' THEN (SELECT count(*) FROM public.parcelles)
  WHEN 'proprietaires' THEN (SELECT count(*) FROM public.proprietaires_terres)
  ELSE c.last_number
END,
updated_at = now()
WHERE c.category IN ('leads','prospects','plantations','clients_ac_c','clients_ac_b','parcelles_internal','proprietaires');
