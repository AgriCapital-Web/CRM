-- Make portal activation independent of the order in which dossier validation
-- and the initial payment are completed. The payment trigger handles the other order.
create or replace function private.refresh_account_on_client_validation()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $function$
begin
  if new.validation_statut = 'valide'
     and (tg_op = 'INSERT' or old.validation_statut is distinct from new.validation_statut) then
    perform public.refresh_client_account_activation(new.id);
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_refresh_account_on_client_validation on public.clients;
create trigger trg_refresh_account_on_client_validation
after insert or update of validation_statut
on public.clients
for each row execute function private.refresh_account_on_client_validation();
