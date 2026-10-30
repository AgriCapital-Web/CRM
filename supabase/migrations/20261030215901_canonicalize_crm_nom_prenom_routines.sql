do $migration$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.sync_crm_identity_compatibility()'::regprocedure);
  v_def := replace(v_def, 'NEW.nom_famille', 'NEW.nom');
  execute v_def;

  v_def := pg_get_functiondef('private.sync_crm_party_identity()'::regprocedure);
  v_def := replace(v_def, 'v_nom text := coalesce(nullif(d->>''nom_famille'',''''), nullif(d->>''nom'',''''));', 'v_nom text := nullif(d->>''nom'','''');');
  v_def := regexp_replace(v_def, 'numero_enregistrement,[[:space:]]*nom_famille,[[:space:]]*nombre_membres', 'numero_enregistrement,nombre_membres','g');
  v_def := regexp_replace(v_def, 'nullif\(d->>''numero_enregistrement'',''''\),[[:space:]]*v_nom,[[:space:]]*nullif\(d->>''nombre_membres'',''''\)::integer', 'nullif(d->>''numero_enregistrement'',''''),nullif(d->>''nombre_membres'','''')::integer','g');
  v_def := replace(v_def, 'nom_famille=coalesce(v_nom,nom_famille),', '');
  if position('nom_famille' in v_def) > 0 then raise exception 'sync_crm_party_identity still references nom_famille'; end if;
  execute v_def;

  v_def := pg_get_functiondef('private.resolve_crm_party_for_record(text,uuid,jsonb,text)'::regprocedure);
  v_def := replace(v_def, 'nom_famille', 'nom');
  if position('nom_famille' in v_def) > 0 then raise exception 'resolve_crm_party_for_record still references nom_famille'; end if;
  execute v_def;

  v_def := pg_get_functiondef('private.link_existing_client_to_auth_user(uuid,text,text,text,text,text)'::regprocedure);
  v_def := replace(v_def, 'c.nom_famille', 'c.nom');
  if position('nom_famille' in v_def) > 0 then raise exception 'link_existing_client_to_auth_user still references nom_famille'; end if;
  execute v_def;

  v_def := pg_get_functiondef('public.assign_support_ticket_notifications()'::regprocedure);
  v_def := replace(v_def, 'c.prenoms,c.nom_famille', 'c.nom,c.prenoms');
  if position('nom_famille' in v_def) > 0 then raise exception 'assign_support_ticket_notifications still references nom_famille'; end if;
  execute v_def;

  v_def := pg_get_functiondef('public.convert_prospect_to_client(uuid)'::regprocedure);
  v_def := replace(v_def, 'clients(nom_famille,prenoms,nom_complet,nom,', 'clients(nom,prenoms,nom_complet,');
  v_def := replace(v_def, 'values(p.nom,p.prenoms,trim(concat_ws('' '',p.prenoms,p.nom)),trim(concat_ws('' '',p.prenoms,p.nom)),p.telephone', 'values(p.nom,p.prenoms,trim(concat_ws('' '',p.prenoms,p.nom)),p.telephone');
  if position('nom_famille' in v_def) > 0 then raise exception 'convert_prospect_to_client still references nom_famille'; end if;
  execute v_def;

  v_def := pg_get_functiondef('public.notification_resolve_recipients(jsonb)'::regprocedure);
  v_def := replace(v_def, 'concat_ws('' '',c.prenoms,c.nom_famille)', 'concat_ws('' '',c.nom,c.prenoms)');
  if position('nom_famille' in v_def) > 0 then raise exception 'notification_resolve_recipients still references nom_famille'; end if;
  execute v_def;

  v_def := pg_get_functiondef('public.notify_client_validation_review()'::regprocedure);
  v_def := replace(v_def, 'new.nom_famille, new.prenoms', 'new.nom, new.prenoms');
  if position('nom_famille' in v_def) > 0 then raise exception 'notify_client_validation_review still references nom_famille'; end if;
  execute v_def;

  v_def := pg_get_functiondef('public.register_beneficiaire_particulier(jsonb,jsonb,jsonb,jsonb,jsonb)'::regprocedure);
  v_def := replace(v_def, 'v_nom_famille', 'v_nom');
  v_def := replace(v_def, 'p_beneficiaire->>''nom_famille''', 'p_beneficiaire->>''nom''');
  v_def := replace(v_def, 'nom,nom_famille,prenoms,nom_complet', 'nom,prenoms,nom_complet');
  v_def := replace(v_def, 'v_nom,v_nom,v_prenoms,v_nom_complet', 'v_nom,v_prenoms,v_nom_complet');
  if position('nom_famille' in v_def) > 0 then raise exception 'register_beneficiaire_particulier still references nom_famille'; end if;
  execute v_def;

  v_def := pg_get_functiondef('public.sync_proprietaire_portal_client()'::regprocedure);
  v_def := replace(v_def, 'civilite, nom_famille, prenoms, nom_complet, nom,', 'civilite, prenoms, nom_complet, nom,');
  v_def := replace(v_def, 'v_mirror_id, NULL, NEW.civilite, NEW.nom, NEW.prenoms, v_name, NEW.nom,', 'v_mirror_id, NULL, NEW.civilite, NEW.prenoms, v_name, NEW.nom,');
  v_def := replace(v_def, 'nom_famille = COALESCE(NEW.nom,nom_famille),', '');
  if position('nom_famille' in v_def) > 0 then raise exception 'sync_proprietaire_portal_client still references nom_famille'; end if;
  execute v_def;

  v_def := pg_get_functiondef('public.uppercase_person_names()'::regprocedure);
  v_def := replace(v_def, 'new.nom_famille', 'new.nom');
  if position('nom_famille' in v_def) > 0 then raise exception 'uppercase_person_names still references nom_famille'; end if;
  execute v_def;

  v_def := pg_get_functiondef('public.validate_client_contact_role_duplicates()'::regprocedure);
  v_def := replace(v_def, 'NEW.prenoms,NEW.nom_famille', 'NEW.nom,NEW.prenoms');
  v_def := replace(v_def, 'existing.prenoms,existing.nom_famille', 'existing.nom,existing.prenoms');
  if position('nom_famille' in v_def) > 0 then raise exception 'validate_client_contact_role_duplicates still references nom_famille'; end if;
  execute v_def;
end
$migration$;
