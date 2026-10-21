-- A client message can target its creator, commercial owner and service roles.
-- Merge that audience into one recipient set so one user gets one notification per message.
create or replace function public.notify_portail_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_client public.clients%rowtype;
  v_user_id uuid;
begin
  select * into v_client from public.clients where id = new.client_id;

  if new.auteur_type = 'staff' then
    insert into public.portail_notifications(client_id,message_id,type,title,message,data,dedupe_key)
    values (
      new.client_id,new.id,'message',
      coalesce(nullif(new.auteur_nom,''),'AgriCapital'),
      left(new.message,500),
      jsonb_build_object('route','/plantations','message_id',new.id,'plantation_id',new.plantation_id,'recu_at',new.recu_at),
      'portail_message:' || new.id::text
    )
    on conflict (dedupe_key) do nothing;
  else
    for v_user_id in
      select distinct recipients.user_id
      from (
        select v_client.created_by as user_id
        union
        select v_client.commercial_id as user_id
        union
        select ur.user_id
        from public.user_roles ur
        where ur.role in ('service_client','chef_equipe_service_client','pdg','dg')
      ) recipients
      where recipients.user_id is not null
    loop
      insert into public.notifications(user_id,type,title,message,data,dedupe_key)
      values (
        v_user_id,'message_portail','Nouveau message portail',
        coalesce(v_client.nom_complet,'Un client') || ' vous a écrit.',
        jsonb_build_object('route','/messagerie','client_id',new.client_id,'message_id',new.id,'recu_at',new.recu_at),
        'portail_message:' || new.id::text || ':recipient:' || v_user_id::text
      )
      on conflict (dedupe_key) do nothing;
    end loop;
  end if;
  return new;
end;
$function$;

-- Keep the first notification per recipient/message in the inbox; mark historical
-- duplicates as read rather than deleting the audit trail.
with ranked as (
  select id,row_number() over (
    partition by user_id,data->>'message_id',type
    order by created_at,id
  ) as rn
  from public.notifications
  where type='message_portail' and data ? 'message_id'
)
update public.notifications n
set read=true,updated_at=now()
from ranked r
where r.id=n.id and r.rn>1 and n.read is distinct from true;
