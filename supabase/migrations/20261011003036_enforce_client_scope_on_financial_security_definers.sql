-- Historical version marker for the production guard migration.
-- Client-scoped replacements are maintained in the subsequent focused migrations.
revoke execute on function public.recalculer_parametres_financiers_client(uuid) from public, anon, authenticated;
