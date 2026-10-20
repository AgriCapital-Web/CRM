insert into public.notifications(user_id,type,title,message,data,read,dedupe_key)
select distinct ur.user_id,'client_validation','Client à valider',
  'Le dossier de '||coalesce(nullif(trim(c.nom_complet),''),c.id::text)||' attend la validation du service client / PDG.',
  jsonb_build_object('client_id',c.id,'route','/acquisitions/validation?type=clients'),false,
  'client-validation:backfill:'||c.id::text||':'||ur.user_id::text
from public.clients c
cross join public.user_roles ur
where ur.role in ('pdg','service_client','chef_equipe_service_client')
  and c.validation_statut in ('a_valider','modification_demandee')
on conflict do nothing;
