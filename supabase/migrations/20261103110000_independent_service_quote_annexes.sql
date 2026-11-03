-- Persist annex option fields used by the independent service quote form.
ALTER TABLE public.independent_service_proforma_items
  ADD COLUMN IF NOT EXISTS annexe_active boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS annexe_qualite text,
  ADD COLUMN IF NOT EXISTS annexe_prix numeric(14,2) NOT NULL DEFAULT 0;

-- Normalize existing rows to a safe, calculable baseline.
UPDATE public.independent_service_proforma_items
SET annexe_active = COALESCE(annexe_active, false),
    annexe_prix = COALESCE(annexe_prix, 0)
WHERE annexe_active IS NULL OR annexe_prix IS NULL;
