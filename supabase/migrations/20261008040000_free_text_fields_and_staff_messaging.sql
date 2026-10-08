-- 2026-10-08 — CRM : champs texte libres et messagerie équipe ↔ portail.

drop trigger if exists trg_uppercase_person_names_client_cotitulaires on public.client_cotitulaires_mandataires;
drop trigger if exists trg_uppercase_person_names_clients on public.clients;
drop trigger if exists trg_uppercase_person_names_cotitulaires on public.cotitulaires_mandataires;
drop trigger if exists trg_uppercase_person_names_leads on public.leads;
drop trigger if exists trg_uppercase_person_names_profiles on public.profiles;
drop trigger if exists trg_uppercase_person_names_proprietaires on public.proprietaires_terres;

create or replace function public.normalize_person_names()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  return new;
end;
$$;

drop policy if exists portail_messages_staff_read on public.portail_messages;
create policy portail_messages_staff_read
on public.portail_messages
for select
to authenticated
using (private.is_staff((select auth.uid())));

drop policy if exists portail_messages_staff_insert on public.portail_messages;
create policy portail_messages_staff_insert
on public.portail_messages
for insert
to authenticated
with check (
  private.is_staff((select auth.uid()))
  and auteur_type = 'staff'
  and auteur_user_id = (select auth.uid())
);

drop policy if exists portail_messages_staff_update on public.portail_messages;
create policy portail_messages_staff_update
on public.portail_messages
for update
to authenticated
using (private.is_staff((select auth.uid())))
with check (private.is_staff((select auth.uid())));
