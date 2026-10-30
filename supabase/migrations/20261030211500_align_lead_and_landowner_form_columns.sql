-- Keep lead and landowner forms aligned with their persisted payloads.
-- These fields are already submitted by the CRM forms and must exist in Postgres.
alter table public.leads
  add column if not exists localite text;

alter table public.proprietaires_terres
  add column if not exists whatsapp_indicatif text,
  add column if not exists whatsapp_local text;

comment on column public.leads.localite is
  'Localité textuelle sélectionnée ou saisie dans le formulaire CRM, en complément de village_id.';

comment on column public.proprietaires_terres.whatsapp_indicatif is
  'Indicatif international du numéro WhatsApp du propriétaire foncier.';

comment on column public.proprietaires_terres.whatsapp_local is
  'Numéro WhatsApp local du propriétaire foncier, sans indicatif pays.';
