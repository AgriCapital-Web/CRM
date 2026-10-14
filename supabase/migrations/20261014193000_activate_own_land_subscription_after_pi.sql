CREATE OR REPLACE FUNCTION public.handle_paiement_valide()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.statut <> 'valide' or coalesce(old.statut,'')='valide' then return new; end if;

  if coalesce(new.est_paiement_initial,false) then
    update public.clients
    set paiement_initial_paye_at=coalesce(paiement_initial_paye_at,now()),updated_at=now()
    where id=new.client_id;
    perform public.refresh_client_account_activation(new.client_id);

    if new.souscription_id is not null then
      update public.client_souscriptions
      set statut=case when lot_id is not null or statut_technique='mise_en_terre_realisee' then 'active' else 'paiement_initial_paye' end,
          updated_at=now()
      where id=new.souscription_id and client_id=new.client_id and statut<>'active';
    end if;
  elsif new.type_paiement='MENSUALITE' then
    update public.clients set updated_at=now() where id=new.client_id;
  end if;
  return new;
end;
$function$
