alter table public.leads add column if not exists telephone_secondaire_indicatif text;
alter table public.leads add column if not exists telephone_secondaire_local text;
alter table public.prospects add column if not exists telephone_secondaire_indicatif text;
alter table public.prospects add column if not exists telephone_secondaire_local text;
alter table public.clients add column if not exists telephone_secondaire_indicatif text;
alter table public.clients add column if not exists telephone_secondaire_local text;
alter table public.proprietaires_terres add column if not exists telephone_secondaire_indicatif text;
alter table public.proprietaires_terres add column if not exists telephone_secondaire_local text;