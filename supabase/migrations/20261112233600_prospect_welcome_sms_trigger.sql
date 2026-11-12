-- Trigger one welcome notification for a newly created prospect record.
-- The canonical prospect table is public.prospects (not public.leads).
drop trigger if exists trg_notification_prospect_created on public.leads;
drop trigger if exists trg_notification_prospect_created on public.prospects;

create or replace function public.trg_notification_prospect_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.client_id is null and coalesce(new.statut,'') not in ('converti','converti_client','archive','supprime') then
    perform public.notification_emit_event(
      'nouveau_prospect',
      jsonb_build_object(
        'prospect_id', new.id,
        'lead_id', new.lead_id,
        'nom_complet', coalesce(new.nom_complet, concat_ws(' ',new.prenoms,new.nom), ''),
        'telephone', new.telephone,
        'date', new.created_at
      )
    );
  end if;
  return new;
end;
$$;

create trigger trg_notification_prospect_created
after insert on public.prospects
for each row execute function public.trg_notification_prospect_created();

update public.notification_automations
set actif=true,
    canal='auto',
    cooldown_minutes=1440,
    criteres=jsonb_build_object('audience','prospects','has_phone',true),
    contenu='AgriCapital: Bonjour {dernierprenom_nom}, votre dossier de prospection a bien été enregistré. Notre équipe vous contactera. Merci.'
where code='nouveau_prospect_bienvenue';
