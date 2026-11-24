begin;

create index if not exists idx_equipes_district_id
  on public.equipes (district_id);

create index if not exists idx_plantations_localisation_reference_plantation_id
  on public.plantations (localisation_reference_plantation_id);

create index if not exists idx_user_permission_overrides_granted_by
  on public.user_permission_overrides (granted_by);

create index if not exists idx_user_permission_overrides_permission_code
  on public.user_permission_overrides (permission_code);

commit;
