create or replace function public.internal_create_meeting(
  p_title text,
  p_description text,
  p_agenda text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_provider_room_id text,
  p_join_url text,
  p_participant_profile_ids uuid[]
)
returns table(id uuid,title text,description text,agenda text,starts_at timestamptz,ends_at timestamptz,status text,provider text,join_url text,created_by_profile_id uuid)
language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_profile_id uuid:=public.internal_current_profile_id(); v_meeting_id uuid; v_targets uuid[];
begin
 if v_profile_id is null then raise exception 'Profil utilisateur actif introuvable.'; end if;
 if nullif(trim(p_title),'') is null then raise exception 'Le titre de la réunion est obligatoire.'; end if;
 if p_starts_at is null or p_ends_at is null or p_ends_at<=p_starts_at then raise exception 'Les horaires de la réunion sont invalides.'; end if;
 select array_agg(distinct target_id) into v_targets from unnest(coalesce(p_participant_profile_ids,'{}'::uuid[])||array[v_profile_id]) as u(target_id);
 if exists(select 1 from unnest(v_targets) as u(target_id) where not exists(select 1 from public.profiles p where p.id=u.target_id and coalesce(p.actif,false)=true and p.user_id is not null)) then
   raise exception 'Un participant sélectionné est inactif ou indisponible.';
 end if;
 insert into public.internal_meetings(title,description,agenda,starts_at,ends_at,provider,provider_room_id,join_url,created_by_profile_id)
 values(trim(p_title),nullif(trim(p_description),''),nullif(trim(p_agenda),''),p_starts_at,p_ends_at,'external',nullif(p_provider_room_id,''),nullif(p_join_url,''),v_profile_id)
 returning internal_meetings.id into v_meeting_id;
 insert into public.internal_meeting_participants(meeting_id,profile_id,participant_role,response)
 select v_meeting_id,u.target_id,case when u.target_id=v_profile_id then 'host' else 'participant' end,case when u.target_id=v_profile_id then 'accepted' else 'pending' end
 from unnest(v_targets) as u(target_id);
 return query select m.id,m.title,m.description,m.agenda,m.starts_at,m.ends_at,m.status,m.provider,m.join_url,m.created_by_profile_id from public.internal_meetings m where m.id=v_meeting_id;
end; $$;
revoke all on function public.internal_create_meeting(text,text,text,timestamptz,timestamptz,text,text,uuid[]) from public,anon;
grant execute on function public.internal_create_meeting(text,text,text,timestamptz,timestamptz,text,text,uuid[]) to authenticated;