-- Route account-request alerts only to the PDG and the responsible manager
-- for the requested business domain. New requests are handled by the
-- authenticated internal send-account-request-notification function.
update public.notification_automations
set actif = false,
    updated_at = now()
where code = 'nouvelle_demande_compte_equipe'
  and actif = true;

create or replace function public.trg_account_request_notification()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if tg_op = 'UPDATE'
     and new.statut is distinct from old.statut
     and lower(coalesce(new.statut,'')) in ('approuve','approuvee','approved','active','valide','validee') then
    perform public.notification_emit_event(
      'compte_active',
      jsonb_build_object(
        'account_request_id',new.id,
        'user_id',new.auth_user_id,
        'nom',new.nom_complet,
        'email',new.email,
        'telephone',new.telephone
      )
    );
  end if;
  return new;
end
$function$;
