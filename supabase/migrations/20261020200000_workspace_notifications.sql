-- Notifications internes et e-mail pour les partages et commentaires de l’espace de travail.
insert into public.notification_automations(code,nom,description,evenement,canal,sujet,contenu,criteres,conditions,actif,cooldown_minutes)
values
(
  'workspace_document_shared_email',
  'Partage de document de travail',
  'Informe par e-mail un collaborateur lorsqu’un document CRM lui est partagé.',
  'workspace_document_shared_email',
  'email',
  'Un document AgriCapital a été partagé avec vous',
  'Bonjour {{nom}}, {{acteur}} vous a partagé le document « {{document_title}} » dans l’espace de travail AgriCapital. Ouvrez votre espace : {{url}}',
  '{"audience":"equipe","has_email":true}'::jsonb,
  '{}'::jsonb,
  true,
  0
),
(
  'workspace_document_comment_email',
  'Nouveau commentaire de travail',
  'Informe par e-mail les participants lorsqu’un commentaire est ajouté à un document partagé.',
  'workspace_document_comment_email',
  'email',
  'Nouveau commentaire dans l’espace de travail AgriCapital',
  'Bonjour {{nom}}, {{acteur}} a ajouté un commentaire au document « {{document_title}} ». Consultez la discussion : {{url}}',
  '{"audience":"equipe","has_email":true}'::jsonb,
  '{}'::jsonb,
  true,
  0
)
on conflict (code) do update set
  nom=excluded.nom, description=excluded.description, evenement=excluded.evenement,
  canal=excluded.canal, sujet=excluded.sujet, contenu=excluded.contenu,
  criteres=excluded.criteres, conditions=excluded.conditions, actif=true, cooldown_minutes=0,
  updated_at=now();

create or replace function public.workspace_notify_document_member()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_title text;
  v_actor_name text;
  v_actor_profile uuid;
  v_actor_user uuid;
  v_target_user uuid;
  v_target_email text;
  v_notification_id uuid;
  v_dedupe text;
begin
  if tg_op = 'UPDATE' and old.permission is not distinct from new.permission then return new; end if;
  select d.title into v_title from public.workspace_documents d where d.id = new.document_id;
  v_actor_profile := case when tg_op = 'INSERT' then new.created_by_profile_id else public.workspace_current_profile_id() end;
  select p.nom_complet,p.user_id into v_actor_name,v_actor_user from public.profiles p where p.id = v_actor_profile;
  select p.user_id,p.email into v_target_user,v_target_email
  from public.profiles p where p.id = new.profile_id and coalesce(p.actif,false) = true;
  if v_target_user is null or v_target_user = v_actor_user then return new; end if;

  v_dedupe := 'workspace-share:' || new.id::text || ':' || new.permission;
  insert into public.notifications(user_id,type,title,message,data,read,dedupe_key)
  values (
    v_target_user,'workspace_share','Document partagé',
    coalesce(v_actor_name,'Un collaborateur') || ' vous a partagé « ' || coalesce(v_title,'un document') || ' ».',
    jsonb_build_object('route','/espace-travail','document_id',new.document_id,'permission',new.permission),
    false,v_dedupe
  )
  on conflict (dedupe_key) do nothing
  returning id into v_notification_id;

  if v_notification_id is not null then
    insert into public.notification_event_outbox(event_code,context)
    values ('notification_push',jsonb_build_object('notification_id',v_notification_id));
  end if;
  if nullif(trim(v_target_email),'') is not null then
    insert into public.notification_event_outbox(event_code,context)
    values ('workspace_document_shared_email',jsonb_build_object(
      'user_id',v_target_user,'document_id',new.document_id,'document_title',coalesce(v_title,'Document'),
      'acteur',coalesce(v_actor_name,'Un collaborateur'),'url','https://app.agricapital.ci/espace-travail'
    ));
  end if;
  return new;
end;
$$;

create or replace function public.workspace_notify_document_comment()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_title text;
  v_actor_name text;
  v_target record;
  v_notification_id uuid;
  v_dedupe text;
begin
  select d.title into v_title from public.workspace_documents d where d.id = new.document_id;
  select p.nom_complet into v_actor_name from public.profiles p where p.id = new.author_profile_id;

  for v_target in
    select distinct p.id,p.user_id,p.email
    from public.profiles p
    where p.user_id is not null and p.id <> new.author_profile_id
      and (
        exists (select 1 from public.workspace_documents d where d.id = new.document_id and d.owner_profile_id = p.id)
        or exists (select 1 from public.workspace_document_members m where m.document_id = new.document_id and m.profile_id = p.id)
      )
  loop
    v_dedupe := 'workspace-comment:' || new.id::text || ':' || v_target.user_id::text;
    insert into public.notifications(user_id,type,title,message,data,read,dedupe_key)
    values (
      v_target.user_id,'workspace_comment','Nouveau commentaire',
      coalesce(v_actor_name,'Un collaborateur') || ' a commenté « ' || coalesce(v_title,'un document') || ' ».',
      jsonb_build_object('route','/espace-travail','document_id',new.document_id,'comment_id',new.id),
      false,v_dedupe
    )
    on conflict (dedupe_key) do nothing
    returning id into v_notification_id;

    if v_notification_id is not null then
      insert into public.notification_event_outbox(event_code,context)
      values ('notification_push',jsonb_build_object('notification_id',v_notification_id));
    end if;
    if nullif(trim(v_target.email),'') is not null then
      insert into public.notification_event_outbox(event_code,context)
      values ('workspace_document_comment_email',jsonb_build_object(
        'user_id',v_target.user_id,'document_id',new.document_id,'document_title',coalesce(v_title,'Document'),
        'acteur',coalesce(v_actor_name,'Un collaborateur'),'url','https://app.agricapital.ci/espace-travail'
      ));
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists workspace_document_member_notify_trigger on public.workspace_document_members;
create trigger workspace_document_member_notify_trigger
after insert or update on public.workspace_document_members
for each row execute function public.workspace_notify_document_member();

drop trigger if exists workspace_document_comment_notify_trigger on public.workspace_document_comments;
create trigger workspace_document_comment_notify_trigger
after insert on public.workspace_document_comments
for each row execute function public.workspace_notify_document_comment();

revoke all on function public.workspace_notify_document_member() from public, anon, authenticated;
revoke all on function public.workspace_notify_document_comment() from public, anon, authenticated;
