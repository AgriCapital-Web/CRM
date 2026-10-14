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

      update public.plantations p
      set statut='actif',statut_global='actif',
          superficie_activee=coalesce(p.superficie_ha,0),
          date_activation=coalesce(p.date_activation,coalesce(new.date_paiement::date,current_date)),
          updated_at=now()
      where p.souscription_id=new.souscription_id
        and exists(select 1 from public.client_souscriptions s
          where s.id=new.souscription_id and s.statut_technique='mise_en_terre_realisee');
    end if;
  elsif new.type_paiement='MENSUALITE' then
    update public.clients set updated_at=now() where id=new.client_id;
  end if;
  return new;
end;
$function$
