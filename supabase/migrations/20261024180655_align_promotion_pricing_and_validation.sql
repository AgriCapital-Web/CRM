-- Align the database pricing view with the canonical TypeScript promotion engine.
-- Rank promotions by their actual monetary reduction on each offer, not by percentage alone.
create or replace function public.offre_prix_effectif()
returns table(
  offre_id uuid,
  code text,
  nom text,
  montant_total_base numeric,
  pi_base numeric,
  mensualite_base numeric,
  montant_total_effectif numeric,
  pi_effectif numeric,
  mensualite_effective numeric,
  promotion_id uuid,
  promotion_nom text,
  promotion_cible text,
  reduction_pct numeric,
  reduction_montant numeric
)
language sql
stable
security definer
set search_path to 'public'
as $function$
with candidates as (
  select
    o.id as oid,
    p.id as pid,
    p.nom as pnom,
    case
      when lower(coalesce(p.cible,p.type_promotion,'paiement_initial')) in ('cout_global','coût_global','total_contrat','cg','special')
      then 'cout_global' else 'paiement_initial'
    end as cible,
    greatest(0,least(100,coalesce(p.pourcentage_reduction,0))) as pct,
    greatest(0,coalesce(p.montant_fixe_reduction,0)) as fixe,
    p.created_at,
    row_number() over (
      partition by o.id
      order by
        case
          when lower(coalesce(p.cible,p.type_promotion,'paiement_initial')) in ('cout_global','coût_global','total_contrat','cg','special')
          then least(greatest(coalesce(o.montant_total_par_ha,0),0),
                     greatest(coalesce(o.montant_total_par_ha,0),0)*greatest(0,least(100,coalesce(p.pourcentage_reduction,0)))/100.0+greatest(0,coalesce(p.montant_fixe_reduction,0)))
          else least(greatest(coalesce(o.montant_pi_par_ha,0),0),
                     greatest(coalesce(o.montant_pi_par_ha,0),0)*greatest(0,least(100,coalesce(p.pourcentage_reduction,0)))/100.0+greatest(0,coalesce(p.montant_fixe_reduction,0)))
        end desc,
        coalesce(p.pourcentage_reduction,0) desc,
        coalesce(p.montant_fixe_reduction,0) desc,
        p.created_at desc
    ) as rn
  from public.offres o
  join public.promotions p
    on p.active = true
   and (p.date_debut is null or p.date_debut <= now())
   and (p.date_fin is null or p.date_fin >= now())
   and (
     p.applique_toutes_offres = true
     or exists (
       select 1
       from jsonb_array_elements_text(coalesce(p.offre_ids,'[]'::jsonb)) x
       where x = o.id::text or x = o.code
     )
   )
  where o.actif = true
),
best as (select * from candidates where rn=1),
base as (
  select o.id,o.code,o.nom,
    greatest(coalesce(o.montant_total_par_ha,0),0) as total_base,
    greatest(coalesce(o.montant_pi_par_ha,0),0) as pi_base,
    greatest(coalesce(o.mensualite_par_ha,0),0) as monthly_base,
    greatest(coalesce(o.duree_paiement_mois,1),1) as duration
  from public.offres o where o.actif=true
),
calc as (
  select b.*,p.pid,p.pnom,p.cible,p.pct,p.fixe,
    case
      when p.pid is null then b.total_base
      when p.cible='cout_global' then greatest(b.total_base*(1-p.pct/100.0)-p.fixe,0)
      else greatest(b.total_base-(b.pi_base-greatest(b.pi_base*(1-p.pct/100.0)-p.fixe,0)),0)
    end as total_eff,
    case
      when p.pid is null then b.pi_base
      when p.cible='paiement_initial' then greatest(b.pi_base*(1-p.pct/100.0)-p.fixe,0)
      else least(b.pi_base,greatest(b.total_base*(1-p.pct/100.0)-p.fixe,0))
    end as pi_eff
  from base b left join best p on p.oid=b.id
),
ratio as (
  select c.*,
    case when greatest(total_base-pi_base,0)>0
      then greatest(total_eff-least(pi_eff,total_eff),0)/greatest(total_base-pi_base,0)
      else 1 end as r
  from calc c
),
monthly as (
  select r.*,
    coalesce((
      select case when r.pid is null or r.cible='paiement_initial'
        then coalesce((t->>'mensualite_par_ha')::numeric,0)
        else coalesce((t->>'mensualite_par_ha')::numeric,0)*r.r end
      from jsonb_array_elements((select o.tranches_paiement from public.offres o where o.id=r.id)) t
      where coalesce(t->>'type','') not in ('paiement_initial','apres_trouaison','paiement_apres_trouaison')
        and coalesce((t->>'mensualite_par_ha')::numeric,0)>0
      order by coalesce((t->>'mois_debut')::int,999999)
      limit 1
    ),r.monthly_base) as first_monthly
  from ratio r
)
select id,code,nom,total_base,pi_base,monthly_base,total_eff,least(pi_eff,total_eff),
  first_monthly,pid,pnom,cible,coalesce(pct,0),greatest(total_base-total_eff,0)
from monthly;
$function$;

-- Keep invalid reductions and inverted validity windows out of the canonical data.
alter table public.promotions
  drop constraint if exists promotions_percentage_range_check,
  drop constraint if exists promotions_fixed_reduction_nonnegative_check,
  drop constraint if exists promotions_validity_window_check,
  drop constraint if exists promotions_has_reduction_check;

alter table public.promotions
  add constraint promotions_percentage_range_check
    check (coalesce(pourcentage_reduction,0) between 0 and 100),
  add constraint promotions_fixed_reduction_nonnegative_check
    check (coalesce(montant_fixe_reduction,0) >= 0),
  add constraint promotions_validity_window_check
    check (date_fin >= date_debut),
  add constraint promotions_has_reduction_check
    check (coalesce(pourcentage_reduction,0) > 0 or coalesce(montant_fixe_reduction,0) > 0);

-- Normalize targeted offer codes to canonical offer UUIDs and reject stale/nonexistent targets.
create or replace function public.normalize_promotion_offer_targets()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_item text;
  v_id text;
  v_ids text[] := array[]::text[];
begin
  if coalesce(new.applique_toutes_offres,false) then
    new.offre_ids := '[]'::jsonb;
    return new;
  end if;

  if new.offre_ids is null or jsonb_typeof(new.offre_ids) <> 'array' or jsonb_array_length(new.offre_ids) = 0 then
    raise exception 'Une promotion ciblée doit contenir au moins une offre valide.';
  end if;

  for v_item in select distinct jsonb_array_elements_text(new.offre_ids)
  loop
    select o.id::text into v_id
    from public.offres o
    where o.id::text = v_item or o.code = v_item
    limit 1;

    if v_id is null then
      raise exception 'Offre cible inconnue pour la promotion: %', v_item;
    end if;
    if not (v_id = any(v_ids)) then
      v_ids := array_append(v_ids, v_id);
    end if;
    v_id := null;
  end loop;

  new.offre_ids := to_jsonb(v_ids);
  return new;
end
$function$;

drop trigger if exists normalize_promotion_offer_targets on public.promotions;
create trigger normalize_promotion_offer_targets
before insert or update of applique_toutes_offres, offre_ids
on public.promotions
for each row execute function public.normalize_promotion_offer_targets();
