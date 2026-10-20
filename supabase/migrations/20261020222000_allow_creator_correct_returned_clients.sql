drop policy if exists "CRM creators correct returned client dossiers" on public.clients;
create policy "CRM creators correct returned client dossiers"
on public.clients for update to authenticated
using (created_by=auth.uid() and validation_statut='modification_demandee')
with check (created_by=auth.uid() and validation_statut='a_valider');

create or replace function public.notify_resubmitted_client_validation()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_reviewer record; v_name text;
begin
  if old.validation_statut='modification_demandee' and new.validation_statut='a_valider' then
    v_name:=coalesce(nullif(trim(new.nom_complet),''),new.id::text);
    for v_reviewer in select distinct ur.user_id from public.user_roles ur where ur.role in ('pdg','service_client','chef_equipe_service_client') loop
      insert into public.notifications(user_id,type,title,message,data,read,dedupe_key)
      values(v_reviewer.user_id,'client_validation','Dossier client corrigé',
        'Le dossier de '||v_name||' a été corrigé et attend une nouvelle validation.',
        jsonb_build_object('client_id',new.id,'route','/acquisitions/validation?type=clients'),false,
        'client-validation:resubmit:'||new.id::text||':'||coalesce(new.updated_at::text,now()::text))
      on conflict do nothing;
    end loop;
  end if;
  return new;
end $$;
drop trigger if exists trg_notify_resubmitted_client_validation on public.clients;
create trigger trg_notify_resubmitted_client_validation after update of validation_statut on public.clients
for each row execute function public.notify_resubmitted_client_validation();
