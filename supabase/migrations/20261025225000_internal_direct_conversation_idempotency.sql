-- Merge legacy duplicate direct conversations and make future direct creation idempotent.
do $$
declare
  r record;
begin
  for r in
    select newer.id as duplicate_id,
      (
        select older.id
        from public.internal_conversations older
        where older.conversation_type = 'direct'
          and older.created_at < newer.created_at
          and (
            select array_agg(m.profile_id order by m.profile_id)
            from public.internal_conversation_members m
            where m.conversation_id = older.id
          ) = (
            select array_agg(m.profile_id order by m.profile_id)
            from public.internal_conversation_members m
            where m.conversation_id = newer.id
          )
        order by older.created_at, older.id
        limit 1
      ) as canonical_id
    from public.internal_conversations newer
    where newer.conversation_type = 'direct'
      and exists (
        select 1
        from public.internal_conversations older
        where older.conversation_type = 'direct'
          and older.created_at < newer.created_at
          and (
            select array_agg(m.profile_id order by m.profile_id)
            from public.internal_conversation_members m
            where m.conversation_id = older.id
          ) = (
            select array_agg(m.profile_id order by m.profile_id)
            from public.internal_conversation_members m
            where m.conversation_id = newer.id
          )
      )
    order by newer.created_at
  loop
    if r.canonical_id is not null and exists (
      select 1 from public.internal_conversations where id = r.duplicate_id
    ) then
      update public.internal_messages
      set conversation_id = r.canonical_id
      where conversation_id = r.duplicate_id;

      update public.internal_message_attachments
      set conversation_id = r.canonical_id
      where conversation_id = r.duplicate_id;

      delete from public.internal_conversation_members duplicate_member
      where duplicate_member.conversation_id = r.duplicate_id
        and exists (
          select 1 from public.internal_conversation_members canonical_member
          where canonical_member.conversation_id = r.canonical_id
            and canonical_member.profile_id = duplicate_member.profile_id
        );

      update public.internal_conversation_members
      set conversation_id = r.canonical_id
      where conversation_id = r.duplicate_id;

      update public.internal_conversations canonical
      set last_message_at = greatest(canonical.last_message_at, duplicate.last_message_at),
          updated_at = greatest(canonical.updated_at, duplicate.updated_at)
      from public.internal_conversations duplicate
      where canonical.id = r.canonical_id
        and duplicate.id = r.duplicate_id;

      delete from public.internal_conversations where id = r.duplicate_id;
    end if;
  end loop;
end;
$$;

create or replace function public.internal_create_conversation(
  p_conversation_type text,
  p_title text,
  p_member_profile_ids uuid[]
)
returns table(id uuid, conversation_type text, title text, last_message_at timestamp with time zone, created_by_profile_id uuid)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_profile_id uuid := public.internal_current_profile_id();
  v_conversation_id uuid;
  v_targets uuid[];
  v_member_count integer;
begin
  if v_profile_id is null then raise exception 'Profil utilisateur actif introuvable.'; end if;
  if p_conversation_type not in ('direct','group','channel') then raise exception 'Type de conversation invalide.'; end if;

  select array_agg(distinct target_id order by target_id)
    into v_targets
  from unnest(coalesce(p_member_profile_ids,'{}'::uuid[]) || array[v_profile_id]) as u(target_id);

  v_member_count := coalesce(array_length(v_targets,1),0);
  if p_conversation_type='direct' and v_member_count<>2 then raise exception 'Une conversation privée doit contenir deux utilisateurs.'; end if;
  if p_conversation_type in ('group','channel') and v_member_count<2 then raise exception 'Ajoutez au moins un autre utilisateur.'; end if;

  if exists (
    select 1 from unnest(v_targets) as u(target_id)
    where not exists (
      select 1 from public.profiles p
      where p.id=u.target_id and coalesce(p.actif,false)=true and p.user_id is not null
    )
  ) then raise exception 'Un participant sélectionné est inactif ou indisponible.'; end if;

  if p_conversation_type='direct' then
    perform pg_advisory_xact_lock(hashtextextended(array_to_string(v_targets, ':'), 0));

    select c.id into v_conversation_id
    from public.internal_conversations c
    join public.internal_conversation_members m on m.conversation_id=c.id
    where c.conversation_type='direct'
    group by c.id
    having count(*)=2 and array_agg(m.profile_id order by m.profile_id)=v_targets
    order by max(c.last_message_at) desc, min(c.created_at) asc
    limit 1;

    if v_conversation_id is not null then
      return query
      select c.id,c.conversation_type,c.title,c.last_message_at,c.created_by_profile_id
      from public.internal_conversations c where c.id=v_conversation_id;
      return;
    end if;
  end if;

  insert into public.internal_conversations(conversation_type,title,created_by_profile_id)
  values(p_conversation_type,nullif(trim(p_title),''),v_profile_id)
  returning internal_conversations.id into v_conversation_id;

  insert into public.internal_conversation_members(conversation_id,profile_id,member_role)
  select v_conversation_id,u.target_id,case when u.target_id=v_profile_id then 'owner' else 'member' end
  from unnest(v_targets) as u(target_id);

  return query
  select c.id,c.conversation_type,c.title,c.last_message_at,c.created_by_profile_id
  from public.internal_conversations c where c.id=v_conversation_id;
end;
$function$;
