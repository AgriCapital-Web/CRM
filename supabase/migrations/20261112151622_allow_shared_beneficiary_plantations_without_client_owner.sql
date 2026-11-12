ALTER TABLE public.plantations
  DROP CONSTRAINT IF EXISTS plantations_client_required_except_owner;
ALTER TABLE public.plantations
  ADD CONSTRAINT plantations_client_required_except_owner
  CHECK (client_id IS NOT NULL OR role_attribution IN ('proprietaire','partage'));
