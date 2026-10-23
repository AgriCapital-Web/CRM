-- Drafts are device-local only. The CRM's NouvelleAcquisition page now stores
-- drafts in localStorage; no server-side draft table is part of the data model.
drop table if exists public.acquisitions_brouillon cascade;
