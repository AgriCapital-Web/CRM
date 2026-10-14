-- Restore missing relational constraints after confirming there are no orphan rows.
alter table public.account_requests
  add constraint account_requests_sous_prefecture_id_fkey
  foreign key (sous_prefecture_id) references public.sous_prefectures(id)
  on delete set null not valid;
alter table public.account_requests validate constraint account_requests_sous_prefecture_id_fkey;

alter table public.acquisition_lots
  add constraint acquisition_lots_client_id_fkey
  foreign key (client_id) references public.clients(id)
  not valid;
alter table public.acquisition_lots validate constraint acquisition_lots_client_id_fkey;

alter table public.kkiapay_events
  add constraint kkiapay_events_paiement_id_fkey
  foreign key (paiement_id) references public.paiements(id)
  on delete set null not valid;
alter table public.kkiapay_events validate constraint kkiapay_events_paiement_id_fkey;

alter table public.profiles
  add constraint profiles_district_id_fkey
  foreign key (district_id) references public.districts(id)
  on delete set null not valid;
alter table public.profiles validate constraint profiles_district_id_fkey;

alter table public.profiles
  add constraint profiles_region_id_fkey
  foreign key (region_id) references public.regions(id)
  on delete set null not valid;
alter table public.profiles validate constraint profiles_region_id_fkey;

alter table public.tickets_techniques
  add constraint tickets_techniques_region_id_fkey
  foreign key (region_id) references public.regions(id)
  on delete set null not valid;
alter table public.tickets_techniques validate constraint tickets_techniques_region_id_fkey;
