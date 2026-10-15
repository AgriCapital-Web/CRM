-- Persist a single explicit primary role per user while retaining every secondary role.
ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS user_roles_one_primary_per_user
  ON public.user_roles (user_id)
  WHERE is_primary = true;

-- Existing accounts without a primary role keep all assignments; the oldest role
-- becomes the default primary until an administrator chooses another one.
UPDATE public.user_roles ur
SET is_primary = true
WHERE ur.id = (
  SELECT candidate.id
  FROM public.user_roles candidate
  WHERE candidate.user_id = ur.user_id
  ORDER BY candidate.created_at ASC NULLS LAST, candidate.id ASC
  LIMIT 1
)
AND NOT EXISTS (
  SELECT 1 FROM public.user_roles current_primary
  WHERE current_primary.user_id = ur.user_id AND current_primary.is_primary = true
);

-- Correct the display title for the customer-relations/support profile.
UPDATE public.profiles
SET poste = 'Relation client & Support', updated_at = now()
WHERE lower(trim(nom_complet)) = lower('KONAN AMENAN LARISSA')
  AND lower(coalesce(poste, '')) LIKE '%relation client%';
