-- Le transfert de plantation est une opération métier dédiée, pas une édition de fiche.
-- Il reste réservé au service client habilité et ne doit pas contourner la lecture seule du PDG.
CREATE OR REPLACE FUNCTION public.transfer_agricapital_plantation(p_plantation_id uuid, p_client_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  v_actor uuid := auth.uid();
  v_internal_client uuid;
  v_target public.clients%rowtype;
  v_plantation public.plantations%rowtype;
begin
  if v_actor is null then
    raise exception 'Authentification requise';
  end if;

  if private.crm_is_global_admin(v_actor) then
    raise exception 'Le transfert de plantation ne peut pas être déclenché depuis le compte PDG';
  end if;

  if not exists (
    select 1
    from public.user_roles ur
    where ur.user_id = v_actor
      and ur.role in ('service_client', 'chef_equipe_service_client')
  ) then
    raise exception 'Permission insuffisante pour transférer une plantation';
  end if;

  select c.id into v_internal_client
  from public.clients c
  where c.is_internal = true
  limit 1;
  if v_internal_client is null then
    raise exception 'Le bénéficiaire AgriCapital interne est introuvable';
  end if;

  select * into v_target
  from public.clients
  where id = p_client_id;
  if not found then
    raise exception 'Client bénéficiaire introuvable';
  end if;
  if v_target.is_internal then
    raise exception 'Choisissez un client destinataire, pas le compte interne';
  end if;
  if not (
    upper(coalesce(v_target.famille_offre, '')) = 'PALMINVEST'
    or upper(coalesce(v_target.formule_code, '')) like '%PALMINVEST%'
    or upper(coalesce(v_target.formule_nom, '')) like '%PALMINVEST%'
  ) then
    raise exception 'Le transfert est réservé aux clients PalmInvest';
  end if;

  select * into v_plantation
  from public.plantations
  where id = p_plantation_id
  for update;
  if not found then
    raise exception 'Plantation introuvable';
  end if;
  if v_plantation.client_id is distinct from v_internal_client then
    raise exception 'Seules les plantations actuellement détenues par AgriCapital peuvent être transférées';
  end if;

  update public.plantations
  set client_id = p_client_id, updated_at = now()
  where id = p_plantation_id;

  if v_plantation.lot_id is not null then
    update public.lots_hectares
    set client_id = p_client_id,
        statut = 'attribue',
        date_attribution = coalesce(date_attribution, current_date)
    where id = v_plantation.lot_id
      and (client_id is null or client_id = v_internal_client);
  end if;

  update public.beneficiaire_attributions
  set client_id = p_client_id, updated_at = now()
  where plantation_id = p_plantation_id
    and client_id = v_internal_client;

  update public.clients
  set nombre_plantations = (
        select count(*)::int from public.plantations where client_id = v_internal_client
      ),
      total_hectares = (
        select coalesce(sum(superficie_ha), 0) from public.plantations where client_id = v_internal_client
      )
  where id = v_internal_client;

  update public.clients
  set nombre_plantations = (
        select count(*)::int from public.plantations where client_id = p_client_id
      ),
      total_hectares = (
        select coalesce(sum(superficie_ha), 0) from public.plantations where client_id = p_client_id
      )
  where id = p_client_id;

  return jsonb_build_object(
    'ok', true,
    'plantation_id', p_plantation_id,
    'client_id', p_client_id,
    'ancienne_entite', 'AgriCapital',
    'nouveau_beneficiaire', v_target.nom_complet
  );
end;
$function$;
