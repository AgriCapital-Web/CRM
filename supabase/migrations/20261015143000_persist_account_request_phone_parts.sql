-- Persist the international telephone components captured by the public account request form.
ALTER TABLE public.account_requests
  ADD COLUMN IF NOT EXISTS telephone_indicatif text,
  ADD COLUMN IF NOT EXISTS telephone_local text;

UPDATE public.account_requests
SET telephone_indicatif = COALESCE(telephone_indicatif, '+225'),
    telephone_local = COALESCE(
      telephone_local,
      CASE WHEN telephone LIKE '+225%' THEN substring(telephone from 5) ELSE telephone END
    )
WHERE telephone IS NOT NULL
  AND (telephone_indicatif IS NULL OR telephone_local IS NULL);
