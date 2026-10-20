create table if not exists public.portefeuille_versement_paiements (
  id uuid primary key default gen_random_uuid(),
  versement_id uuid not null references public.portefeuille_versements(id) on delete restrict,
  montant numeric(14,2) not null check (montant > 0),
  mode_paiement text not null check (mode_paiement in ('virement','mobile_money','especes','cheque','autre')),
  reference text,
  preuve_paiement_url text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint portefeuille_versement_paiements_reference_required check (mode_paiement='especes' or nullif(trim(reference),'') is not null)
);
create index if not exists portefeuille_versement_paiements_versement_created_idx on public.portefeuille_versement_paiements(versement_id,created_at desc);
alter table public.portefeuille_versement_paiements enable row level security;
drop policy if exists "Finance staff view commission payout payments" on public.portefeuille_versement_paiements;
create policy "Finance staff view commission payout payments" on public.portefeuille_versement_paiements for select to authenticated using (public.workspace_can_manage_finance());
drop policy if exists "Finance staff insert commission payout payments" on public.portefeuille_versement_paiements;
create policy "Finance staff insert commission payout payments" on public.portefeuille_versement_paiements for insert to authenticated with check (public.workspace_can_manage_finance() and created_by=auth.uid());

create or replace function public.finance_record_commission_payout_payment(p_versement_id uuid,p_montant numeric,p_mode_paiement text,p_reference text,p_preuve_paiement_url text default null)
returns jsonb language plpgsql security definer set search_path='public' as $$
declare v_payout public.portefeuille_versements%rowtype; v_profile_id uuid; v_name text; v_payment_id uuid; v_transaction_id uuid; v_remaining numeric; v_paid numeric; v_status text;
begin
  if not public.workspace_can_manage_finance() then raise exception 'Vous n’êtes pas autorisé à enregistrer les paiements de commissions.' using errcode='42501'; end if;
  if p_mode_paiement not in ('virement','mobile_money','especes','cheque','autre') then raise exception 'Mode de paiement invalide.'; end if;
  if p_mode_paiement <> 'especes' and coalesce(trim(p_reference),'') = '' then raise exception 'La référence réelle du paiement est obligatoire.'; end if;
  if p_montant is null or p_montant <= 0 then raise exception 'Le montant payé doit être positif.'; end if;
  v_profile_id := public.workspace_current_profile_id();
  select * into v_payout from public.portefeuille_versements where id=p_versement_id for update;
  if not found or v_payout.statut not in ('valide','partiellement_paye') then raise exception 'Le versement doit être validé et ne doit pas être soldé.'; end if;
  v_remaining := greatest(0,coalesce(v_payout.montant_brut,0)-coalesce(v_payout.montant_paye,0));
  if p_montant > v_remaining then raise exception 'Le montant dépasse le solde restant de %.',v_remaining; end if;
  if not exists(select 1 from public.portefeuille_versement_lignes where versement_id=p_versement_id) then raise exception 'Aucune commission n’est rattachée à ce versement.'; end if;
  if exists(select 1 from public.portefeuille_versement_lignes l join public.commissions c on c.id=l.commission_id where l.versement_id=p_versement_id and (c.profile_id is distinct from v_payout.profile_id or c.statut not in ('validee','payee'))) then raise exception 'Au moins une commission n’est pas validée ou appartient à un autre collaborateur.'; end if;
  insert into public.portefeuille_versement_paiements(versement_id,montant,mode_paiement,reference,preuve_paiement_url,created_by)
  values(p_versement_id,p_montant,p_mode_paiement,nullif(trim(p_reference),''),nullif(trim(p_preuve_paiement_url),''),auth.uid()) returning id into v_payment_id;
  select nom_complet into v_name from public.profiles where id=v_payout.profile_id;
  insert into public.finance_transactions(direction,category,label,amount,payment_method,reference,profile_id,source_type,source_id,status,notes,created_by)
  values('sortie','COMMISSIONS','Commissions — '||coalesce(v_name,'Collaborateur'),p_montant,p_mode_paiement,nullif(trim(p_reference),''),v_payout.profile_id,'commission_payout_payment',v_payment_id,'valide',
    'Paiement de commissions, versement '||p_versement_id::text||case when nullif(trim(p_preuve_paiement_url),'') is not null then '. Justificatif : '||p_preuve_paiement_url else '' end,auth.uid()) returning id into v_transaction_id;
  v_paid := coalesce(v_payout.montant_paye,0)+p_montant;
  v_status := case when v_paid >= coalesce(v_payout.montant_brut,0) then 'paye' else 'partiellement_paye' end;
  update public.portefeuille_versements set statut=v_status,montant_paye=v_paid,mode_paiement=p_mode_paiement,reference=nullif(trim(p_reference),''),preuve_paiement_url=nullif(trim(p_preuve_paiement_url),''),paye_par=v_profile_id,date_paiement=now(),updated_at=now() where id=p_versement_id;
  if v_status='paye' then update public.commissions c set statut='payee' where c.id in (select l.commission_id from public.portefeuille_versement_lignes l where l.versement_id=p_versement_id); end if;
  perform public.recalculer_portefeuilles_commissions();
  return jsonb_build_object('versement_id',p_versement_id,'paiement_id',v_payment_id,'transaction_id',v_transaction_id,'montant_paye',v_paid,'solde_restant',greatest(0,coalesce(v_payout.montant_brut,0)-v_paid),'statut',v_status);
end $$;
revoke all on function public.finance_record_commission_payout_payment(uuid,numeric,text,text,text) from public,anon;
grant execute on function public.finance_record_commission_payout_payment(uuid,numeric,text,text,text) to authenticated;
