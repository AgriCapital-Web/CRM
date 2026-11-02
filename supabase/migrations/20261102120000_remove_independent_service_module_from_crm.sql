-- Retrait définitif de l'ancien module de prestations indépendantes du CRM.
-- Les données de ce module appartiennent désormais au dépôt indépendant.
drop function if exists public.independent_service_mark_proforma_in_progress() cascade;
drop table if exists public.independent_service_items cascade;
drop table if exists public.independent_service_events cascade;
drop table if exists public.independent_service_devis cascade;
drop table if exists public.independent_service_customers cascade;
drop table if exists public.independent_service_catalog cascade;
