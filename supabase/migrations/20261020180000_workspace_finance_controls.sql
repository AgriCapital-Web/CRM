-- Espace de travail collaboratif et sécurisation des paiements de paie/commissions.
create table if not exists public.workspace_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  document_type text not null default 'document' check (document_type in ('document','spreadsheet','presentation','file')),
  content_text text not null default '',
  owner_profile_id uuid not null references public.profiles(id) on delete restrict,
  storage_path text,
  file_name text,
  mime_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists workspace_documents_owner_updated_idx on public.workspace_documents(owner_profile_id, updated_at desc);

create table if not exists public.workspace_document_members (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.workspace_documents(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  permission text not null default 'view' check (permission in ('view','edit')),
  created_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(document_id, profile_id)
);
create index if not exists workspace_document_members_profile_idx on public.workspace_document_members(profile_id, document_id);

create table if not exists public.workspace_document_comments (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.workspace_documents(id) on delete cascade,
  author_profile_id uuid not null references public.profiles(id) on delete restrict,
  body text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now()
);
create index if not exists workspace_document_comments_doc_idx on public.workspace_document_comments(document_id, created_at);

create table if not exists public.workspace_document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.workspace_documents(id) on delete cascade,
  title text not null,
  document_type text not null,
  content_text text not null,
  changed_by_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists workspace_document_versions_doc_idx on public.workspace_document_versions(document_id, created_at desc);

create or replace function public.workspace_current_profile_id()
returns uuid language sql stable security definer set search_path = public, pg_temp
as $$
  select p.id from public.profiles p
  where p.user_id = auth.uid() and coalesce(p.actif, false) = true
  limit 1
$$;

create or replace function public.workspace_can_read_document(p_document_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.workspace_documents d
    where d.id = p_document_id and (
      d.owner_profile_id = public.workspace_current_profile_id()
      or exists (
        select 1 from public.workspace_document_members m
        where m.document_id = d.id and m.profile_id = public.workspace_current_profile_id()
      )
    )
  )
$$;

create or replace function public.workspace_can_edit_document(p_document_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.workspace_documents d
    where d.id = p_document_id and (
      d.owner_profile_id = public.workspace_current_profile_id()
      or exists (
        select 1 from public.workspace_document_members m
        where m.document_id = d.id and m.profile_id = public.workspace_current_profile_id() and m.permission = 'edit'
      )
    )
  )
$$;

create or replace function public.workspace_list_collaborators()
returns table(id uuid, nom_complet text, email text, poste text)
language sql stable security definer set search_path = public, pg_temp
as $$
  select p.id, p.nom_complet, p.email, p.poste
  from public.profiles p
  where coalesce(p.actif, false) = true and p.user_id is not null
    and public.workspace_current_profile_id() is not null
  order by p.nom_complet
$$;

create or replace function public.workspace_record_document_version()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if old.title is distinct from new.title
    or old.document_type is distinct from new.document_type
    or old.content_text is distinct from new.content_text
    or old.storage_path is distinct from new.storage_path then
    insert into public.workspace_document_versions(document_id,title,document_type,content_text,changed_by_profile_id)
    values (old.id,old.title,old.document_type,old.content_text,public.workspace_current_profile_id());
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists workspace_document_version_trigger on public.workspace_documents;
create trigger workspace_document_version_trigger before update on public.workspace_documents
for each row execute function public.workspace_record_document_version();

alter table public.workspace_documents enable row level security;
alter table public.workspace_document_members enable row level security;
alter table public.workspace_document_comments enable row level security;
alter table public.workspace_document_versions enable row level security;

drop policy if exists workspace_documents_read on public.workspace_documents;
create policy workspace_documents_read on public.workspace_documents for select to authenticated
using (owner_profile_id = public.workspace_current_profile_id() or public.workspace_can_read_document(id));
drop policy if exists workspace_documents_insert on public.workspace_documents;
create policy workspace_documents_insert on public.workspace_documents for insert to authenticated
with check (owner_profile_id = public.workspace_current_profile_id());
drop policy if exists workspace_documents_update on public.workspace_documents;
create policy workspace_documents_update on public.workspace_documents for update to authenticated
using (public.workspace_can_edit_document(id)) with check (public.workspace_can_edit_document(id));
drop policy if exists workspace_documents_delete on public.workspace_documents;
create policy workspace_documents_delete on public.workspace_documents for delete to authenticated
using (owner_profile_id = public.workspace_current_profile_id());

drop policy if exists workspace_members_read on public.workspace_document_members;
create policy workspace_members_read on public.workspace_document_members for select to authenticated
using (public.workspace_can_read_document(document_id));
drop policy if exists workspace_members_insert on public.workspace_document_members;
create policy workspace_members_insert on public.workspace_document_members for insert to authenticated
with check (
  created_by_profile_id = public.workspace_current_profile_id()
  and exists (select 1 from public.workspace_documents d where d.id = document_id and d.owner_profile_id = public.workspace_current_profile_id())
  and exists (select 1 from public.profiles p where p.id = profile_id and coalesce(p.actif,false) = true and p.user_id is not null)
);
drop policy if exists workspace_members_update on public.workspace_document_members;
create policy workspace_members_update on public.workspace_document_members for update to authenticated
using (exists (select 1 from public.workspace_documents d where d.id = document_id and d.owner_profile_id = public.workspace_current_profile_id()))
with check (exists (select 1 from public.workspace_documents d where d.id = document_id and d.owner_profile_id = public.workspace_current_profile_id()));
drop policy if exists workspace_members_delete on public.workspace_document_members;
create policy workspace_members_delete on public.workspace_document_members for delete to authenticated
using (exists (select 1 from public.workspace_documents d where d.id = document_id and d.owner_profile_id = public.workspace_current_profile_id()));

drop policy if exists workspace_comments_read on public.workspace_document_comments;
create policy workspace_comments_read on public.workspace_document_comments for select to authenticated
using (public.workspace_can_read_document(document_id));
drop policy if exists workspace_comments_insert on public.workspace_document_comments;
create policy workspace_comments_insert on public.workspace_document_comments for insert to authenticated
with check (author_profile_id = public.workspace_current_profile_id() and public.workspace_can_read_document(document_id));
drop policy if exists workspace_comments_delete on public.workspace_document_comments;
create policy workspace_comments_delete on public.workspace_document_comments for delete to authenticated
using (author_profile_id = public.workspace_current_profile_id());

drop policy if exists workspace_versions_read on public.workspace_document_versions;
create policy workspace_versions_read on public.workspace_document_versions for select to authenticated
using (public.workspace_can_read_document(document_id));

revoke all on function public.workspace_current_profile_id() from public;
revoke all on function public.workspace_can_read_document(uuid) from public;
revoke all on function public.workspace_can_edit_document(uuid) from public;
revoke all on function public.workspace_list_collaborators() from public;
grant execute on function public.workspace_current_profile_id() to authenticated;
grant execute on function public.workspace_can_read_document(uuid) to authenticated;
grant execute on function public.workspace_can_edit_document(uuid) to authenticated;
grant execute on function public.workspace_list_collaborators() to authenticated;

alter table public.finance_payroll_runs
  add column if not exists payment_method text,
  add column if not exists payment_reference text,
  add column if not exists payment_proof_url text;

create unique index if not exists finance_payroll_transaction_source_unique
on public.finance_transactions(source_type, source_id)
where source_type = 'paie_salaire' and source_id is not null;

create or replace function public.workspace_can_manage_finance()
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role in ('pdg','dg','comptable','responsable_operations','super_admin','admin')
  )
$$;

create or replace function public.workspace_validate_commission(p_commission_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_profile_id uuid;
begin
  if not public.workspace_can_manage_finance() then raise exception 'Vous n’êtes pas autorisé à valider les commissions.'; end if;
  v_profile_id := public.workspace_current_profile_id();
  if v_profile_id is null then raise exception 'Profil CRM actif introuvable.'; end if;
  update public.commissions
  set statut = 'validee', valide_par = v_profile_id, date_validation = now()
  where id = p_commission_id and statut in ('calculee','en_attente') and paiement_id is null;
  if not found then raise exception 'Commission introuvable, déjà traitée ou non éligible à la validation.'; end if;
end;
$$;

create or replace function public.finance_generate_payroll_run(p_period_start date, p_period_end date)
returns uuid language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_run_id uuid;
  v_salary record;
  v_count integer := 0;
begin
  if not public.workspace_can_manage_finance() then raise exception 'Vous n’êtes pas autorisé à générer la paie.'; end if;
  if p_period_start is null or p_period_end is null or p_period_end < p_period_start then raise exception 'Période de paie invalide.'; end if;
  select count(*) into v_count from public.finance_salary_profiles where active = true and base_salary > 0;
  if v_count = 0 then raise exception 'Aucun salaire actif et positif n’est paramétré.'; end if;
  insert into public.finance_payroll_runs(period_start,period_end,status,created_by)
  values (p_period_start,p_period_end,'brouillon',auth.uid())
  on conflict (period_start,period_end) do update
    set period_end = excluded.period_end
    where public.finance_payroll_runs.status = 'brouillon'
  returning id into v_run_id;
  if v_run_id is null then raise exception 'Un lot existe déjà pour cette période et n’est plus modifiable.'; end if;
  for v_salary in
    select profile_id, base_salary from public.finance_salary_profiles
    where active = true and base_salary > 0
  loop
    insert into public.finance_payroll_items(
      payroll_run_id,profile_id,base_salary,commissions,bonuses,deductions,net_salary,status
    ) values (
      v_run_id,v_salary.profile_id,v_salary.base_salary,0,0,0,v_salary.base_salary,'calcule'
    )
    on conflict (payroll_run_id,profile_id) do update
      set base_salary = excluded.base_salary, commissions = 0, bonuses = 0, deductions = 0,
          net_salary = excluded.net_salary, status = 'calcule'
      where public.finance_payroll_items.status = 'calcule'
        and public.finance_payroll_items.transaction_id is null;
    if not found then raise exception 'Une ligne de paie déjà validée ou payée ne peut pas être écrasée.'; end if;
  end loop;
  return v_run_id;
end;
$$;

create or replace function public.finance_validate_payroll_run(p_run_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if not public.workspace_can_manage_finance() then raise exception 'Vous n’êtes pas autorisé à valider la paie.'; end if;
  if not exists (select 1 from public.finance_payroll_items i where i.payroll_run_id = p_run_id) then
    raise exception 'Ce lot de paie ne contient aucune ligne.';
  end if;
  update public.finance_payroll_runs
  set status = 'valide', validated_at = now()
  where id = p_run_id and status = 'brouillon';
  if not found then raise exception 'Lot de paie introuvable ou déjà traité.'; end if;
  update public.finance_payroll_items set status = 'valide'
  where payroll_run_id = p_run_id and status = 'calcule';
end;
$$;

create or replace function public.finance_payroll_mark_paid(
  p_run_id uuid,
  p_payment_method text,
  p_payment_reference text,
  p_payment_proof_url text default null
)
returns void language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_run public.finance_payroll_runs%rowtype;
declare v_item record;
declare v_amount numeric;
declare v_profile_id uuid;
begin
  if not public.workspace_can_manage_finance() then raise exception 'Vous n’êtes pas autorisé à enregistrer le paiement de la paie.'; end if;
  if p_payment_method not in ('virement','mobile_money','especes','cheque','autre') then raise exception 'Mode de paiement invalide.'; end if;
  if coalesce(trim(p_payment_reference),'') = '' and p_payment_method <> 'especes' then raise exception 'Une référence de paiement est obligatoire pour ce mode de paiement.'; end if;
  select * into v_run from public.finance_payroll_runs where id = p_run_id for update;
  if not found or v_run.status <> 'valide' then raise exception 'Le lot doit être validé avant paiement.'; end if;
  if exists (select 1 from public.finance_payroll_items where payroll_run_id = p_run_id and transaction_id is not null) then
    raise exception 'Au moins une ligne possède déjà une transaction financière; vérification manuelle requise.';
  end if;
  if not exists (select 1 from public.finance_payroll_items where payroll_run_id = p_run_id and status = 'valide') then
    raise exception 'Aucune ligne de paie validée à payer.';
  end if;
  v_profile_id := public.workspace_current_profile_id();
  for v_item in
    select i.*, p.nom_complet from public.finance_payroll_items i
    join public.profiles p on p.id = i.profile_id
    where i.payroll_run_id = p_run_id and i.status = 'valide'
    for update of i
  loop
    v_amount := greatest(0, coalesce(v_item.base_salary,0) + coalesce(v_item.bonuses,0) - coalesce(v_item.deductions,0));
    if v_amount <= 0 then raise exception 'Montant net nul ou négatif pour %.', v_item.nom_complet; end if;
    insert into public.finance_transactions(
      direction,category,label,amount,payment_method,reference,profile_id,source_type,source_id,status,notes,created_by
    ) values (
      'sortie','SALAIRES','Salaire — ' || v_item.nom_complet,v_amount,p_payment_method,
      nullif(trim(p_payment_reference),''),v_item.profile_id,'paie_salaire',v_item.id,'valide',
      'Lot de paie ' || to_char(v_run.period_start,'YYYY-MM'),auth.uid()
    ) returning id into v_profile_id;
    update public.finance_payroll_items
    set transaction_id = v_profile_id, net_salary = v_amount, status = 'paye'
    where id = v_item.id;
  end loop;
  update public.finance_payroll_runs
  set status = 'paye', paid_at = now(), payment_method = p_payment_method,
      payment_reference = nullif(trim(p_payment_reference),''), payment_proof_url = p_payment_proof_url
  where id = p_run_id;
end;
$$;

revoke all on function public.workspace_can_manage_finance() from public;
revoke all on function public.workspace_validate_commission(uuid) from public;
revoke all on function public.finance_generate_payroll_run(date,date) from public;
revoke all on function public.finance_validate_payroll_run(uuid) from public;
revoke all on function public.finance_payroll_mark_paid(uuid,text,text,text) from public;
grant execute on function public.workspace_can_manage_finance() to authenticated;
grant execute on function public.workspace_validate_commission(uuid) to authenticated;
grant execute on function public.finance_generate_payroll_run(date,date) to authenticated;
grant execute on function public.finance_validate_payroll_run(uuid) to authenticated;
grant execute on function public.finance_payroll_mark_paid(uuid,text,text,text) to authenticated;
