-- Transactions atomiques pour la génération, la validation et le paiement des commissions.
alter table public.portefeuille_versements
  add column if not exists preuve_paiement_url text;

create unique index if not exists finance_commission_payout_transaction_source_unique
on public.finance_transactions(source_type, source_id)
where source_type = 'commission_payout' and source_id is not null;

create or replace function public.finance_generate_commission_payouts(p_period_start date, p_period_end date)
returns integer language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_group record;
  v_versement_id uuid;
  v_count integer := 0;
  v_line_count integer;
begin
  if not public.workspace_can_manage_finance() then raise exception 'Vous n’êtes pas autorisé à générer les versements de commissions.'; end if;
  if p_period_start is null or p_period_end is null or p_period_end < p_period_start then raise exception 'Période de versement invalide.'; end if;
  if exists (
    select 1 from public.portefeuille_versements
    where periode_debut = p_period_start and periode_fin = p_period_end and statut <> 'brouillon'
  ) then
    raise exception 'Cette période contient déjà un versement validé ou payé. Elle ne peut pas être régénérée.';
  end if;

  delete from public.portefeuille_versement_lignes
  where versement_id in (
    select id from public.portefeuille_versements
    where periode_debut = p_period_start and periode_fin = p_period_end and statut = 'brouillon'
  );
  delete from public.portefeuille_versements
  where periode_debut = p_period_start and periode_fin = p_period_end and statut = 'brouillon';

  for v_group in
    select c.profile_id, sum(coalesce(c.montant_commission,0)) as montant
    from public.commissions c
    where c.profile_id is not null
      and c.periode between p_period_start and p_period_end
      and c.statut in ('calculee','validee')
      and not exists (
        select 1 from public.portefeuille_versement_lignes l
        where l.commission_id = c.id
      )
    group by c.profile_id
    having sum(coalesce(c.montant_commission,0)) > 0
  loop
    insert into public.portefeuille_versements(
      profile_id,periode_debut,periode_fin,montant_brut,montant_paye,statut,created_by,updated_at
    ) values (
      v_group.profile_id,p_period_start,p_period_end,v_group.montant,0,'brouillon',auth.uid(),now()
    ) returning id into v_versement_id;

    insert into public.portefeuille_versement_lignes(versement_id,commission_id,montant)
    select v_versement_id,c.id,coalesce(c.montant_commission,0)
    from public.commissions c
    where c.profile_id = v_group.profile_id
      and c.periode between p_period_start and p_period_end
      and c.statut in ('calculee','validee')
      and not exists (select 1 from public.portefeuille_versement_lignes l where l.commission_id = c.id);
    get diagnostics v_line_count = row_count;
    if v_line_count = 0 then raise exception 'Aucune commission admissible n’a pu être rattachée au versement.'; end if;
    v_count := v_count + 1;
  end loop;

  if v_count = 0 then raise exception 'Aucune commission admissible non déjà rattachée à un versement pour cette période.'; end if;
  return v_count;
end;
$$;

create or replace function public.finance_validate_commission_payout(p_versement_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_payout public.portefeuille_versements%rowtype;
  v_profile_id uuid;
  v_lines integer;
begin
  if not public.workspace_can_manage_finance() then raise exception 'Vous n’êtes pas autorisé à valider les commissions.'; end if;
  v_profile_id := public.workspace_current_profile_id();
  select * into v_payout from public.portefeuille_versements where id = p_versement_id for update;
  if not found or v_payout.statut <> 'brouillon' then raise exception 'Le versement est introuvable ou n’est plus un brouillon.'; end if;
  select count(*) into v_lines from public.portefeuille_versement_lignes where versement_id = p_versement_id;
  if v_lines = 0 then raise exception 'Impossible de valider un versement sans lignes de commissions.'; end if;
  if exists (
    select 1 from public.portefeuille_versement_lignes l
    join public.commissions c on c.id = l.commission_id
    where l.versement_id = p_versement_id
      and (c.profile_id <> v_payout.profile_id or c.statut not in ('calculee','validee'))
  ) then raise exception 'Au moins une commission n’est plus admissible ou appartient à un autre collaborateur.'; end if;
  if exists (
    select 1 from public.portefeuille_versement_lignes l
    join public.portefeuille_versement_lignes other_l on other_l.commission_id = l.commission_id and other_l.versement_id <> l.versement_id
    where l.versement_id = p_versement_id
  ) then raise exception 'Une commission est déjà rattachée à un autre versement.'; end if;

  update public.commissions c
  set statut = 'validee', valide_par = v_profile_id, date_validation = now()
  where c.id in (select l.commission_id from public.portefeuille_versement_lignes l where l.versement_id = p_versement_id);
  update public.portefeuille_versements
  set statut = 'valide', valide_par = v_profile_id, date_validation = now(), updated_at = now()
  where id = p_versement_id;
end;
$$;

create or replace function public.finance_mark_commission_payout_paid(
  p_versement_id uuid,
  p_mode_paiement text,
  p_reference text,
  p_preuve_paiement_url text default null
)
returns void language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_payout public.portefeuille_versements%rowtype;
  v_profile_id uuid;
  v_name text;
  v_transaction_id uuid;
  v_lines integer;
begin
  if not public.workspace_can_manage_finance() then raise exception 'Vous n’êtes pas autorisé à enregistrer les paiements de commissions.'; end if;
  if p_mode_paiement not in ('virement','mobile_money','especes','cheque','autre') then raise exception 'Mode de paiement invalide.'; end if;
  if p_mode_paiement <> 'especes' and coalesce(trim(p_reference),'') = '' then raise exception 'La référence réelle du paiement est obligatoire.'; end if;
  v_profile_id := public.workspace_current_profile_id();
  select * into v_payout from public.portefeuille_versements where id = p_versement_id for update;
  if not found or v_payout.statut <> 'valide' then raise exception 'Le versement doit être validé avant paiement.'; end if;
  if coalesce(v_payout.montant_brut,0) <= 0 then raise exception 'Le montant du versement doit être positif.'; end if;
  select count(*) into v_lines from public.portefeuille_versement_lignes where versement_id = p_versement_id;
  if v_lines = 0 then raise exception 'Aucune commission n’est rattachée à ce versement.'; end if;
  if exists (
    select 1 from public.portefeuille_versement_lignes l
    join public.commissions c on c.id = l.commission_id
    where l.versement_id = p_versement_id
      and (c.profile_id <> v_payout.profile_id or c.statut <> 'validee')
  ) then raise exception 'Au moins une commission n’est pas validée ou appartient à un autre collaborateur.'; end if;
  if exists (select 1 from public.finance_transactions where source_type='commission_payout' and source_id=p_versement_id) then
    raise exception 'Une écriture financière existe déjà pour ce versement. Vérification requise.';
  end if;
  select nom_complet into v_name from public.profiles where id = v_payout.profile_id;

  insert into public.finance_transactions(
    direction,category,label,amount,payment_method,reference,profile_id,source_type,source_id,status,notes,created_by
  ) values (
    'sortie','COMMISSIONS','Commissions — ' || coalesce(v_name,'Collaborateur'),v_payout.montant_brut,
    p_mode_paiement,nullif(trim(p_reference),''),v_payout.profile_id,'commission_payout',v_payout.id,'valide',
    case when coalesce(trim(p_preuve_paiement_url),'') <> '' then 'Justificatif : ' || p_preuve_paiement_url else 'Versement de commissions' end,
    auth.uid()
  ) returning id into v_transaction_id;

  update public.commissions c set statut = 'payee'
  where c.id in (select l.commission_id from public.portefeuille_versement_lignes l where l.versement_id = p_versement_id);
  update public.portefeuille_versements
  set statut = 'paye', paye_par = v_profile_id, date_paiement = now(),
      montant_paye = montant_brut, mode_paiement = p_mode_paiement,
      reference = nullif(trim(p_reference),''), preuve_paiement_url = nullif(trim(p_preuve_paiement_url),''),
      updated_at = now()
  where id = p_versement_id;

  perform public.recalculer_portefeuilles_commissions();
end;
$$;

revoke all on function public.finance_generate_commission_payouts(date,date) from public;
revoke all on function public.finance_validate_commission_payout(uuid) from public;
revoke all on function public.finance_mark_commission_payout_paid(uuid,text,text,text) from public;
grant execute on function public.finance_generate_commission_payouts(date,date) to authenticated;
grant execute on function public.finance_validate_commission_payout(uuid) to authenticated;
grant execute on function public.finance_mark_commission_payout_paid(uuid,text,text,text) to authenticated;
