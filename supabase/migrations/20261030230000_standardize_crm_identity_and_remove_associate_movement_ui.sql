begin;

-- Preserve the canonical surname in the single "nom" field before removing
-- the legacy compatibility columns. Existing complete names remain intact.
update public.leads
set nom = coalesce(nullif(btrim(nom), ''), nullif(btrim(nom_famille), ''))
where nullif(btrim(nom), '') is null and nullif(btrim(nom_famille), '') is not null;

update public.prospects
set nom = coalesce(nullif(btrim(nom), ''), nullif(btrim(nom_famille), ''))
where nullif(btrim(nom), '') is null and nullif(btrim(nom_famille), '') is not null;

-- One legacy client row stored the full name in "nom" and the surname in
-- "nom_famille". Preserve the previous value in metadata for audit, then
-- normalize the record to Nom + Prénom.
update public.clients
set metadata = coalesce(metadata, '{}'::jsonb) ||
      jsonb_build_object('legacy_nom_before_identity_standardization', nom),
    nom = nullif(btrim(nom_famille), ''),
    nom_complet = coalesce(nullif(btrim(nom_complet), ''),
                           trim(concat_ws(' ', nullif(btrim(nom_famille), ''), nullif(btrim(prenoms), ''))))
where nullif(btrim(nom_famille), '') is not null
  and nullif(btrim(nom), '') is not null
  and btrim(nom) <> btrim(nom_famille);

update public.clients
set nom = coalesce(nullif(btrim(nom), ''), nullif(btrim(nom_famille), '')),
    nom_complet = coalesce(nullif(btrim(nom_complet), ''),
                           trim(concat_ws(' ', nullif(btrim(nom_famille), ''), nullif(btrim(prenoms), ''))))
where nullif(btrim(nom), '') is null and nullif(btrim(nom_famille), '') is not null;

update public.crm_parties
set nom = coalesce(nullif(btrim(nom), ''), nullif(btrim(nom_famille), ''))
where nullif(btrim(nom), '') is null and nullif(btrim(nom_famille), '') is not null;

-- Keep the client synthesis view working without exposing the legacy field.
do $$
declare
  v_definition text;
begin
  if to_regclass('public.v_client_synthese') is not null then
    v_definition := pg_get_viewdef('public.v_client_synthese'::regclass, true);
    v_definition := replace(v_definition, 'c_1.nom_famille,', '');
    execute 'create or replace view public.v_client_synthese as ' || v_definition;
  end if;
end $$;

-- Rewrite stored functions which still referenced the old column name.
-- Specific insert-list/value adjustments prevent duplicate "nom" targets.
do $$
declare
  r record;
  v_definition text;
begin
  for r in
    select p.oid, pg_get_functiondef(p.oid) as definition
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
      and p.prokind = 'f'
      and position('nom_famille' in pg_get_functiondef(p.oid)) > 0
  loop
    v_definition := replace(r.definition, 'nom_famille', 'nom');

    -- The old and current fields coexisted in these legacy INSERT statements.
    v_definition := replace(v_definition,
      'clients(nom,prenoms,nom_complet,nom,telephone',
      'clients(nom,prenoms,nom_complet,telephone');
    v_definition := replace(v_definition,
      'values(p.nom,p.prenoms,trim(concat_ws('' '',p.prenoms,p.nom)),trim(concat_ws('' '',p.prenoms,p.nom)),p.telephone',
      'values(p.nom,p.prenoms,trim(concat_ws('' '',p.nom,p.prenoms)),p.telephone');

    v_definition := replace(v_definition,
      'nom,nom,prenoms,nom_complet',
      'nom,prenoms,nom_complet');
    v_definition := replace(v_definition,
      'v_nom,v_nom,v_prenoms,v_nom_complet',
      'v_nom,v_prenoms,v_nom_complet');

    v_definition := replace(v_definition,
      'numero_enregistrement,nom,nombre_membres',
      'numero_enregistrement,nombre_membres');
    v_definition := replace(v_definition,
      'nullif(d->>''numero_enregistrement'',''''),v_nom,nullif(d->>''nombre_membres'','''')::integer',
      'nullif(d->>''numero_enregistrement'',''''),nullif(d->>''nombre_membres'','''')::integer');

    v_definition := replace(v_definition,
      'civilite, nom, prenoms, nom_complet, nom,',
      'civilite, nom, prenoms, nom_complet,');
    v_definition := replace(v_definition,
      'NEW.civilite, NEW.nom, NEW.prenoms, v_name, NEW.nom,',
      'NEW.civilite, NEW.nom, NEW.prenoms, v_name,');

    -- Prefer the canonical Nom then Prénom ordering in displayed full names.
    v_definition := replace(v_definition,
      'concat_ws('' '',c.prenoms,c.nom)',
      'concat_ws('' '',c.nom,c.prenoms)');
    v_definition := replace(v_definition,
      'concat_ws('' '',c.prenoms,c.nom)',
      'concat_ws('' '',c.nom,c.prenoms)');
    v_definition := replace(v_definition,
      'concat_ws('' '',NEW.prenoms,NEW.nom)',
      'concat_ws('' '',NEW.nom,NEW.prenoms)');

    execute v_definition;
  end loop;
end $$;

-- No CRM form, trigger or view may depend on this obsolete compatibility field.
alter table public.leads drop column if exists nom_famille;
alter table public.prospects drop column if exists nom_famille;
alter table public.clients drop column if exists nom_famille;
alter table public.crm_parties drop column if exists nom_famille;

commit;
