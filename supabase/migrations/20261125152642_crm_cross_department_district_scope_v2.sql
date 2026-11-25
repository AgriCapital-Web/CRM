
-- Référentiel de rôles : rendre les nouveaux postes visibles dans les formulaires internes.
drop policy if exists app_roles_public_signup_select on public.app_roles;
create policy app_roles_public_signup_select
on public.app_roles for select to anon, authenticated
using (
  actif is true and code = any(array[
    'commercial','technicien','mobilisateur_foncier',
    'superviseur_mobilisation_fonciere','chef_equipe_commercial',
    'chef_equipe_technique','responsable_commercial',
    'responsable_technique_zone','manager_commercial_national',
    'manager_technique_national','responsable_operations',
    'responsable_district','comptable','service_client'
  ])
);

-- Les RTZ pilotent les équipes techniques de leur zone et accèdent à leurs commissions.
insert into public.role_permissions(role_code,permission_code)
select 'responsable_technique_zone', ap.code
from public.app_permissions ap
where ap.code in ('parametres.manage_teams','commissions.view')
and not exists (
  select 1 from public.role_permissions rp
  where rp.role_code='responsable_technique_zone' and rp.permission_code=ap.code
);

-- La vue des utilisateurs internes applique désormais les politiques RLS de profiles.
alter view public.v_internal_users set (security_invoker = true);

-- Le répertoire d'équipes expose toutes les équipes du district au RD,
-- sans filtre par département. Le RCZ et le RTZ restent dans leur filière.
create or replace function public.get_team_directory_for_current_user()
returns table(
  id uuid, nom text, responsable_id uuid, region_id uuid, district_id uuid,
  type_equipe text, actif boolean, zone_couverture text, photo_url text,
  created_at timestamptz, region_nom text
)
language plpgsql stable security definer set search_path = ''
as $function$
begin
  if auth.uid() is null
     or not private.crm_has_role_permission('parametres.manage_teams') then
    raise exception 'Permission insuffisante pour consulter les équipes.' using errcode = '42501';
  end if;

  return query
  select e.id, e.nom, e.responsable_id, e.region_id,
         coalesce(e.district_id, r.district_id),
         e.type_equipe, e.actif, e.zone_couverture, e.photo_url, e.created_at,
         r.nom
  from public.equipes e
  left join public.regions r on r.id=e.region_id
  where private.crm_user_can_access_geo(
      auth.uid(), e.region_id, coalesce(e.district_id,r.district_id), null, null
    )
    and (
      private.crm_is_global_admin(auth.uid())
      or private.crm_user_has_global_scope(auth.uid())
      or exists(select 1 from public.user_roles ur where ur.user_id=auth.uid() and ur.role='responsable_district')
      or (
        exists(select 1 from public.user_roles ur where ur.user_id=auth.uid() and ur.role='responsable_technique_zone')
        and lower(coalesce(e.type_equipe,'')) like '%technique%'
      )
      or (
        exists(select 1 from public.user_roles ur where ur.user_id=auth.uid() and ur.role='responsable_commercial')
        and lower(coalesce(e.type_equipe,'')) like '%commercial%'
      )
      or not exists(
        select 1 from public.user_roles ur where ur.user_id=auth.uid()
        and ur.role in ('responsable_district','responsable_technique_zone','responsable_commercial')
      )
    )
  order by e.created_at desc;
end;
$function$;

revoke all on function public.get_team_directory_for_current_user() from public, anon;
grant execute on function public.get_team_directory_for_current_user() to authenticated, service_role;

-- Les responsables nationaux dotés d'une couverture globale peuvent affecter
-- les commerciaux dans leur périmètre national.
create or replace function private.can_assign_commercial_to(_actor uuid, _target uuid)
returns boolean language sql stable security definer set search_path = ''
as $function$
  select _target is not null
    and private.is_commercial_assignable(_target)
    and (
      private.is_global_admin(_actor)
      or private.crm_user_has_global_scope(_actor)
      or private.has_role(_actor,'responsable_operations')
      or private.has_role(_actor,'service_client')
      or private.has_role(_actor,'chef_equipe_service_client')
      or _actor = _target
      or (
        private.has_role(_actor,'responsable_district')
        and exists(select 1 from public.profiles a join public.profiles t on t.user_id=_target
                   where a.user_id=_actor and a.district_id is not null and a.district_id=t.district_id)
      )
      or (
        private.has_role(_actor,'responsable_commercial')
        and (
          exists(select 1 from public.profiles a join public.profiles t on t.user_id=_target
                 where a.user_id=_actor and (
                   (a.region_id is not null and t.region_id=a.region_id)
                   or (a.equipe_id is not null and t.equipe_id=a.equipe_id)))
          or exists(select 1 from public.zone_assignments z join public.profiles t on t.user_id=_target
                    where z.user_id=_actor and z.zone_type='region' and z.zone_id=t.region_id)
        )
      )
      or (
        private.has_role(_actor,'chef_equipe_commercial')
        and (
          exists(select 1 from public.profiles a join public.profiles t on t.user_id=_target
                 where a.user_id=_actor and (
                   (a.equipe_id is not null and t.equipe_id=a.equipe_id)
                   or (a.district_id is not null and t.district_id=a.district_id)
                   or (a.region_id is not null and t.region_id=a.region_id)))
          or exists(select 1 from public.zone_assignments z join public.profiles t on t.user_id=_target
                    where z.user_id=_actor and z.zone_type in ('departement','region','district')
                      and ((z.zone_type='region' and z.zone_id=t.region_id)
                        or (z.zone_type='district' and z.zone_id=t.district_id)))
        )
      )
    );
$function$;

create or replace function private.can_view_commission_team(_user_id uuid,_team_id uuid,_type text)
returns boolean language sql stable security definer set search_path = ''
as $function$
  select private.crm_user_has_role_permission(_user_id,'commissions.view')
  and exists(
    select 1 from public.equipes t where t.id=_team_id and (
      private.crm_is_global_admin(_user_id)
      or private.crm_user_has_global_scope(_user_id)
      or (
        exists(select 1 from public.user_roles ur where ur.user_id=_user_id and ur.role='responsable_operations')
        and (exists(select 1 from public.profiles v where v.user_id=_user_id and v.region_id is not null and v.region_id=t.region_id)
          or exists(select 1 from public.zone_assignments z where z.user_id=_user_id and z.zone_type='region' and z.zone_id=t.region_id))
      )
      or (
        exists(select 1 from public.user_roles ur where ur.user_id=_user_id and ur.role='responsable_district')
        and exists(select 1 from public.profiles v where v.user_id=_user_id and v.district_id is not null and v.district_id=coalesce(t.district_id,(select r.district_id from public.regions r where r.id=t.region_id)))
      )
      or (
        _type='technique' and lower(coalesce(t.type_equipe,'')) like '%technique%'
        and exists(select 1 from public.user_roles ur join public.profiles v on v.user_id=ur.user_id
                   where ur.user_id=_user_id and ur.role='responsable_technique_zone'
                     and v.region_id is not null and v.region_id=t.region_id)
      )
      or (
        lower(coalesce(t.type_equipe,'')) like '%commercial%' and _type<>'technique'
        and exists(select 1 from public.user_roles ur join public.profiles v on v.user_id=ur.user_id
                   where ur.user_id=_user_id and ur.role='responsable_commercial'
                     and v.region_id is not null and v.region_id=t.region_id)
      )
      or exists(
        select 1 from public.profiles v where v.user_id=_user_id
        and (
          (lower(coalesce(t.type_equipe,'')) like '%technique%'
            and exists(select 1 from public.user_roles ur where ur.user_id=_user_id and ur.role='chef_equipe_technique')
            and _type='technique')
          or (lower(coalesce(t.type_equipe,'')) like '%commercial%'
            and exists(select 1 from public.user_roles ur where ur.user_id=_user_id and ur.role='chef_equipe_commercial')
            and _type<>'technique')
        )
        and (v.equipe_id=t.id or exists(select 1 from public.equipe_membres em where em.profile_id=v.id and em.equipe_id=t.id))
      )
    )
  );
$function$;

create or replace function private.can_read_commission(_user_id uuid,_profile_id uuid,_type text)
returns boolean language sql stable security definer set search_path = ''
as $function$
  select private.crm_user_has_role_permission(_user_id,'commissions.view')
  and (
    private.crm_is_global_admin(_user_id)
    or private.crm_user_has_global_scope(_user_id)
    or (
      exists(select 1 from public.user_roles ur where ur.user_id=_user_id and ur.role='responsable_operations')
      and (exists(select 1 from public.profiles v join public.profiles t on t.id=_profile_id
                  where v.user_id=_user_id and v.region_id is not null and v.region_id=t.region_id)
        or exists(select 1 from public.zone_assignments z join public.profiles t on t.id=_profile_id
                  where z.user_id=_user_id and z.zone_type='region' and z.zone_id=t.region_id))
    )
    or (
      exists(select 1 from public.user_roles ur where ur.user_id=_user_id and ur.role='responsable_district')
      and exists(select 1 from public.profiles v join public.profiles t on t.id=_profile_id
                 where v.user_id=_user_id and v.district_id is not null and v.district_id=t.district_id)
    )
    or exists(select 1 from public.profiles v join public.profiles t on t.id=_profile_id
              where v.user_id=_user_id and v.id=t.id)
    or (
      _type='technique'
      and exists(select 1 from public.user_roles ur where ur.user_id=_user_id and ur.role='responsable_technique_zone')
      and exists(select 1 from public.profiles v join public.profiles t on t.id=_profile_id
                 where v.user_id=_user_id and v.region_id is not null and v.region_id=t.region_id)
      and exists(select 1 from public.user_roles ur where ur.user_id=(select p.user_id from public.profiles p where p.id=_profile_id)
                 and ur.role in ('technicien','chef_equipe_technique','responsable_technique_zone'))
    )
    or (
      _type<>'technique'
      and exists(select 1 from public.user_roles ur where ur.user_id=_user_id and ur.role='responsable_commercial')
      and exists(select 1 from public.user_roles ur where ur.user_id=(select p.user_id from public.profiles p where p.id=_profile_id)
                 and ur.role in ('commercial','chef_equipe_commercial','responsable_commercial'))
      and exists(select 1 from public.profiles v join public.profiles t on t.id=_profile_id
                 where v.user_id=_user_id and v.region_id is not null and v.region_id=t.region_id)
    )
    or (
      exists(select 1 from public.user_roles ur where ur.user_id=_user_id and ur.role='superviseur_mobilisation_fonciere')
      and exists(select 1 from public.profiles v join public.profiles t on t.id=_profile_id
                 where v.user_id=_user_id and v.region_id is not null and v.region_id=t.region_id)
      and exists(select 1 from public.user_roles ur where ur.user_id=(select p.user_id from public.profiles p where p.id=_profile_id)
                 and ur.role='mobilisateur_foncier')
    )
    or (
      (
        (_type='technique' and exists(select 1 from public.user_roles ur where ur.user_id=_user_id and ur.role='chef_equipe_technique')
          and exists(select 1 from public.user_roles ur where ur.user_id=(select p.user_id from public.profiles p where p.id=_profile_id) and ur.role='technicien'))
        or (_type<>'technique' and exists(select 1 from public.user_roles ur where ur.user_id=_user_id and ur.role='chef_equipe_commercial')
          and exists(select 1 from public.user_roles ur where ur.user_id=(select p.user_id from public.profiles p where p.id=_profile_id) and ur.role in ('commercial','chef_equipe_commercial')))
      )
      and exists(select 1 from public.equipes t
        where ((_type='technique' and lower(coalesce(t.type_equipe,'')) like '%technique')
          or (_type<>'technique' and lower(coalesce(t.type_equipe,'')) like '%commercial%'))
        and private.can_view_commission_team(_user_id,t.id,_type)
        and (t.id=(select target.equipe_id from public.profiles target where target.id=_profile_id)
          or exists(select 1 from public.equipe_membres em where em.profile_id=_profile_id and em.equipe_id=t.id)))
    )
  );
$function$;

create or replace function public.recalculer_bonus_commerciaux_mensuels(p_mois date default current_date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_debut date;
  v_fin date;
  r record;
  v_profile_id uuid;
  v_montant numeric;
begin
  v_debut := date_trunc('month', coalesce(p_mois, current_date))::date;
  v_fin := (v_debut + interval '1 month')::date;

  for r in
    select
      c.commercial_id,
      public.crm_bonus_offer_code(
        a.offre_code,
        a.famille_offre,
        concat_ws(' ', a.formule_code, c.formule_code, c.formule_nom)
      ) as offre_code,
      sum(coalesce(a.superficie_ha, 0))::numeric as hectares
    from public.acquisitions a
    join public.clients c on c.id = a.client_id
    where c.commercial_id is not null
      and a.created_at >= v_debut
      and a.created_at < v_fin
      and lower(coalesce(a.statut,'')) not in ('annule','annulee','refuse','rejetee','archive','supprime')
      and lower(coalesce(a.validation_statut,'')) = 'valide'
      and lower(coalesce(a.validation_statut,'')) = 'valide'
      and private.is_commercial_assignable(c.commercial_id)
    group by c.commercial_id, public.crm_bonus_offer_code(
      a.offre_code, a.famille_offre, concat_ws(' ', a.formule_code, c.formule_code, c.formule_nom)
    )
  loop
    if r.offre_code is null then continue; end if;

    select p.id into v_profile_id
    from public.profiles p
    where p.user_id = r.commercial_id and p.actif = true
    limit 1;

    if v_profile_id is null then continue; end if;

    select gr.montant into v_montant
    from public.grille_remuneration gr
    where gr.role_cible = 'commercial'
      and gr.type_remuneration = 'bonus_palier'
      and gr.offre_code = r.offre_code
      and gr.actif = true
      and gr.annee_application <= r.hectares
    order by gr.annee_application desc
    limit 1;

    if v_montant is null or v_montant <= 0 then
      delete from public.commissions
      where profile_id = v_profile_id
        and type_commission = 'bonus_palier'
        and periode = v_debut
        and offre_code = r.offre_code
        and statut = 'calculee';
    else
      insert into public.commissions
        (profile_id, plantation_id, type_commission, montant_base, taux_commission,
         montant_commission, periode, statut, valide_par, date_validation,
         date_calcul, paiement_id, client_id, taux_applique, annee_contrat, offre_code)
      values
        (v_profile_id, null, 'bonus_palier', r.hectares, 0, v_montant,
         v_debut, 'calculee', null, null, now(), null, null, 0, 1, r.offre_code)
      on conflict (profile_id, periode, offre_code)
        where type_commission = 'bonus_palier' and offre_code is not null
      do update set
        montant_base = excluded.montant_base,
        montant_commission = excluded.montant_commission,
        date_calcul = now()
      where public.commissions.statut not in ('validee','payee','annule');
    end if;
  end loop;

  delete from public.commissions cm
  where cm.type_commission = 'bonus_palier'
    and cm.periode = v_debut
    and cm.statut = 'calculee'
    and not exists (
      select 1
      from (
        select
          pr.id as profile_id,
          public.crm_bonus_offer_code(
            a.offre_code, a.famille_offre,
            concat_ws(' ', a.formule_code, c.formule_code, c.formule_nom)
          ) as offre_code,
          sum(coalesce(a.superficie_ha, 0))::numeric as hectares
        from public.profiles pr
        join public.clients c on c.commercial_id = pr.user_id
        join public.acquisitions a on a.client_id = c.id
        where a.created_at >= v_debut
          and a.created_at < v_fin
          and lower(coalesce(a.statut,'')) not in ('annule','annulee','refuse','rejetee','archive','supprime')
      and lower(coalesce(a.validation_statut,'')) = 'valide'
      and lower(coalesce(a.validation_statut,'')) = 'valide'
          and private.is_commercial_assignable(c.commercial_id)
        group by pr.id, public.crm_bonus_offer_code(
          a.offre_code, a.famille_offre,
          concat_ws(' ', a.formule_code, c.formule_code, c.formule_nom)
        )
      ) sales
      where sales.profile_id = cm.profile_id
        and sales.offre_code = cm.offre_code
        and exists (
          select 1 from public.grille_remuneration gr
          where gr.role_cible = 'commercial'
            and gr.type_remuneration = 'bonus_palier'
            and gr.offre_code = sales.offre_code
            and gr.actif = true
            and gr.annee_application <= sales.hectares
        )
    );

  perform public.recalculer_portefeuilles_commissions();
end;
$$;

select public.recalculer_bonus_commerciaux_mensuels(current_date);
