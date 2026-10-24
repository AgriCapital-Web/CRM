-- Keep promotion table privileges minimal; RLS controls row-level access.
revoke truncate, references, trigger on table public.promotions from authenticated, anon;
grant select, insert, update, delete on table public.promotions to authenticated;
grant select on table public.promotions to anon;
