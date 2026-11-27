-- Centralize the family-name-only rule in internal notification messages.
CREATE OR REPLACE FUNCTION public.crm_notification_family_name(p_nom text, p_full_name text, p_fallback text DEFAULT 'Client')
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT coalesce(
    nullif(upper(btrim(p_nom)), ''),
    nullif(upper((regexp_split_to_array(btrim(coalesce(p_full_name, '')), '[[:space:]]+'))[array_length(regexp_split_to_array(btrim(coalesce(p_full_name, '')), '[[:space:]]+'), 1)]), ''),
    nullif(btrim(p_fallback), ''),
    'Client'
  );
$function$;

CREATE OR REPLACE FUNCTION public.assign_support_ticket_notifications()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  assigned_user uuid;
  manager_user uuid;
  supervisor_user uuid;
  client_name text;
begin
  if new.assigne_a is not null and (tg_op='INSERT' or new.assigne_a is distinct from old.assigne_a) then
    select p.user_id into assigned_user from profiles p where p.id=new.assigne_a and coalesce(p.actif,true);
    if assigned_user is not null then
      select public.crm_notification_family_name(c.nom,c.nom_complet,'Client') into client_name
      from clients c where c.id=new.client_id;
      insert into notifications(user_id,type,title,message,data)
      values(assigned_user,'support_assignment','Nouvelle intervention à traiter',
        coalesce(new.titre,'Demande client') || case when client_name is not null then ' — '||client_name else '' end,
        jsonb_build_object('ticket_id',new.id,'route','/support','region_id',new.region_id,'priority',new.priorite));
    end if;
  end if;

  if new.equipe_id is not null and (tg_op='INSERT' or new.equipe_id is distinct from old.equipe_id) then
    select p.user_id into manager_user
    from equipes e join profiles p on p.id=e.responsable_id
    where e.id=new.equipe_id and coalesce(p.actif,true);
    if manager_user is not null and manager_user <> assigned_user then
      insert into notifications(user_id,type,title,message,data)
      values(manager_user,'support_assignment','Nouvelle demande dans votre équipe',
        coalesce(new.titre,'Demande client'),
        jsonb_build_object('ticket_id',new.id,'route','/support','region_id',new.region_id));
    end if;

    select p.user_id into supervisor_user
    from equipes e join profiles p on p.id=e.superviseur_id
    where e.id=new.equipe_id and coalesce(p.actif,true);
    if supervisor_user is not null and supervisor_user <> coalesce(manager_user,assigned_user) then
      insert into notifications(user_id,type,title,message,data)
      values(supervisor_user,'support_assignment','Nouvelle demande technique dans votre région',
        coalesce(new.titre,'Demande client'),
        jsonb_build_object('ticket_id',new.id,'route','/support','region_id',new.region_id));
    end if;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_acquisition_validation_review()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_client_name text;
  v_reviewer record;
begin
  if tg_op = 'INSERT' then
    if coalesce(new.validation_statut,'') = 'a_valider'
       and coalesce(new.metadata->>'created_from_client_workflow','false') <> 'true'
       and coalesce(new.metadata->>'source', '') <> 'clients' then
      select public.crm_notification_family_name(c.nom,c.nom_complet,c.id::text)
        into v_client_name
      from public.clients c where c.id = new.client_id;
      for v_reviewer in
        select distinct ur.user_id from public.user_roles ur
        where ur.role in ('pdg', 'service_client', 'chef_equipe_service_client')
      loop
        insert into public.notifications(user_id, type, title, message, data, read, dedupe_key)
        values (
          v_reviewer.user_id, 'acquisition_validation', 'Vente à valider',
          'L’acquisition de ' || coalesce(v_client_name, 'un client') || ' attend sa validation.',
          jsonb_build_object('acquisition_id', new.id, 'client_id', new.client_id, 'route', '/acquisitions?validation=ventes'),
          false, 'acquisition-validation:new:' || new.id::text || ':' || v_reviewer.user_id::text
        ) on conflict do nothing;
      end loop;
    end if;
  elsif new.validation_statut is distinct from old.validation_statut
     and new.validation_statut = 'modification_demandee'
     and new.created_by is not null then
    insert into public.notifications(user_id, type, title, message, data, read, dedupe_key)
    values (
      new.created_by, 'acquisition_modification', 'Correction de vente demandée',
      'La vente doit être corrigée : ' || coalesce(nullif(trim(new.validation_commentaire), ''), 'consultez les remarques de validation.'),
      jsonb_build_object('acquisition_id', new.id, 'client_id', new.client_id, 'route', '/acquisitions/' || new.client_id::text, 'allow_edit', true),
      false, 'acquisition-validation:edit:' || new.id::text || ':' || coalesce(new.validation_demande_at::text, now()::text)
    ) on conflict do nothing;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_client_validation_review()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_name text := public.crm_notification_family_name(new.nom,new.nom_complet,new.id::text);
  v_reviewer record;
  v_recipient record;
begin
  if tg_op = 'INSERT' then
    for v_reviewer in
      select distinct ur.user_id from public.user_roles ur
      where ur.role in ('pdg', 'service_client', 'chef_equipe_service_client')
    loop
      insert into public.notifications(user_id, type, title, message, data, read, dedupe_key)
      values (v_reviewer.user_id, 'client_validation', 'Nouveau client à valider',
        'Le dossier de ' || v_name || ' attend la validation du service client / PDG.',
        jsonb_build_object('client_id', new.id, 'route', '/acquisitions/validation?type=clients'), false,
        'client-validation:new:' || new.id::text || ':' || v_reviewer.user_id::text)
      on conflict do nothing;
    end loop;
  elsif new.validation_statut is distinct from old.validation_statut and new.validation_statut = 'modification_demandee' then
    for v_recipient in
      select distinct target.user_id from (
        select new.created_by as user_id
        union select new.commercial_id as user_id
        union
        select manager.user_id
        from public.profiles assigned
        join public.equipes e on e.id = assigned.equipe_id or exists (
          select 1 from public.equipe_membres em where em.equipe_id = e.id and em.profile_id = assigned.id
        )
        join public.profiles manager on manager.id = e.responsable_id or manager.id = e.superviseur_id
        where assigned.user_id = new.commercial_id
        union
        select manager.user_id
        from public.profiles assigned
        join public.profiles manager on manager.equipe_id = assigned.equipe_id or exists (
          select 1 from public.equipe_membres assigned_member
          join public.equipe_membres manager_member on manager_member.equipe_id = assigned_member.equipe_id
          where assigned_member.profile_id = assigned.id and manager_member.profile_id = manager.id
        )
        join public.user_roles ur on ur.user_id = manager.user_id and ur.role in ('chef_equipe_commercial', 'responsable_commercial')
        where assigned.user_id = new.commercial_id and assigned.equipe_id is not null
      ) target where target.user_id is not null
    loop
      insert into public.notifications(user_id, type, title, message, data, read, dedupe_key)
      values (
        v_recipient.user_id, 'client_modification', 'Correction demandée sur un dossier client',
        'Le dossier de ' || v_name || ' doit être corrigé : ' || coalesce(nullif(trim(new.validation_commentaire), ''), 'consultez les remarques du service client.'),
        jsonb_build_object('client_id', new.id, 'route', '/client/' || new.id::text || '?validation=1', 'allow_edit', true),
        false,
        'client-validation:edit:' || new.id::text || ':' || coalesce(new.validation_demande_at::text, now()::text) || ':' || v_recipient.user_id::text
      ) on conflict do nothing;
    end loop;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_portail_message()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
        public.crm_notification_family_name(v_client.nom,v_client.nom_complet,'Un client') || ' vous a écrit.',
        jsonb_build_object('route','/messagerie','client_id',new.client_id,'message_id',new.id,'recu_at',new.recu_at),
        'portail_message:' || new.id::text || ':recipient:' || v_user_id::text
      )
      on conflict (dedupe_key) do nothing;
    end loop;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_portail_support_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_user_id uuid; v_client_name text;
BEGIN
SELECT public.crm_notification_family_name(nom,nom_complet,'Client') INTO v_client_name FROM public.clients WHERE id=NEW.client_id;
IF NEW.statut='ouvert' THEN
FOR v_user_id IN SELECT ur.user_id FROM public.user_roles ur WHERE ur.role IN ('service_client','chef_equipe_service_client') AND ur.user_id IS NOT NULL LOOP
INSERT INTO public.notifications(user_id,type,title,message,data,dedupe_key) VALUES(v_user_id,'support_portail','Demande d''accès au portail',COALESCE(NEW.nom_complet,v_client_name)||' signale un espace client inaccessible.',jsonb_build_object('route','/messagerie','support_request_id',NEW.id,'client_id',NEW.client_id),'support_portail:'||NEW.id::text||':user:'||v_user_id::text) ON CONFLICT (dedupe_key) DO NOTHING;
END LOOP; END IF; RETURN NEW;
END; $function$
;

CREATE OR REPLACE FUNCTION public.notify_resubmitted_client_validation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_reviewer record; v_name text;
begin
  if old.validation_statut='modification_demandee' and new.validation_statut='a_valider' then
    v_name:=public.crm_notification_family_name(new.nom,new.nom_complet,new.id::text);
    for v_reviewer in select distinct ur.user_id from public.user_roles ur where ur.role in ('pdg','service_client','chef_equipe_service_client') loop
      insert into public.notifications(user_id,type,title,message,data,read,dedupe_key)
      values(v_reviewer.user_id,'client_validation','Dossier client corrigé',
        'Le dossier de '||v_name||' a été corrigé et attend une nouvelle validation.',
        jsonb_build_object('client_id',new.id,'route','/acquisitions/validation?type=clients'),false,
        'client-validation:resubmit:'||new.id::text||':'||coalesce(new.updated_at::text,now()::text))
      on conflict do nothing;
    end loop;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.paiement_decider(_paiement_id uuid, _decision text, _motif text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
DECLARE p public.paiements%ROWTYPE; uid uuid := auth.uid();
  is_pdg boolean := private.has_role(uid,'pdg');
  is_cpt boolean := private.has_role(uid,'comptable');
  v_nom text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Vous devez être connecté.' USING ERRCODE='42501'; END IF;
  SELECT * INTO p FROM public.paiements WHERE id = _paiement_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Paiement introuvable.'; END IF;
  IF p.statut <> 'en_attente' THEN RAISE EXCEPTION 'Ce paiement a déjà été traité.'; END IF;
  SELECT public.crm_notification_family_name(nom,nom_complet,'Client') INTO v_nom FROM public.clients WHERE id = p.client_id;

  IF _decision = 'rejeter' THEN
    IF NOT (is_pdg OR is_cpt) THEN RAISE EXCEPTION 'Seuls le comptable et le PDG peuvent refuser un paiement.' USING ERRCODE='42501'; END IF;
    IF coalesce(btrim(_motif),'') = '' THEN RAISE EXCEPTION 'Indiquez le motif du refus.'; END IF;
    UPDATE public.paiements SET statut='rejete', rejet_motif=btrim(_motif), cancelled_at=now() WHERE id=p.id;
    IF p.created_by IS NOT NULL THEN
      INSERT INTO public.notifications(user_id,type,title,message,data,read,dedupe_key)
      VALUES (p.created_by,'paiement_rejete','Paiement refusé', coalesce(v_nom,'Client')||' : '||btrim(_motif),
        jsonb_build_object('paiement_id',p.id),false,'paiement_rejete:'||p.id) ON CONFLICT DO NOTHING;
    END IF;
    RETURN 'rejete';
  END IF;

  IF _decision <> 'valider' THEN RAISE EXCEPTION 'Décision inconnue.'; END IF;
  IF p.validation_comptable_at IS NULL THEN
    IF NOT is_cpt THEN RAISE EXCEPTION 'Ce paiement doit d''abord être validé par le comptable.' USING ERRCODE='42501'; END IF;
    UPDATE public.paiements SET validation_comptable_par=uid, validation_comptable_at=now() WHERE id=p.id;
    PERFORM public.paiement_alert_roles(ARRAY['pdg'],'paiement_a_valider','Paiement à valider (PDG)',
      coalesce(v_nom,'Client')||' : validé par le comptable', jsonb_build_object('paiement_id',p.id),'paiement_valider_pdg:'||p.id);
    RETURN 'valide_comptable';
  END IF;
  IF NOT is_pdg THEN RAISE EXCEPTION 'La validation finale revient au PDG.' USING ERRCODE='42501'; END IF;
  UPDATE public.paiements SET statut='valide', valide_par=uid, date_validation=now(),
    date_paiement=coalesce(date_paiement, now()) WHERE id=p.id;
  RETURN 'valide';
END $function$
;

CREATE OR REPLACE FUNCTION public.workspace_notify_document_comment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_title text;
  v_actor_name text;
  v_target record;
  v_notification_id uuid;
  v_dedupe text;
begin
  select d.title into v_title from public.workspace_documents d where d.id = new.document_id;
  select public.crm_notification_family_name(p.nom,p.nom_complet,'Un collaborateur') into v_actor_name from public.profiles p where p.id = new.author_profile_id;

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
$function$
;

CREATE OR REPLACE FUNCTION public.workspace_notify_document_member()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  select public.crm_notification_family_name(p.nom,p.nom_complet,'Un collaborateur'),p.user_id into v_actor_name,v_actor_user from public.profiles p where p.id = v_actor_profile;
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
$function$
;
