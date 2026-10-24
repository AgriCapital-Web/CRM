create or replace function public.sync_technical_ticket_treatment_from_report()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  if new.ticket_id is not null and lower(coalesce(new.statut,'')) in ('soumis','valide') then
    update public.tickets_techniques
    set statut='resolue',
        date_resolution=coalesce(date_resolution,now()),
        traite_at=coalesce(traite_at,now()),
        traite_par=coalesce(traite_par,new.agent_technique_id),
        resolution_note=coalesce(nullif(concat_ws(E'\n\n',new.travaux_realises,new.constat,new.observations,new.recommandations),''),resolution_note),
        updated_at=now()
    where id=new.ticket_id;
  end if;
  return new;
end;
$function$;
drop trigger if exists trg_sync_technical_ticket_treatment_from_report on public.rapports_visites_techniques;
create trigger trg_sync_technical_ticket_treatment_from_report
after insert or update of statut,ticket_id on public.rapports_visites_techniques
for each row execute function public.sync_technical_ticket_treatment_from_report();