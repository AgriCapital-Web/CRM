begin;
create table if not exists public.paiement_acquisition_allocations (
  id uuid primary key default gen_random_uuid(),
  paiement_id uuid not null references public.paiements(id) on delete cascade,
  acquisition_id uuid not null references public.acquisitions(id) on delete cascade,
  type_paiement text not null check (type_paiement in ('PI','MENSUALITE')),
  montant numeric(14,2) not null check (montant >= 0),
  created_at timestamptz not null default now(),
  unique (paiement_id,acquisition_id,type_paiement)
);
alter table public.paiement_acquisition_allocations enable row level security;
create index if not exists idx_paiement_acquisition_allocations_acquisition
  on public.paiement_acquisition_allocations(acquisition_id,type_paiement);
create index if not exists idx_paiement_acquisition_allocations_paiement
  on public.paiement_acquisition_allocations(paiement_id);

update public.paiements p
set acquisition_id = a.id,
    metadata = coalesce(p.metadata,'{}'::jsonb) || jsonb_build_object('allocation_backfill','single_acquisition_client')
from public.acquisitions a
where p.client_id=a.client_id
  and p.acquisition_id is null
  and p.statut='valide'
  and exists(select 1 from public.acquisitions a2 where a2.client_id=p.client_id group by a2.client_id having count(*)=1);

do $$
declare
  v_definition text;
  v_updated text;
begin
  select pg_get_functiondef('public.acquisition_current_payment_state(uuid)'::regprocedure)
    into v_definition;
  v_updated := replace(
    v_definition,
    $find$  select coalesce(sum(greatest(coalesce(p.montant_paye,p.montant,0),0)),0)
    into v_pi_paid from public.paiements p
    where p.acquisition_id=s.id and p.statut='valide' and coalesce(p.est_paiement_initial,false)=true;$find$,
    $replace$  select
      coalesce((select sum(greatest(coalesce(p.montant_paye,p.montant,0),0))
        from public.paiements p
        where p.acquisition_id=s.id and p.statut='valide' and coalesce(p.est_paiement_initial,false)=true),0)
      + coalesce((select sum(greatest(coalesce(al.montant,0),0))
        from public.paiement_acquisition_allocations al
        join public.paiements p on p.id=al.paiement_id
        where al.acquisition_id=s.id and al.type_paiement='PI' and p.statut='valide'),0)
    into v_pi_paid;$replace$
  );
  if v_updated=v_definition then raise exception 'Le calcul du paiement initial par acquisition a changé.'; end if;
  v_definition:=v_updated;
  v_updated := replace(
    v_definition,
    $find$  select coalesce(sum(greatest(coalesce(p.montant_paye,p.montant,0),0)),0)
    into v_monthly_paid from public.paiements p
    where p.acquisition_id=s.id and p.statut='valide' and p.type_paiement='MENSUALITE';$find$,
    $replace$  select
      coalesce((select sum(greatest(coalesce(p.montant_paye,p.montant,0),0))
        from public.paiements p
        where p.acquisition_id=s.id and p.statut='valide' and p.type_paiement='MENSUALITE'),0)
      + coalesce((select sum(greatest(coalesce(al.montant,0),0))
        from public.paiement_acquisition_allocations al
        join public.paiements p on p.id=al.paiement_id
        where al.acquisition_id=s.id and al.type_paiement='MENSUALITE' and p.statut='valide'),0)
    into v_monthly_paid;$replace$
  );
  if v_updated=v_definition then raise exception 'Le calcul des mensualités par acquisition a changé.'; end if;
  execute v_updated;
end $$;
commit;