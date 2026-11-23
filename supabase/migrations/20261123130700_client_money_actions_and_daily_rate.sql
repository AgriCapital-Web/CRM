-- Restrict client financial actions to the PDG and the Relation Client team.
create or replace function private.can_manage_client_money_actions(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select _user_id is not null and (
    private.is_global_admin(_user_id)
    or private.has_role(_user_id, 'pdg')
    or private.has_role(_user_id, 'service_client')
    or private.has_role(_user_id, 'chef_equipe_service_client')
  );
$function$;

revoke all on function private.can_manage_client_money_actions(uuid) from public, anon;
grant execute on function private.can_manage_client_money_actions(uuid) to authenticated;

insert into public.app_permissions (code, module, action, libelle, description, actif)
values (
  'clients.manage_money_actions',
  'clients',
  'manage_money_actions',
  'Clients — Manage Money Actions',
  'Ajouter un paiement, demander un remboursement, transférer un paiement et convertir la monnaie client en jours.',
  true
)
on conflict (code) do update
set module = excluded.module,
    action = excluded.action,
    libelle = excluded.libelle,
    description = excluded.description,
    actif = true,
    updated_at = now();

insert into public.role_permissions (role_code, permission_code)
select roles.role_code, permissions.permission_code
from (values
  ('pdg'),
  ('service_client'),
  ('chef_equipe_service_client')
) as roles(role_code)
cross join (values
  ('clients.manage_money_actions'),
  ('clients.view_money'),
  ('paiements.view'),
  ('paiements.create'),
  ('paiements.record'),
  ('paiements.update')
) as permissions(permission_code)
where exists (select 1 from public.app_roles r where r.code = roles.role_code and r.actif is true)
  and exists (select 1 from public.app_permissions p where p.code = permissions.permission_code and p.actif is true)
  and not exists (
    select 1 from public.role_permissions rp
    where rp.role_code = roles.role_code
      and rp.permission_code = permissions.permission_code
  );

-- A transfer is a dedicated financial action, not a general permission to
-- validate arbitrary payments.
drop policy if exists "CRM paiements insert by permission and scope" on public.paiements;
create policy "CRM paiements insert by permission and scope"
on public.paiements
for insert
to authenticated
with check (
  (
    private.has_role_permission('paiements.record')
    or private.has_role_permission('paiements.create')
    or (
      private.can_manage_client_money_actions((select auth.uid()))
      and mode_paiement = 'Transfert interne'
      and coalesce(metadata, '{}'::jsonb) ? 'transfert_entrant'
    )
  )
  and private.can_access_client((select auth.uid()), client_id)
  and (
    statut is distinct from 'valide'
    or private.has_role_permission('paiements.validate')
    or (
      private.can_manage_client_money_actions((select auth.uid()))
      and mode_paiement = 'Transfert interne'
      and coalesce(metadata, '{}'::jsonb) ? 'transfert_entrant'
    )
  )
);

create policy "Relation client can create scoped refunds"
on public.remboursements
for insert
to authenticated
with check (
  private.can_manage_client_money_actions((select auth.uid()))
  and private.can_access_client((select auth.uid()), client_id)
  and montant > 0
  and exists (
    select 1
    from public.paiements p
    where p.id = paiement_id
      and p.client_id = remboursements.client_id
      and p.statut = 'valide'
  )
);

create policy "Relation client can create scoped transfers"
on public.transferts_paiements
for insert
to authenticated
with check (
  private.can_manage_client_money_actions((select auth.uid()))
  and client_source_id <> client_dest_id
  and montant > 0
  and private.can_access_client((select auth.uid()), client_source_id)
  and private.can_access_client((select auth.uid()), client_dest_id)
);

create policy "Relation client can rollback scoped transfers"
on public.transferts_paiements
for delete
to authenticated
using (
  private.can_manage_client_money_actions((select auth.uid()))
  and private.can_access_client((select auth.uid()), client_source_id)
  and private.can_access_client((select auth.uid()), client_dest_id)
);

create or replace function public.rachater_monnaie_client(p_client_id uuid, p_jours integer)
returns numeric
language plpgsql
security definer
set search_path to ''
as $function$
declare
  rate numeric;
  balance numeric;
  amount numeric;
  uid uuid := auth.uid();
begin
  if not private.can_manage_client_money_actions(uid) then
    raise exception 'Opération non autorisée';
  end if;
  if p_client_id is null or p_jours is null or p_jours <= 0 then
    raise exception 'Paramètres invalides';
  end if;

  select coalesce(
    nullif(c.metadata->>'taux_journalier_total_override','')::numeric,
    public.portal_client_daily_rate(c.id, current_date)
      * coalesce(nullif(c.total_hectares, 0), 1),
    0
  )
  into rate
  from public.clients c
  where c.id = p_client_id;

  if not found then
    raise exception 'Client introuvable';
  end if;
  if coalesce(rate, 0) <= 0 then
    raise exception 'Tarif journalier indisponible';
  end if;

  select coalesce(monnaie_client, 0)
  into balance
  from public.v_monnaie_clients
  where client_id = p_client_id;

  amount := round(rate * p_jours, 2);
  if amount > coalesce(balance, 0) then
    raise exception 'Monnaie client insuffisante';
  end if;

  insert into public.client_monnaie_mouvements (
    client_id, type_mouvement, montant, taux_journalier,
    jours_equivalents, motif, created_by
  )
  values (
    p_client_id, 'debit', amount, rate,
    p_jours, 'Conversion de monnaie client en jours', uid
  );

  return greatest(0, coalesce(balance, 0) - amount);
end;
$function$;

-- Keep expense summaries aligned with commission payouts already confirmed
-- as paid in both the commission ledger and the validated cash-out ledger.
update public.finance_expenses e
set total_amount = t.amount,
    paid_amount = t.amount,
    status = 'paid'
from public.finance_transactions t
join public.commissions c on c.id = t.source_id
where e.transaction_id = t.id
  and t.source_type = 'commission'
  and t.status = 'valide'
  and c.statut = 'payee'
  and coalesce(e.total_amount, 0) = 0
  and coalesce(e.paid_amount, 0) = 0;
