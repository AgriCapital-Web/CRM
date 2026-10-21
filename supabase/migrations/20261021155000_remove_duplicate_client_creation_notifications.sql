-- Client registration creates a canonical client-validation notification.
-- A related acquisition is auto-created by create_acquisition_for_new_client().
-- It must not emit a second "sale to validate" alert for the same registration;
-- genuine acquisitions created by the commercial workflow still notify reviewers.

create or replace function public.notify_acquisition_validation_review()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_client_name text;
  v_reviewer record;
begin
  if tg_op = 'INSERT' then
    if coalesce(new.metadata->>'created_from_client_workflow', 'false') <> 'true'
       and coalesce(new.metadata->>'source', '') <> 'clients' then
      select coalesce(nullif(trim(c.nom_complet), ''), c.id::text)
        into v_client_name
      from public.clients c
      where c.id = new.client_id;

      for v_reviewer in
        select distinct ur.user_id
        from public.user_roles ur
        where ur.role in ('pdg', 'service_client', 'chef_equipe_service_client')
      loop
        insert into public.notifications(user_id, type, title, message, data, read, dedupe_key)
        values (
          v_reviewer.user_id,
          'acquisition_validation',
          'Vente à valider',
          'L’acquisition de ' || coalesce(v_client_name, 'un client') || ' attend sa validation.',
          jsonb_build_object(
            'acquisition_id', new.id,
            'client_id', new.client_id,
            'route', '/acquisitions?validation=ventes'
          ),
          false,
          'acquisition-validation:new:' || new.id::text || ':' || v_reviewer.user_id::text
        )
        on conflict do nothing;
      end loop;
    end if;
  elsif new.validation_statut is distinct from old.validation_statut
     and new.validation_statut = 'modification_demandee'
     and new.created_by is not null then
    insert into public.notifications(user_id, type, title, message, data, read, dedupe_key)
    values (
      new.created_by,
      'acquisition_modification',
      'Correction de vente demandée',
      'La vente doit être corrigée : ' || coalesce(nullif(trim(new.validation_commentaire), ''), 'consultez les remarques de validation.'),
      jsonb_build_object(
        'acquisition_id', new.id,
        'client_id', new.client_id,
        'route', '/acquisitions/' || new.client_id::text,
        'allow_edit', true
      ),
      false,
      'acquisition-validation:edit:' || new.id::text || ':' || coalesce(new.validation_demande_at::text, now()::text)
    )
    on conflict do nothing;
  end if;

  return new;
end;
$function$;

-- Remove only the duplicate review alerts generated for automatically created
-- client-workflow acquisitions. Keep notifications for genuine commercial sales.
delete from public.notifications n
using public.acquisitions a
where n.type = 'acquisition_validation'
  and n.data->>'acquisition_id' = a.id::text
  and coalesce(a.metadata->>'created_from_client_workflow', 'false') = 'true'
  and n.dedupe_key like 'acquisition-validation:new:%';
