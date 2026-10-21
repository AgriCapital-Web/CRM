-- AgriCapital 360: registre historique financier auditable et communication interne.
-- Additive migration: no existing client/payment rows are changed or deleted.

create table if not exists public.finance_historical_import_batches (
  id uuid primary key default gen_random_uuid(),
  source_filename text not null,
  source_reference text,
  status text not null default 'draft' check (status in ('draft','review','posted','cancelled')),
  source_rows integer not null default 0 check (source_rows >= 0),
  staged_rows integer not null default 0 check (staged_rows >= 0),
  excluded_rows integer not null default 0 check (excluded_rows >= 0),
  review_rows integer not null default 0 check (review_rows >= 0),
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  finalized_at timestamptz,
  notes text
);
create table if not exists public.finance_historical_ledger (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.finance_historical_import_batches(id) on delete restrict,
  source_sheet text not null,
  source_row_number integer not null check (source_row_number > 0),
  source_key text not null unique,
  operation_date date,
  actor_name text,
  operation_type text not null,
  category text,
  description text,
  amount numeric(14,2) not null check (amount >= 0),
  accounting_class text not null default 'needs_review'
    check (accounting_class in ('cash_income','cash_expense','associate_capital','associate_current_account','loan_received','loan_repayment','donation','investment','client_sale_excluded','donald_loan_excluded','non_cash_contribution','needs_review')),
  cash_direction text check (cash_direction in ('entree','sortie')),
  affects_cash boolean not null default false,
  review_status text not null default 'pending_review'
    check (review_status in ('pending_review','matched_existing','approved','posted','excluded','rejected')),
  associate_id uuid references public.finance_associates(id) on delete set null,
  matched_transaction_id uuid references public.finance_transactions(id) on delete set null,
  original_payload jsonb not null default '{}'::jsonb,
  review_note text,
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(batch_id, source_sheet, source_row_number)
);
create index if not exists finance_historical_ledger_batch_status_idx
  on public.finance_historical_ledger(batch_id, review_status, operation_date);
create index if not exists finance_historical_ledger_date_idx
  on public.finance_historical_ledger(operation_date, accounting_class);
alter table public.finance_historical_import_batches enable row level security;
alter table public.finance_historical_ledger enable row level security;
drop policy if exists finance_historical_batches_read on public.finance_historical_import_batches;
create policy finance_historical_batches_read on public.finance_historical_import_batches
for select to authenticated using (public.finance_can_view());
drop policy if exists finance_historical_batches_manage on public.finance_historical_import_batches;
create policy finance_historical_batches_manage on public.finance_historical_import_batches
for all to authenticated using (public.finance_can_manage()) with check (public.finance_can_manage());
drop policy if exists finance_historical_ledger_read on public.finance_historical_ledger;
create policy finance_historical_ledger_read on public.finance_historical_ledger
for select to authenticated using (public.finance_can_view());
drop policy if exists finance_historical_ledger_manage on public.finance_historical_ledger;
create policy finance_historical_ledger_manage on public.finance_historical_ledger
for all to authenticated using (public.finance_can_manage()) with check (public.finance_can_manage());

-- Internal messaging is intentionally separate from portail_messages (client portal).
create table if not exists public.internal_conversations (
  id uuid primary key default gen_random_uuid(),
  conversation_type text not null default 'direct' check (conversation_type in ('direct','group','channel')),
  title text,
  created_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);
create table if not exists public.internal_conversation_members (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.internal_conversations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  member_role text not null default 'member' check (member_role in ('owner','admin','member')),
  joined_at timestamptz not null default now(),
  last_read_at timestamptz,
  muted boolean not null default false,
  unique(conversation_id, profile_id)
);
create table if not exists public.internal_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.internal_conversations(id) on delete cascade,
  sender_profile_id uuid not null references public.profiles(id) on delete restrict,
  body text not null check (length(trim(body)) > 0),
  reply_to_id uuid references public.internal_messages(id) on delete set null,
  message_type text not null default 'text' check (message_type in ('text','system','file','meeting')),
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.internal_message_receipts (
  message_id uuid not null references public.internal_messages(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  delivered_at timestamptz,
  read_at timestamptz,
  primary key(message_id, profile_id)
);
create table if not exists public.internal_message_reactions (
  message_id uuid not null references public.internal_messages(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null check (length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key(message_id, profile_id, emoji)
);
create table if not exists public.internal_meetings (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  description text,
  agenda text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled','in_progress','completed','cancelled')),
  created_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  provider text not null default 'unconfigured' check (provider in ('unconfigured','livekit','external')),
  provider_room_id text,
  join_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create table if not exists public.internal_meeting_participants (
  meeting_id uuid not null references public.internal_meetings(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  response text not null default 'pending' check (response in ('pending','accepted','declined','tentative')),
  participant_role text not null default 'participant' check (participant_role in ('host','moderator','participant')),
  invited_at timestamptz not null default now(),
  joined_at timestamptz,
  left_at timestamptz,
  primary key(meeting_id, profile_id)
);
create index if not exists internal_conversation_members_profile_idx on public.internal_conversation_members(profile_id, conversation_id);
create index if not exists internal_messages_conversation_created_idx on public.internal_messages(conversation_id, created_at desc);
create index if not exists internal_meetings_starts_idx on public.internal_meetings(starts_at) where status <> 'cancelled';
create index if not exists internal_meeting_participants_profile_idx on public.internal_meeting_participants(profile_id, meeting_id);

create or replace function public.internal_current_profile_id()
returns uuid language sql stable security definer set search_path = public, pg_temp
as $$
  select p.id from public.profiles p
  where p.user_id = auth.uid() and coalesce(p.actif,false) = true
  limit 1
$$;
create or replace function public.internal_is_conversation_member(p_conversation_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.internal_conversation_members m
    where m.conversation_id = p_conversation_id
      and m.profile_id = public.internal_current_profile_id()
  )
$$;
create or replace function public.internal_can_read_meeting(p_meeting_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.internal_meetings m
    where m.id = p_meeting_id and (
      m.created_by_profile_id = public.internal_current_profile_id()
      or exists (select 1 from public.internal_meeting_participants p
        where p.meeting_id=m.id and p.profile_id=public.internal_current_profile_id())
    )
  )
$$;
create or replace function public.internal_touch_conversation()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  update public.internal_conversations set last_message_at = new.created_at, updated_at = now()
  where id = new.conversation_id;
  return new;
end;
$$;
drop trigger if exists internal_message_touch_conversation on public.internal_messages;
create trigger internal_message_touch_conversation after insert on public.internal_messages
for each row execute function public.internal_touch_conversation();

alter table public.internal_conversations enable row level security;
alter table public.internal_conversation_members enable row level security;
alter table public.internal_messages enable row level security;
alter table public.internal_message_receipts enable row level security;
alter table public.internal_message_reactions enable row level security;
alter table public.internal_meetings enable row level security;
alter table public.internal_meeting_participants enable row level security;

drop policy if exists internal_conversations_read on public.internal_conversations;
create policy internal_conversations_read on public.internal_conversations for select to authenticated
using (public.internal_is_conversation_member(id));
drop policy if exists internal_conversations_create on public.internal_conversations;
create policy internal_conversations_create on public.internal_conversations for insert to authenticated
with check (created_by_profile_id = public.internal_current_profile_id());
drop policy if exists internal_conversations_update on public.internal_conversations;
create policy internal_conversations_update on public.internal_conversations for update to authenticated
using (created_by_profile_id = public.internal_current_profile_id())
with check (created_by_profile_id = public.internal_current_profile_id());

drop policy if exists internal_members_read on public.internal_conversation_members;
create policy internal_members_read on public.internal_conversation_members for select to authenticated
using (public.internal_is_conversation_member(conversation_id));
drop policy if exists internal_members_insert on public.internal_conversation_members;
create policy internal_members_insert on public.internal_conversation_members for insert to authenticated
with check (
  (profile_id = public.internal_current_profile_id()
    and exists (select 1 from public.internal_conversations c where c.id=conversation_id and c.created_by_profile_id=public.internal_current_profile_id()))
  or exists (select 1 from public.internal_conversations c where c.id=conversation_id and c.created_by_profile_id=public.internal_current_profile_id())
);
drop policy if exists internal_members_update on public.internal_conversation_members;
create policy internal_members_update on public.internal_conversation_members for update to authenticated
using (profile_id = public.internal_current_profile_id())
with check (profile_id = public.internal_current_profile_id());
drop policy if exists internal_members_delete on public.internal_conversation_members;
create policy internal_members_delete on public.internal_conversation_members for delete to authenticated
using (exists (select 1 from public.internal_conversations c where c.id=conversation_id and c.created_by_profile_id=public.internal_current_profile_id()));

drop policy if exists internal_messages_read on public.internal_messages;
create policy internal_messages_read on public.internal_messages for select to authenticated
using (public.internal_is_conversation_member(conversation_id));
drop policy if exists internal_messages_insert on public.internal_messages;
create policy internal_messages_insert on public.internal_messages for insert to authenticated
with check (sender_profile_id=public.internal_current_profile_id() and public.internal_is_conversation_member(conversation_id));
drop policy if exists internal_messages_update on public.internal_messages;
create policy internal_messages_update on public.internal_messages for update to authenticated
using (sender_profile_id=public.internal_current_profile_id())
with check (sender_profile_id=public.internal_current_profile_id());

drop policy if exists internal_receipts_read on public.internal_message_receipts;
create policy internal_receipts_read on public.internal_message_receipts for select to authenticated
using (public.internal_is_conversation_member((select conversation_id from public.internal_messages where id=message_id)));
drop policy if exists internal_receipts_write on public.internal_message_receipts;
create policy internal_receipts_write on public.internal_message_receipts for all to authenticated
using (profile_id=public.internal_current_profile_id())
with check (profile_id=public.internal_current_profile_id() and public.internal_is_conversation_member((select conversation_id from public.internal_messages where id=message_id)));

drop policy if exists internal_reactions_read on public.internal_message_reactions;
create policy internal_reactions_read on public.internal_message_reactions for select to authenticated
using (public.internal_is_conversation_member((select conversation_id from public.internal_messages where id=message_id)));
drop policy if exists internal_reactions_write on public.internal_message_reactions;
create policy internal_reactions_write on public.internal_message_reactions for all to authenticated
using (profile_id=public.internal_current_profile_id())
with check (profile_id=public.internal_current_profile_id() and public.internal_is_conversation_member((select conversation_id from public.internal_messages where id=message_id)));

drop policy if exists internal_meetings_read on public.internal_meetings;
create policy internal_meetings_read on public.internal_meetings for select to authenticated
using (public.internal_can_read_meeting(id));
drop policy if exists internal_meetings_create on public.internal_meetings;
create policy internal_meetings_create on public.internal_meetings for insert to authenticated
with check (created_by_profile_id=public.internal_current_profile_id());
drop policy if exists internal_meetings_update on public.internal_meetings;
create policy internal_meetings_update on public.internal_meetings for update to authenticated
using (created_by_profile_id=public.internal_current_profile_id())
with check (created_by_profile_id=public.internal_current_profile_id());

drop policy if exists internal_meeting_participants_read on public.internal_meeting_participants;
create policy internal_meeting_participants_read on public.internal_meeting_participants for select to authenticated
using (public.internal_can_read_meeting(meeting_id));
drop policy if exists internal_meeting_participants_insert on public.internal_meeting_participants;
create policy internal_meeting_participants_insert on public.internal_meeting_participants for insert to authenticated
with check (
  exists (select 1 from public.internal_meetings m where m.id=meeting_id and m.created_by_profile_id=public.internal_current_profile_id())
  or profile_id=public.internal_current_profile_id()
);
drop policy if exists internal_meeting_participants_update on public.internal_meeting_participants;
create policy internal_meeting_participants_update on public.internal_meeting_participants for update to authenticated
using (profile_id=public.internal_current_profile_id()
  or exists (select 1 from public.internal_meetings m where m.id=meeting_id and m.created_by_profile_id=public.internal_current_profile_id()))
with check (profile_id=public.internal_current_profile_id()
  or exists (select 1 from public.internal_meetings m where m.id=meeting_id and m.created_by_profile_id=public.internal_current_profile_id()));

revoke all on function public.internal_current_profile_id() from public;
revoke all on function public.internal_is_conversation_member(uuid) from public;
revoke all on function public.internal_can_read_meeting(uuid) from public;
grant execute on function public.internal_current_profile_id() to authenticated;
grant execute on function public.internal_is_conversation_member(uuid) to authenticated;
grant execute on function public.internal_can_read_meeting(uuid) to authenticated;

-- Keep database-only provider configuration out of browser-readable tables.
create table if not exists public.internal_meeting_provider_config (
  id boolean primary key default true check (id),
  provider text not null default 'unconfigured' check (provider in ('unconfigured','livekit','external')),
  public_server_url text,
  secret_configured boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by_profile_id uuid references public.profiles(id) on delete set null
);
alter table public.internal_meeting_provider_config enable row level security;
drop policy if exists internal_meeting_provider_config_read on public.internal_meeting_provider_config;
create policy internal_meeting_provider_config_read on public.internal_meeting_provider_config
for select to authenticated using (public.finance_can_manage());
drop policy if exists internal_meeting_provider_config_write on public.internal_meeting_provider_config;
create policy internal_meeting_provider_config_write on public.internal_meeting_provider_config
for all to authenticated using (public.finance_can_manage()) with check (public.finance_can_manage());
