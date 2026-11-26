-- Moindre privilège sur l'API Data : ces droits ne servent à aucun flux applicatif.
REVOKE TRUNCATE, TRIGGER, REFERENCES, MAINTAIN ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

-- Fonction de déclencheur : ne doit pas être appelable comme RPC.
REVOKE EXECUTE ON FUNCTION public.guard_client_auth_separation() FROM PUBLIC, anon, authenticated;
