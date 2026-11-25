
-- 1) Séparer strictement les comptes internes CRM des comptes clients du portail.
create or replace view public.v_internal_users as
select
  p.id, p.user_id, p.nom_complet, p.email, p.telephone, p.photo_url, p.username,
  p.equipe_id, p.actif, p.created_at, p.updated_at, p.telephone_secondaire,
  p.adresse_mail_secondaire, p.ville, p.quartier, p.type_piece_identite,
  p.numero_piece_identite, p.piece_identite_url, p.contact_urgence_nom,
  p.contact_urgence_prenom, p.contact_urgence_telephone1, p.contact_urgence_telephone2,
  p.contact_urgence_photo_url, p.whatsapp, p.departement, p.poste, p.relation_rh,
  p.taux_commission, p.district_id, p.region_id, p.telephone_indicatif,
  p.telephone_local, p.whatsapp_indicatif, p.whatsapp_local,
  p.telephone_secondaire_indicatif, p.telephone_secondaire_local,
  p.contact_urgence_telephone1_indicatif, p.contact_urgence_telephone1_local,
  p.contact_urgence_telephone2_indicatif, p.contact_urgence_telephone2_local,
  p.piece_identite_recto_url, p.piece_identite_verso_url,
  p.piece_identite_page_principale_url, p.contact_urgence_email,
  p.salaire_base, p.password_change_required, p.type_compte,
  p.telephone_principal_whatsapp, p.telephone_secondaire_whatsapp, p.nom, p.prenoms
from public.profiles p
where p.type_compte = 'interne';

create or replace function public.enforce_internal_profile_for_user_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type_compte text;
begin
  select p.type_compte into v_type_compte
  from public.profiles p
  where p.user_id = new.user_id
  limit 1;

  if v_type_compte is distinct from 'interne' then
    raise exception 'Un rôle CRM ne peut être attribué qu’à un compte interne créé et validé.';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_internal_profile_for_user_role() from public, anon, authenticated;
drop trigger if exists trg_require_internal_profile_for_user_role on public.user_roles;
create trigger trg_require_internal_profile_for_user_role
before insert or update of user_id, role on public.user_roles
for each row execute function public.enforce_internal_profile_for_user_role();

create or replace function public.prevent_profile_demotion_with_staff_roles()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.type_compte is distinct from old.type_compte
     and new.type_compte is distinct from 'interne'
     and exists (select 1 from public.user_roles ur where ur.user_id = new.user_id) then
    raise exception 'Retirez les rôles internes avant de convertir ce profil en compte client.';
  end if;
  return new;
end;
$$;

revoke all on function public.prevent_profile_demotion_with_staff_roles() from public, anon, authenticated;
drop trigger if exists trg_prevent_profile_demotion_with_staff_roles on public.profiles;
create trigger trg_prevent_profile_demotion_with_staff_roles
before update of type_compte on public.profiles
for each row execute function public.prevent_profile_demotion_with_staff_roles();

-- Nettoyage limité aux liens de rôles éventuellement attribués à des profils non internes.
-- Les profils clients et leurs accès au portail ne sont ni supprimés ni modifiés.
delete from public.user_roles ur
using public.profiles p
where p.user_id = ur.user_id
  and p.type_compte is distinct from 'interne';

-- 2) Nomenclature commerciale et technique : les codes techniques historiques restent stables.
update public.app_roles set nom = 'Responsable Commercial National', court = 'RCN',
  description = 'Pilotage de l’activité commerciale à l’échelle nationale',
  updated_at = now()
where code = 'manager_commercial_national';

update public.app_roles set nom = 'Responsable Commercial de Zone', court = 'RCZ',
  description = 'Pilotage de l’activité commerciale à l’échelle de sa zone',
  libelle_couverture = 'Zone',
  updated_at = now()
where code = 'responsable_commercial';

update public.app_roles set nom = 'Responsable Technique National', court = 'RTN',
  description = 'Pilotage de l’activité technique à l’échelle nationale',
  updated_at = now()
where code = 'manager_technique_national';

update public.app_roles set nom = 'Chef d’équipe commercial', court = 'CEC', updated_at = now()
where code = 'chef_equipe_commercial';

update public.app_roles set nom = 'Chef d’équipe technique', court = 'CET', updated_at = now()
where code = 'chef_equipe_technique';

insert into public.app_roles
  (code, nom, court, description, niveau, niveau_label, actif, niveau_couverture, libelle_couverture)
values
  ('responsable_technique_zone', 'Responsable Technique de Zone', 'RTZ',
   'Pilotage des équipes et opérations techniques à l’échelle d’une région',
   3, 'Management', true, 'region', 'Zone')
on conflict (code) do update set
  nom = excluded.nom,
  court = excluded.court,
  description = excluded.description,
  niveau = excluded.niveau,
  niveau_label = excluded.niveau_label,
  actif = true,
  niveau_couverture = excluded.niveau_couverture,
  libelle_couverture = excluded.libelle_couverture,
  updated_at = now();

-- Le responsable de district voit et pilote les volets commercial, technique et foncier
-- dans son district. Les autorisations restent limitées par les fonctions géographiques.
insert into public.role_permissions (role_code, permission_code)
select 'responsable_district', ap.code
from public.app_permissions ap
where ap.code = any(array[
  'clients.update',
  'leads.assign',
  'documents.view',
  'offres.view',
  'plantations.update',
  'proprietaires.view',
  'proprietaires.update',
  'rapports.manage_technique',
  'rapports.view_technique',
  'rapports.view_financier'
])
and not exists (
  select 1 from public.role_permissions rp
  where rp.role_code = 'responsable_district' and rp.permission_code = ap.code
);

insert into public.role_permissions (role_code, permission_code)
select 'responsable_technique_zone', ap.code
from public.app_permissions ap
where ap.code = any(array[
  'clients.view',
  'dashboard.view',
  'documents.upload',
  'documents.view',
  'messagerie.view',
  'parcelles.create',
  'parcelles.update',
  'parcelles.view',
  'plantations.create',
  'plantations.update',
  'plantations.view',
  'proprietaires.view',
  'rapports.manage_technique',
  'rapports.view_technique',
  'tickets.create',
  'tickets.update',
  'tickets.view'
])
and not exists (
  select 1 from public.role_permissions rp
  where rp.role_code = 'responsable_technique_zone' and rp.permission_code = ap.code
);

-- Autoriser le responsable de district à affecter des clients et leads à des commerciaux
-- de son propre district, sans ouvrir les autres districts.
create or replace function private.can_assign_commercial_to(_actor uuid, _target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select
    _target is not null
    and private.is_commercial_assignable(_target)
    and (
      private.is_global_admin(_actor)
      or private.has_role(_actor,'responsable_operations')
      or private.has_role(_actor,'service_client')
      or private.has_role(_actor,'chef_equipe_service_client')
      or _actor = _target
      or (
        private.has_role(_actor,'responsable_district')
        and exists (
          select 1 from public.profiles a
          join public.profiles t on t.user_id = _target
          where a.user_id = _actor
            and a.district_id is not null
            and a.district_id = t.district_id
        )
      )
      or (
        private.has_role(_actor,'responsable_commercial')
        and (
          exists (
            select 1 from public.profiles a
            join public.profiles t on t.user_id = _target
            where a.user_id = _actor
              and (
                (a.region_id is not null and t.region_id = a.region_id)
                or (a.equipe_id is not null and t.equipe_id = a.equipe_id)
              )
          )
          or exists (
            select 1 from public.zone_assignments z
            join public.profiles t on t.user_id = _target
            where z.user_id = _actor
              and z.zone_type = 'region'
              and z.zone_id = t.region_id
          )
        )
      )
      or (
        private.has_role(_actor,'chef_equipe_commercial')
        and (
          exists (
            select 1 from public.profiles a
            join public.profiles t on t.user_id = _target
            where a.user_id = _actor
              and (
                (a.equipe_id is not null and t.equipe_id = a.equipe_id)
                or (a.district_id is not null and t.district_id = a.district_id)
                or (a.region_id is not null and t.region_id = a.region_id)
              )
          )
          or exists (
            select 1 from public.zone_assignments z
            join public.profiles t on t.user_id = _target
            where z.user_id = _actor
              and z.zone_type in ('departement','region','district')
              and (
                (z.zone_type = 'region' and z.zone_id = t.region_id)
                or (z.zone_type = 'district' and z.zone_id = t.district_id)
              )
          )
        )
      )
    );
$function$;

create or replace function private.can_supervise_leads(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = _user_id
      and ur.role in (
        'responsable_operations',
        'responsable_commercial',
        'responsable_district',
        'chef_equipe_commercial',
        'manager_commercial_national',
        'service_client',
        'chef_equipe_service_client',
        'pdg'
      )
  );
$function$;

-- Le RCZ reste limité à sa région. Le RTZ voit les équipes techniques de sa région.
-- Le RD voit toutes les équipes de son district, quel que soit leur département.
create or replace function private.can_view_team_performance(_user_id uuid, _team_id uuid, _team_type text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  p record;
begin
  if _user_id is null then return false; end if;
  if private.is_global_admin(_user_id) or private.has_role(_user_id,'responsable_operations') then return true; end if;

  select * into p from public.profiles where user_id = _user_id limit 1;

  if private.has_role(_user_id,'responsable_district') and exists (
    select 1 from public.equipes e
    where e.id = _team_id and p.district_id is not null and e.district_id = p.district_id
  ) then return true; end if;

  if private.has_role(_user_id,'responsable_technique_zone')
     and lower(coalesce(_team_type,'')) = 'technique'
     and exists (
       select 1 from public.equipes e
       where e.id = _team_id and p.region_id is not null and e.region_id = p.region_id
     ) then return true; end if;

  if private.has_role(_user_id,'responsable_commercial')
     and lower(coalesce(_team_type,'')) = 'commercial'
     and exists (
       select 1 from public.equipes e
       where e.id = _team_id and p.region_id is not null and e.region_id = p.region_id
     ) then return true; end if;

  if (
    (private.has_role(_user_id,'chef_equipe_commercial') and lower(coalesce(_team_type,'')) = 'commercial')
    or (private.has_role(_user_id,'chef_equipe_technique') and lower(coalesce(_team_type,'')) = 'technique')
  ) and (
    p.equipe_id = _team_id
    or exists (
      select 1 from public.equipe_membres em
      join public.profiles viewer on viewer.id = em.profile_id
      where viewer.user_id = _user_id and em.equipe_id = _team_id
    )
  ) then return true; end if;

  return false;
end;
$function$;

create or replace function private.can_view_commission_team(_user_id uuid, _team_id uuid, _type text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select private.crm_user_has_role_permission(_user_id, 'commissions.view')
    and exists (
      select 1 from public.equipes t
      where t.id = _team_id and (
        private.crm_is_global_admin(_user_id)
        or private.crm_user_has_global_scope(_user_id)
        or (
          exists (select 1 from public.user_roles ur where ur.user_id = _user_id and ur.role = 'responsable_operations')
          and (
            exists (select 1 from public.profiles v where v.user_id = _user_id and v.region_id is not null and v.region_id = t.region_id)
            or exists (select 1 from public.zone_assignments z where z.user_id = _user_id and z.zone_type = 'region' and z.zone_id = t.region_id)
          )
        )
        or (
          exists (select 1 from public.user_roles ur where ur.user_id = _user_id and ur.role = 'responsable_district')
          and exists (select 1 from public.profiles v where v.user_id = _user_id and v.district_id is not null and v.district_id = t.district_id)
        )
        or (
          lower(coalesce(t.type_equipe,'')) like '%commercial%'
          and _type <> 'technique'
          and exists (
            select 1 from public.user_roles ur
            join public.profiles v on v.user_id = ur.user_id
            where ur.user_id = _user_id and ur.role = 'responsable_commercial'
              and v.region_id is not null and v.region_id = t.region_id
          )
        )
        or exists (
          select 1 from public.profiles v
          where v.user_id = _user_id
            and (
              (lower(coalesce(t.type_equipe,'')) like '%technique%'
                and exists (select 1 from public.user_roles ur where ur.user_id = _user_id and ur.role = 'chef_equipe_technique')
                and _type = 'technique')
              or (lower(coalesce(t.type_equipe,'')) like '%commercial%'
                and exists (select 1 from public.user_roles ur where ur.user_id = _user_id and ur.role = 'chef_equipe_commercial')
                and _type <> 'technique')
            )
            and (v.equipe_id = t.id or exists (select 1 from public.equipe_membres em where em.profile_id = v.id and em.equipe_id = t.id))
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
  select private.crm_user_has_role_permission(_user_id, 'commissions.view')
    and (
      private.crm_is_global_admin(_user_id)
      or private.crm_user_has_global_scope(_user_id)
      or (
        exists (select 1 from public.user_roles ur where ur.user_id = _user_id and ur.role = 'responsable_operations')
        and (
          exists (select 1 from public.profiles v join public.profiles t on t.id = _profile_id
                  where v.user_id = _user_id and v.region_id is not null and v.region_id = t.region_id)
          or exists (select 1 from public.zone_assignments z join public.profiles t on t.id = _profile_id
                     where z.user_id = _user_id and z.zone_type = 'region' and z.zone_id = t.region_id)
        )
      )
      or (
        exists (select 1 from public.user_roles ur where ur.user_id = _user_id and ur.role = 'responsable_district')
        and exists (select 1 from public.profiles v join public.profiles t on t.id = _profile_id
                    where v.user_id = _user_id and v.district_id is not null and v.district_id = t.district_id)
      )
      or exists (select 1 from public.profiles v join public.profiles t on t.id = _profile_id
                 where v.user_id = _user_id and v.id = t.id)
      or (
        _type <> 'technique'
        and exists (select 1 from public.user_roles ur where ur.user_id = _user_id and ur.role = 'responsable_commercial')
        and exists (select 1 from public.user_roles ur
                    where ur.user_id = (select p.user_id from public.profiles p where p.id = _profile_id)
                      and ur.role in ('commercial','chef_equipe_commercial','responsable_commercial'))
        and exists (select 1 from public.profiles v join public.profiles t on t.id = _profile_id
                    where v.user_id = _user_id and v.region_id is not null and v.region_id = t.region_id)
      )
      or (
        exists (select 1 from public.user_roles ur where ur.user_id = _user_id and ur.role = 'superviseur_mobilisation_fonciere')
        and exists (select 1 from public.profiles v join public.profiles t on t.id = _profile_id
                    where v.user_id = _user_id and v.region_id is not null and v.region_id = t.region_id)
        and exists (select 1 from public.user_roles ur
                    where ur.user_id = (select p.user_id from public.profiles p where p.id = _profile_id)
                      and ur.role = 'mobilisateur_foncier')
      )
      or (
        (
          (_type = 'technique' and exists (select 1 from public.user_roles ur where ur.user_id = _user_id and ur.role = 'chef_equipe_technique')
            and exists (select 1 from public.user_roles ur where ur.user_id = (select p.user_id from public.profiles p where p.id = _profile_id) and ur.role = 'technicien'))
          or (_type <> 'technique' and exists (select 1 from public.user_roles ur where ur.user_id = _user_id and ur.role = 'chef_equipe_commercial')
            and exists (select 1 from public.user_roles ur where ur.user_id = (select p.user_id from public.profiles p where p.id = _profile_id) and ur.role in ('commercial','chef_equipe_commercial')))
        )
        and exists (
          select 1 from public.equipes t
          where ((_type = 'technique' and lower(coalesce(t.type_equipe,'')) like '%technique')
             or (_type <> 'technique' and lower(coalesce(t.type_equipe,'')) like '%commercial%'))
            and private.can_view_commission_team(_user_id, t.id, _type)
            and (t.id = (select target.equipe_id from public.profiles target where target.id = _profile_id)
              or exists (select 1 from public.equipe_membres em where em.profile_id = _profile_id and em.equipe_id = t.id))
        )
      )
    );
$function$;

-- 3) Règles de primes mensuelles configurables séparément pour chaque offre.
alter table public.grille_remuneration add column if not exists offre_code text;
alter table public.commissions add column if not exists offre_code text;

with offers(offre_code, label) as (
  values
    ('PALMINVEST', 'PalmInvest'),
    ('TERRAPALM', 'TerraPalm'),
    ('PALMTERROIR_ESSENTIELLE', 'PalmTerroir — Essentielle'),
    ('PALMTERROIR_FLEXIBLE', 'PalmTerroir — Flexible')
),
tiers(palier, hectares, montant) as (
  values (1, 10, 15000::numeric), (2, 15, 25000::numeric), (3, 20, 35000::numeric), (4, 25, 50000::numeric)
)
insert into public.grille_remuneration
  (role_cible, type_remuneration, montant, taux_pourcentage, annee_application,
   description, actif, code_regle, offre_code, created_at, updated_at)
select
  'commercial', 'bonus_palier', t.montant, 0, t.hectares,
  o.label || ' — bonus mensuel à partir de ' || t.hectares || ' ha',
  true,
  'COMMERCIAL_BONUS_' || o.offre_code || '_PALIER_' || t.palier,
  o.offre_code, now(), now()
from offers o cross join tiers t
on conflict (code_regle) where code_regle is not null
do update set
  role_cible = excluded.role_cible,
  type_remuneration = excluded.type_remuneration,
  montant = excluded.montant,
  taux_pourcentage = excluded.taux_pourcentage,
  annee_application = excluded.annee_application,
  description = excluded.description,
  actif = true,
  offre_code = excluded.offre_code,
  updated_at = now();

update public.grille_remuneration
set actif = false, updated_at = now()
where role_cible = 'commercial'
  and type_remuneration = 'bonus_palier'
  and code_regle is null
  and offre_code is null;

create unique index if not exists commissions_bonus_profile_month_offer_uidx
  on public.commissions (profile_id, periode, offre_code)
  where type_commission = 'bonus_palier' and offre_code is not null;

create or replace function public.crm_bonus_offer_code(p_offre text, p_famille text, p_formule text)
returns text
language sql
immutable
set search_path = public
as $function$
  select case
    when lower(coalesce(p_offre,'')) = 'palm-invest' or upper(coalesce(p_famille,'')) = 'PALMINVEST' then 'PALMINVEST'
    when lower(coalesce(p_offre,'')) = 'terra-palm' or upper(coalesce(p_famille,'')) = 'TERRAPALM' then 'TERRAPALM'
    when upper(coalesce(p_famille,'')) = 'PALMTERROIR'
      and upper(coalesce(p_formule,'')) like '%FLEXIBLE%' then 'PALMTERROIR_FLEXIBLE'
    when upper(coalesce(p_famille,'')) = 'PALMTERROIR'
      and upper(coalesce(p_formule,'')) like '%ESSENTIEL%' then 'PALMTERROIR_ESSENTIELLE'
    else null
  end;
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

revoke all on function public.recalculer_bonus_commerciaux_mensuels(date) from public, anon, authenticated;
grant execute on function public.recalculer_bonus_commerciaux_mensuels(date) to service_role;

create or replace function public.trg_recalculer_bonus_for_acquisition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.recalculer_bonus_commerciaux_mensuels(old.created_at::date);
    return old;
  end if;

  if tg_op = 'UPDATE' and old.created_at is not null
     and date_trunc('month', old.created_at) is distinct from date_trunc('month', new.created_at) then
    perform public.recalculer_bonus_commerciaux_mensuels(old.created_at::date);
  end if;

  perform public.recalculer_bonus_commerciaux_mensuels(new.created_at::date);
  return new;
end;
$$;

revoke all on function public.trg_recalculer_bonus_for_acquisition() from public, anon, authenticated;
drop trigger if exists trg_recalculer_bonus_for_acquisition on public.acquisitions;
create trigger trg_recalculer_bonus_for_acquisition
after insert or update or delete on public.acquisitions
for each row execute function public.trg_recalculer_bonus_for_acquisition();

create or replace function public.trg_recalculer_bonus_after_grid_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.type_remuneration = 'bonus_palier' and new.offre_code is not null then
    perform public.recalculer_bonus_commerciaux_mensuels(current_date);
  end if;
  return new;
end;
$$;

revoke all on function public.trg_recalculer_bonus_after_grid_change() from public, anon, authenticated;
drop trigger if exists trg_recalculer_bonus_after_grid_change on public.grille_remuneration;
create trigger trg_recalculer_bonus_after_grid_change
after insert or update of montant, annee_application, actif, offre_code on public.grille_remuneration
for each row execute function public.trg_recalculer_bonus_after_grid_change();

-- Lorsqu'un commercial est affecté après l'encaissement, générer les commissions manquantes
-- de tous ses paiements validés et recalculer ses bonus du mois de vente.
create or replace function public.trg_backfill_commissions_after_client_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment record;
  v_month date;
begin
  if new.commercial_id is null or new.commercial_id is not distinct from old.commercial_id then
    return new;
  end if;

  for v_payment in
    select p.id
    from public.paiements p
    where p.client_id = new.id and lower(coalesce(p.statut,'')) = 'valide'
    order by p.date_paiement nulls first, p.created_at
  loop
    perform public.compute_commission_for_paiement(v_payment.id);
  end loop;

  for v_month in
    select distinct date_trunc('month', a.created_at)::date
    from public.acquisitions a
    where a.client_id = new.id and a.created_at is not null
  loop
    perform public.recalculer_bonus_commerciaux_mensuels(v_month);
  end loop;

  return new;
end;
$$;

revoke all on function public.trg_backfill_commissions_after_client_assignment() from public, anon, authenticated;
drop trigger if exists trg_backfill_commissions_after_client_assignment on public.clients;
create trigger trg_backfill_commissions_after_client_assignment
after update of commercial_id on public.clients
for each row execute function public.trg_backfill_commissions_after_client_assignment();

-- Une conversion de lead conserve automatiquement le commercial déjà affecté au lead.
create or replace function public.trg_sync_client_commercial_from_converted_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seller uuid;
  v_previous_setting text;
begin
  if new.client_id is null or new.statut <> 'converti' or new.assigned_to is null then
    return new;
  end if;

  select (array_agg(distinct l.assigned_to))[1]
    into v_seller
  from public.leads l
  where l.client_id = new.client_id
    and l.statut = 'converti'
    and l.assigned_to is not null
  having count(distinct l.assigned_to) = 1;

  if v_seller is null or not private.is_commercial_assignable(v_seller) then
    return new;
  end if;

  v_previous_setting := current_setting('app.internal_account_link', true);
  perform set_config('app.internal_account_link', 'true', true);

  update public.clients c
  set commercial_id = v_seller
  where c.id = new.client_id
    and c.commercial_id is null
    and coalesce(c.validation_statut,'') <> 'modification_demandee';

  perform set_config('app.internal_account_link', coalesce(v_previous_setting, 'false'), true);
  return new;
exception when others then
  perform set_config('app.internal_account_link', coalesce(v_previous_setting, 'false'), true);
  raise;
end;
$$;

revoke all on function public.trg_sync_client_commercial_from_converted_lead() from public, anon, authenticated;
drop trigger if exists trg_sync_client_commercial_from_converted_lead on public.leads;
create trigger trg_sync_client_commercial_from_converted_lead
after insert or update of client_id, assigned_to, statut on public.leads
for each row execute function public.trg_sync_client_commercial_from_converted_lead();

-- Backfill idempotent : seules les conversions non ambiguës et les commerciaux actifs sont reprises.
set local app.internal_account_link = 'true';

with unique_assignments as (
  select
    l.client_id,
    (array_agg(distinct l.assigned_to))[1] as commercial_id
  from public.leads l
  where l.client_id is not null
    and l.statut = 'converti'
    and l.assigned_to is not null
  group by l.client_id
  having count(distinct l.assigned_to) = 1
)
update public.clients c
set commercial_id = ua.commercial_id
from unique_assignments ua
where c.id = ua.client_id
  and c.commercial_id is null
  and coalesce(c.validation_statut,'') <> 'modification_demandee'
  and private.is_commercial_assignable(ua.commercial_id);

set local app.internal_account_link = 'false';

-- Rejouer le calcul existant sur les paiements valides : la fonction évite les doublons
-- et ne modifie pas les commissions historiques déjà enregistrées.
do $$
declare
  v_payment record;
begin
  for v_payment in
    select p.id
    from public.paiements p
    join public.clients c on c.id = p.client_id
    where lower(coalesce(p.statut,'')) = 'valide'
      and c.commercial_id is not null
    order by p.date_paiement nulls first, p.created_at
  loop
    perform public.compute_commission_for_paiement(v_payment.id);
  end loop;
end;
$$;

-- 4) Portée transversale du responsable de district et portée régionale du RTZ/RCZ.
create or replace function private.can_view_commission_team(_user_id uuid, _team_id uuid, _type text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select private.crm_user_has_role_permission(_user_id, 'commissions.view')
    and exists (
      select 1 from public.equipes t
      where t.id = _team_id and (
        private.crm_is_global_admin(_user_id)
        or private.crm_user_has_global_scope(_user_id)
        or (
          exists (select 1 from public.user_roles ur where ur.user_id = _user_id and ur.role = 'responsable_operations')
          and (
            exists (select 1 from public.profiles v where v.user_id = _user_id and v.region_id is not null and v.region_id = t.region_id)
            or exists (select 1 from public.zone_assignments z where z.user_id = _user_id and z.zone_type = 'region' and z.zone_id = t.region_id)
          )
        )
        or (
          exists (select 1 from public.user_roles ur where ur.user_id = _user_id and ur.role = 'responsable_district')
          and exists (select 1 from public.profiles v where v.user_id = _user_id and v.district_id is not null and v.district_id = t.district_id)
        )
        or (
          lower(coalesce(t.type_equipe,'')) like '%commercial%'
          and _type <> 'technique'
          and exists (
            select 1 from public.user_roles ur
            join public.profiles v on v.user_id = ur.user_id
            where ur.user_id = _user_id and ur.role = 'responsable_commercial'
              and v.region_id is not null and v.region_id = t.region_id
          )
        )
        or exists (
          select 1 from public.profiles v
          where v.user_id = _user_id
            and (
              (lower(coalesce(t.type_equipe,'')) like '%technique%'
                and exists (select 1 from public.user_roles ur where ur.user_id = _user_id and ur.role = 'chef_equipe_technique')
                and _type = 'technique')
              or (lower(coalesce(t.type_equipe,'')) like '%commercial%'
                and exists (select 1 from public.user_roles ur where ur.user_id = _user_id and ur.role = 'chef_equipe_commercial')
                and _type <> 'technique')
            )
            and (v.equipe_id = t.id or exists (select 1 from public.equipe_membres em where em.profile_id = v.id and em.equipe_id = t.id))
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
  select private.crm_user_has_role_permission(_user_id, 'commissions.view')
    and (
      private.crm_is_global_admin(_user_id)
      or private.crm_user_has_global_scope(_user_id)
      or (
        exists (select 1 from public.user_roles ur where ur.user_id = _user_id and ur.role = 'responsable_operations')
        and (
          exists (select 1 from public.profiles v join public.profiles t on t.id = _profile_id
                  where v.user_id = _user_id and v.region_id is not null and v.region_id = t.region_id)
          or exists (select 1 from public.zone_assignments z join public.profiles t on t.id = _profile_id
                     where z.user_id = _user_id and z.zone_type = 'region' and z.zone_id = t.region_id)
        )
      )
      or (
        exists (select 1 from public.user_roles ur where ur.user_id = _user_id and ur.role = 'responsable_district')
        and exists (select 1 from public.profiles v join public.profiles t on t.id = _profile_id
                    where v.user_id = _user_id and v.district_id is not null and v.district_id = t.district_id)
      )
      or exists (select 1 from public.profiles v join public.profiles t on t.id = _profile_id
                 where v.user_id = _user_id and v.id = t.id)
      or (
        _type <> 'technique'
        and exists (select 1 from public.user_roles ur where ur.user_id = _user_id and ur.role = 'responsable_commercial')
        and exists (select 1 from public.user_roles ur
                    where ur.user_id = (select p.user_id from public.profiles p where p.id = _profile_id)
                      and ur.role in ('commercial','chef_equipe_commercial','responsable_commercial'))
        and exists (select 1 from public.profiles v join public.profiles t on t.id = _profile_id
                    where v.user_id = _user_id and v.region_id is not null and v.region_id = t.region_id)
      )
      or (
        exists (select 1 from public.user_roles ur where ur.user_id = _user_id and ur.role = 'superviseur_mobilisation_fonciere')
        and exists (select 1 from public.profiles v join public.profiles t on t.id = _profile_id
                    where v.user_id = _user_id and v.region_id is not null and v.region_id = t.region_id)
        and exists (select 1 from public.user_roles ur
                    where ur.user_id = (select p.user_id from public.profiles p where p.id = _profile_id)
                      and ur.role = 'mobilisateur_foncier')
      )
      or (
        (
          (_type = 'technique' and exists (select 1 from public.user_roles ur where ur.user_id = _user_id and ur.role = 'chef_equipe_technique')
            and exists (select 1 from public.user_roles ur where ur.user_id = (select p.user_id from public.profiles p where p.id = _profile_id) and ur.role = 'technicien'))
          or (_type <> 'technique' and exists (select 1 from public.user_roles ur where ur.user_id = _user_id and ur.role = 'chef_equipe_commercial')
            and exists (select 1 from public.user_roles ur where ur.user_id = (select p.user_id from public.profiles p where p.id = _profile_id) and ur.role in ('commercial','chef_equipe_commercial')))
        )
        and exists (
          select 1 from public.equipes t
          where ((_type = 'technique' and lower(coalesce(t.type_equipe,'')) like '%technique')
             or (_type <> 'technique' and lower(coalesce(t.type_equipe,'')) like '%commercial%'))
            and private.can_view_commission_team(_user_id, t.id, _type)
            and (t.id = (select target.equipe_id from public.profiles target where target.id = _profile_id)
              or exists (select 1 from public.equipe_membres em where em.profile_id = _profile_id and em.equipe_id = t.id))
        )
      )
    );
$function$;


-- Le catalogue de rôles doit aussi exposer les nouveaux postes dans les formulaires
-- internes et les référentiels utilisés par l'organigramme.
drop policy if exists app_roles_public_signup_select on public.app_roles;
create policy app_roles_public_signup_select
on public.app_roles
for select
to anon, authenticated
using (
  actif is true
  and code = any(array[
    'commercial','technicien','mobilisateur_foncier',
    'superviseur_mobilisation_fonciere','chef_equipe_commercial',
    'chef_equipe_technique','responsable_commercial',
    'responsable_technique_zone','manager_commercial_national',
    'manager_technique_national','responsable_operations',
    'responsable_district','comptable','service_client'
  ])
);

-- Le responsable de district conserve un périmètre transversal : toute équipe
-- (commerciale, technique, foncière ou support) de son district.
-- Les responsables de zone restent limités à leur filière.
create or replace function public.get_team_directory_for_current_user()
returns table(
  id uuid, nom text, responsable_id uuid, region_id uuid, district_id uuid,
  type_equipe text, actif boolean, zone_couverture text, photo_url text,
  created_at timestamptz, region_nom text
)
language plpgsql
stable
security definer
set search_path = ''
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
  left join public.regions r on r.id = e.region_id
  where private.crm_user_can_access_geo(
          auth.uid(), e.region_id, coalesce(e.district_id, r.district_id), null, null
        )
    and (
      private.crm_is_global_admin(auth.uid())
      or private.crm_user_has_global_scope(auth.uid())
      or exists (select 1 from public.user_roles ur where ur.user_id=auth.uid() and ur.role='responsable_district')
      or (
        exists (select 1 from public.user_roles ur where ur.user_id=auth.uid() and ur.role='responsable_technique_zone')
        and lower(coalesce(e.type_equipe,'')) like '%technique%'
      )
      or (
        exists (select 1 from public.user_roles ur where ur.user_id=auth.uid() and ur.role='responsable_commercial')
        and lower(coalesce(e.type_equipe,'')) like '%commercial%'
      )
      or (
        not exists (select 1 from public.user_roles ur where ur.user_id=auth.uid()
                    and ur.role in ('responsable_district','responsable_technique_zone','responsable_commercial'))
      )
    )
  order by e.created_at desc;
end;
$function$;

revoke all on function public.get_team_directory_for_current_user() from public, anon;
grant execute on function public.get_team_directory_for_current_user() to authenticated, service_role;

-- Les fonctions de résolution d'audience sont des fonctions internes au dispatcher.
-- Les utilisateurs publics ne doivent jamais pouvoir les appeler directement.

-- Recalculer les bonus du mois courant après la mise à jour du référentiel.
select public.recalculer_bonus_commerciaux_mensuels(current_date);
