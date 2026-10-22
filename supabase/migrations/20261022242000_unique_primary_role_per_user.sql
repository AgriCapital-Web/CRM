create unique index if not exists user_roles_single_primary_per_user
on public.user_roles (user_id)
where is_primary is true;
