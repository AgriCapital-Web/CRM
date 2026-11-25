begin;

-- The geography views are read by the public signup form. The previous
-- manager-only policies were assigned to PUBLIC and called private authorization
-- functions that anon cannot execute, causing every anonymous geography query
-- to fail (including the fallback queries against the base tables).
alter policy "Geo managers read all districts"
  on public.districts to authenticated;
alter policy "Geo managers update status districts"
  on public.districts to authenticated;

alter policy "Geo managers read all regions"
  on public.regions to authenticated;
alter policy "Geo managers update status regions"
  on public.regions to authenticated;

alter policy "Geo managers read all departements"
  on public.departements to authenticated;
alter policy "Geo managers update status departements"
  on public.departements to authenticated;

alter policy "Geo managers read all sous_prefectures"
  on public.sous_prefectures to authenticated;
alter policy "Geo managers update status sous_prefectures"
  on public.sous_prefectures to authenticated;

notify pgrst, 'reload schema';
commit;