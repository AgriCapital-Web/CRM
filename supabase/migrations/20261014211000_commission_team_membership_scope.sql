-- Commission access and team attribution must respect multi-team memberships.
create or replace function private.can_view_commission_team(_user_id uuid, _team_id uuid, _type text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select
    exists (
      select 1 from public.user_roles ur
      join public.role_permissions rp on rp.role_code = ur.role
      where ur.user_id = _user_id and rp.permission_code = 'commissions.view'
    )
    and exists (
      select 1
      from public.equipes t
      where t.id = _team_id
        and (
          private.is_global_admin(_user_id)
          or exists (select 1 from public.user_roles ur where ur.user_id = _user_id and ur.role in ('comptable','responsable_operations'))
          or (
            lower(coalesce(t.type_equipe,'')) like '%commercial%'
            and _type <> 'technique'
            and exists (select 1 from public.user_roles ur where ur.user_id = _user_id and ur.role = 'responsable_commercial')
          )
          or exists (
            select 1
            from public.profiles viewer
            where viewer.user_id = _user_id
              and (
                (lower(coalesce(t.type_equipe,'')) like '%technique%'
                  and exists (select 1 from public.user_roles ur where ur.user_id = _user_id and ur.role = 'chef_equipe_technique')
                  and (_type = 'technique')
                )
                or
                (lower(coalesce(t.type_equipe,'')) like '%commercial%'
                  and exists (select 1 from public.user_roles ur where ur.user_id = _user_id and ur.role = 'chef_equipe_commercial')
                  and (_type <> 'technique')
                )
              )
              and (
                viewer.equipe_id = t.id
                or exists (select 1 from public.equipe_membres viewer_em where viewer_em.profile_id = viewer.id and viewer_em.equipe_id = t.id)
              )
          )
        )
    );
$function$;

create or replace function private.can_read_commission(_user_id uuid, _profile_id uuid, _type text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select
    exists (
      select 1 from public.user_roles ur
      join public.role_permissions rp on rp.role_code = ur.role
      where ur.user_id = _user_id and rp.permission_code = 'commissions.view'
    )
    and (
      private.is_global_admin(_user_id)
      or exists (select 1 from public.user_roles ur where ur.user_id = _user_id and ur.role in ('comptable','responsable_operations'))
      or exists (
        select 1 from public.profiles viewer
        join public.profiles target on target.id = _profile_id
        where viewer.user_id = _user_id and viewer.id = target.id
      )
      or (
        _type <> 'technique'
        and exists (select 1 from public.user_roles ur where ur.user_id = _user_id and ur.role = 'responsable_commercial')
        and exists (select 1 from public.user_roles ur where ur.user_id = (select p.user_id from public.profiles p where p.id = _profile_id) and ur.role in ('commercial','chef_equipe_commercial','responsable_commercial'))
      )
      or (
        exists (select 1 from public.user_roles ur where ur.user_id = _user_id and ur.role = 'superviseur_mobilisation_fonciere')
        and exists (
          select 1 from public.profiles viewer
          join public.profiles target on target.id = _profile_id
          where viewer.user_id = _user_id and viewer.region_id is not null and viewer.region_id = target.region_id
        )
        and exists (select 1 from public.user_roles ur where ur.user_id = (select p.user_id from public.profiles p where p.id = _profile_id) and ur.role = 'mobilisateur_foncier')
      )
      or (
        (
          (_type = 'technique' and exists (select 1 from public.user_roles ur where ur.user_id = _user_id and ur.role = 'chef_equipe_technique')
            and exists (select 1 from public.user_roles ur where ur.user_id = (select p.user_id from public.profiles p where p.id = _profile_id) and ur.role = 'technicien'))
          or
          (_type <> 'technique' and exists (select 1 from public.user_roles ur where ur.user_id = _user_id and ur.role = 'chef_equipe_commercial')
            and exists (select 1 from public.user_roles ur where ur.user_id = (select p.user_id from public.profiles p where p.id = _profile_id) and ur.role in ('commercial','chef_equipe_commercial')))
        )
        and exists (
          select 1
          from public.equipes t
          where (
            (_type = 'technique' and lower(coalesce(t.type_equipe,'')) like '%technique')
            or (_type <> 'technique' and lower(coalesce(t.type_equipe,'')) like '%commercial%')
          )
          and private.can_view_commission_team(_user_id, t.id, _type)
          and (
            t.id = (select target.equipe_id from public.profiles target where target.id = _profile_id)
            or exists (select 1 from public.equipe_membres target_em where target_em.profile_id = _profile_id and target_em.equipe_id = t.id)
          )
        )
      )
    );
$function$;

drop policy if exists equipe_membres_select_commission_scope on public.equipe_membres;
create policy equipe_membres_select_commission_scope on public.equipe_membres
for select to authenticated
using (
  private.can_view_commission_team(auth.uid(), equipe_id, 'acquisition')
  or private.can_view_commission_team(auth.uid(), equipe_id, 'technique')
);
