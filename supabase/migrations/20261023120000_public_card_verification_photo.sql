-- Public card verification is served only by the verifier-carte Edge Function.
-- Keep the RPC restricted to service_role and return only the fields required by the public verification card.
DROP FUNCTION IF EXISTS public.verifier_carte(text);

CREATE FUNCTION public.verifier_carte(_code text)
RETURNS TABLE(
  matricule text,
  nom_complet text,
  poste text,
  type_contrat text,
  date_expiration date,
  statut text,
  valide boolean,
  role_code text,
  date_delivrance date,
  photo_url text,
  photo_bucket text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    c.matricule,
    p.nom_complet,
    COALESCE(c.poste, p.poste),
    c.type_contrat,
    c.date_expiration,
    c.statut,
    (
      c.statut = 'active'
      AND (
        lower(COALESCE(c.role_code, '')) = 'pdg'
        OR c.date_expiration IS NULL
        OR c.date_expiration >= current_date
      )
    ) AS valide,
    c.role_code,
    c.date_delivrance,
    COALESCE(NULLIF(c.photo_url, ''), NULLIF(p.photo_url, '')) AS photo_url,
    CASE
      WHEN NULLIF(c.photo_url, '') IS NOT NULL THEN 'cartes-personnel'
      WHEN NULLIF(p.photo_url, '') IS NOT NULL THEN 'photos-profils'
      ELSE NULL
    END AS photo_bucket
  FROM public.cartes_personnel AS c
  JOIN public.profiles AS p ON p.id = c.profile_id
  WHERE length(_code) BETWEEN 6 AND 64
    AND lower(c.code_verification) = lower(_code)
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.verifier_carte(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verifier_carte(text) FROM anon;
REVOKE ALL ON FUNCTION public.verifier_carte(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.verifier_carte(text) TO service_role;
