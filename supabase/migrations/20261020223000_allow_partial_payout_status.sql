alter table public.portefeuille_versements
  drop constraint if exists portefeuille_versements_statut_check;
alter table public.portefeuille_versements
  add constraint portefeuille_versements_statut_check
  check (statut = any (array['brouillon','valide','partiellement_paye','paye','annule']::text[]));
