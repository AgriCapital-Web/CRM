do $backfill$
declare
  v_user_id uuid;
begin
  for v_user_id in
    select distinct user_id from public.zone_assignments
  loop
    perform public.recompute_profile_coverage(v_user_id);
  end loop;
end;
$backfill$;