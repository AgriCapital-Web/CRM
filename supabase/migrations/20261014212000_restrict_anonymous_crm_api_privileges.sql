-- Restrict anonymous Data API privileges to the explicit public-facing CRM workflows.
-- RLS remains enabled; these grants are an additional least-privilege layer.
revoke all privileges on all tables in schema public from anon;

-- Public forms may submit new leads and account requests only.
grant insert on table public.leads to anon;
grant insert on table public.account_requests to anon;

-- Public-facing geography selectors and active public catalog labels.
grant select on table
  public.districts,
  public.regions,
  public.departements,
  public.sous_prefectures,
  public.villages,
  public.campements,
  public.promotions,
  public.referentiels_systeme
to anon;

-- Geography views are SECURITY INVOKER and therefore require explicit access
-- to both the views and the underlying active geography tables above.
grant select on table
  public.v_geo_districts,
  public.v_geo_regions,
  public.v_geo_departements,
  public.v_geo_sous_prefectures,
  public.v_geo_villages,
  public.v_geo_campements
to anon;
