-- Keep the complete administrative geography selected in CRM forms.
-- Additive only: existing records and values are preserved.
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS departement_id uuid;

ALTER TABLE public.proprietaires_terres
  ADD COLUMN IF NOT EXISTS departement_id uuid,
  ADD COLUMN IF NOT EXISTS village_id uuid;

ALTER TABLE public.parcelles
  ADD COLUMN IF NOT EXISTS departement_id uuid,
  ADD COLUMN IF NOT EXISTS village_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clients_departement_id_fkey') THEN
    ALTER TABLE public.clients ADD CONSTRAINT clients_departement_id_fkey
      FOREIGN KEY (departement_id) REFERENCES public.departements(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'proprietaires_terres_departement_id_fkey') THEN
    ALTER TABLE public.proprietaires_terres ADD CONSTRAINT proprietaires_terres_departement_id_fkey
      FOREIGN KEY (departement_id) REFERENCES public.departements(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'proprietaires_terres_village_id_fkey') THEN
    ALTER TABLE public.proprietaires_terres ADD CONSTRAINT proprietaires_terres_village_id_fkey
      FOREIGN KEY (village_id) REFERENCES public.villages(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'parcelles_departement_id_fkey') THEN
    ALTER TABLE public.parcelles ADD CONSTRAINT parcelles_departement_id_fkey
      FOREIGN KEY (departement_id) REFERENCES public.departements(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'parcelles_village_id_fkey') THEN
    ALTER TABLE public.parcelles ADD CONSTRAINT parcelles_village_id_fkey
      FOREIGN KEY (village_id) REFERENCES public.villages(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_clients_departement_id ON public.clients(departement_id);
CREATE INDEX IF NOT EXISTS idx_proprietaires_terres_departement_id ON public.proprietaires_terres(departement_id);
CREATE INDEX IF NOT EXISTS idx_proprietaires_terres_village_id ON public.proprietaires_terres(village_id);
CREATE INDEX IF NOT EXISTS idx_parcelles_departement_id ON public.parcelles(departement_id);
CREATE INDEX IF NOT EXISTS idx_parcelles_village_id ON public.parcelles(village_id);
