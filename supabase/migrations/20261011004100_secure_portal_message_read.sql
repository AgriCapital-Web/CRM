create or replace function public.mark_portail_message_read(p_message_id uuid,p_client_id uuid default null)
returns void language plpgsql security definer set search_path to ''
as $function$
declare v_message_client uuid;
begin
 if auth.uid() is null then raise exception 'Authentification requise' using errcode='42501'; end if;
 select m.client_id into v_message_client from public.portail_messages m where m.id=p_message_id;
 if v_message_client is null then raise exception 'Message introuvable' using errcode='P0002'; end if;
 if p_client_id is not null and p_client_id is distinct from v_message_client then raise exception 'Message et client incohérents' using errcode='42501'; end if;
 if not private.can_access_client(auth.uid(),v_message_client) then raise exception 'Accès refusé' using errcode='42501'; end if;
 update public.portail_messages set lu=true,lu_at=coalesce(lu_at,now()) where id=p_message_id and client_id=v_message_client;
end;
$function$;
