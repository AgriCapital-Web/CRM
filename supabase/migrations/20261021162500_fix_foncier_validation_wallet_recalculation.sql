-- Client dossier validation must not recalculate every staff wallet.
-- The foncier commission trigger only affects the wallet of the client creator;
-- recomputing all portfolios here caused statement timeouts during validation.

create or replace function public.compute_commission_foncier_client()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_profile_id uuid;
  v_rate numeric;
  v_amount numeric;
begin
  if not coalesce(new.compte_actif, false) and new.documents_valides_at is null then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and coalesce(old.compte_actif, false)
     and old.documents_valides_at is not null then
    return new;
  end if;

  if new.created_by is null or coalesce(new.total_hectares, 0) <= 0 then
    return new;
  end if;

  select pr.id
    into v_profile_id
  from public.profiles pr
  join public.user_roles ur
    on ur.user_id = pr.user_id
   and ur.role = 'mobilisateur_foncier'
  where pr.user_id = new.created_by
    and pr.actif = true
  limit 1;

  if v_profile_id is null then
    return new;
  end if;

  select gr.montant
    into v_rate
  from public.grille_remuneration gr
  where gr.code_regle = 'MOBILISATEUR_FONCIER_PAR_HA'
    and gr.actif
  order by gr.updated_at desc
  limit 1;

  if coalesce(v_rate, 0) <= 0 then
    return new;
  end if;

  v_amount := round(coalesce(new.total_hectares, 0) * v_rate, 2);

  if not exists (
    select 1
    from public.commissions c
    where c.profile_id = v_profile_id
      and c.client_id = new.id
      and c.type_commission = 'mobilisation_fonciere'
  ) then
    insert into public.commissions (
      profile_id, client_id, type_commission, montant_base, taux_commission,
      montant_commission, periode, date_calcul, statut
    ) values (
      v_profile_id, new.id, 'mobilisation_fonciere', new.total_hectares,
      0, v_amount, current_date, now(), 'calculee'
    );

    -- Recompute only the affected creator's wallet, not every wallet in CRM.
    insert into public.portefeuilles (user_id, created_at, updated_at)
    values (new.created_by, now(), now())
    on conflict (user_id) do nothing;

    update public.portefeuilles pf
    set total_gagne = coalesce((
          select sum(c.montant_commission)
          from public.commissions c
          join public.profiles pr on pr.id = c.profile_id
          where pr.user_id = new.created_by
            and c.statut in ('calculee', 'validee', 'payee')
        ), 0),
        solde_commissions = coalesce((
          select sum(c.montant_commission)
          from public.commissions c
          join public.profiles pr on pr.id = c.profile_id
          where pr.user_id = new.created_by
            and c.statut in ('calculee', 'validee')
        ), 0),
        total_verse = coalesce((
          select sum(v.montant_paye)
          from public.portefeuille_versements v
          where v.profile_id = new.created_by
            and v.statut = 'paye'
        ), 0),
        total_retire = coalesce((
          select sum(v.montant_paye)
          from public.portefeuille_versements v
          where v.profile_id = new.created_by
            and v.statut = 'paye'
        ), 0),
        updated_at = now()
    where pf.user_id = new.created_by;
  end if;

  return new;
end;
$function$;
