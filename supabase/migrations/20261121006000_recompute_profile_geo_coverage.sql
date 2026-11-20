create or replace function public.zone_assignment_expected_type(_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $function$
  select z.zone_type
  from public.zone_assignments z
  where z.user_id = _user_id
  order by
    case z.zone_type
      when 'sous_prefecture' then 1
      when 'departement' then 2
      when 'district' then 3
      when 'region' then 4
      else 5
    end,
    z.created_at desc nulls last,
    z.id desc
  limit 1;
$function$;

create or replace function public.recompute_profile_coverage(_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  expected text;
  assignment public.zone_assignments%rowtype;
begin
  if _user_id is null then return; end if;

  expected := public.zone_assignment_expected_type(_user_id);
  perform set_config('app.internal_coverage_sync', 'true', true);

  update public.profiles
  set district_id = null, region_id = null
  where user_id = _user_id;

  if expected is null then
    perform set_config('app.internal_coverage_sync', 'false', true);
    return;
  end if;

  select * into assignment
  from public.zone_assignments
  where user_id = _user_id and zone_type = expected
  order by created_at desc nulls last, id desc
  limit 1;

  if not found then
    perform set_config('app.internal_coverage_sync', 'false', true);
    return;
  end if;

  if expected = 'region' then
    update public.profiles p
    set region_id = assignment.zone_id,
        district_id = (select r.district_id from public.regions r where r.id = assignment.zone_id)
    where p.user_id = _user_id;

  elsif expected = 'district' then
    update public.profiles p
    set region_id = null,
        district_id = assignment.zone_id
    where p.user_id = _user_id;

  elsif expected = 'departement' then
    update public.profiles p
    set region_id = (select d.region_id from public.departements d where d.id = assignment.zone_id),
        district_id = (
          select r.district_id
          from public.regions r
          where r.id = (select d.region_id from public.departements d where d.id = assignment.zone_id)
        )
    where p.user_id = _user_id;

  elsif expected = 'sous_prefecture' then
    update public.profiles p
    set region_id = (
          select d.region_id
          from public.departements d
          where d.id = (select sp.departement_id from public.sous_prefectures sp where sp.id = assignment.zone_id)
        ),
        district_id = (
          select r.district_id
          from public.regions r
          where r.id = (
            select d.region_id
            from public.departements d
            where d.id = (select sp.departement_id from public.sous_prefectures sp where sp.id = assignment.zone_id)
          )
        )
    where p.user_id = _user_id;
  end if;

  perform set_config('app.internal_coverage_sync', 'false', true);
end;
$function$;