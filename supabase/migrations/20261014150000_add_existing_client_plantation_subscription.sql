-- Add a separate lot/subscription to an existing client without creating a duplicate client
-- or a plantation before the technical mise-en-terre is validated.
create or replace function public.register_additional_client_lot(
  p_client_id uuid,
  p_lot_id uuid,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_user uuid := auth.uid();
  v_client public.clients%rowtype;
  v_lot public.lots_hectares%rowtype;
  v_acquisition_id uuid;
begin
  if v_user is null or not public.is_staff(v_user) then
    raise exception 'Accès réservé au personnel AgriCapital';
  end if;

  select * into v_client from public.clients where id = p_client_id for update;
  if v_client.id is null then raise exception 'Client introuvable'; end if;

  select * into v_lot from public.lots_hectares where id = p_lot_id for update;
  if v_lot.id is null then raise exception 'Lot introuvable'; end if;
  if v_lot.client_id is not null or lower(coalesce(v_lot.statut, '')) not in ('disponible', 'libre') then
    raise exception 'Ce lot n’est plus disponible. Actualisez la liste et choisissez un autre lot.';
  end if;
  if v_lot.parcelle_id is null then raise exception 'Le lot doit être rattaché à une parcelle.'; end if;
  if coalesce(v_lot.surface_ha, 0) <= 0 then raise exception 'La superficie du lot doit être positive.'; end if;
  if exists (select 1 from public.acquisition_lots where lot_id = v_lot.id) then
    raise exception 'Ce lot est déjà enregistré dans une souscription.';
  end if;

  insert into public.acquisition_lots(client_id, lot_id, date_attribution, surface_ha, notes, created_by)
  values (v_client.id, v_lot.id, current_date, v_lot.surface_ha, nullif(trim(coalesce(p_notes, '')), ''), v_user)
  returning id into v_acquisition_id;

  update public.lots_hectares
  set client_id = v_client.id, statut = 'attribue',
      date_attribution = coalesce(date_attribution, current_date)
  where id = v_lot.id;

  update public.clients
  set total_hectares = coalesce(total_hectares, 0) + v_lot.surface_ha,
      parcelle_id = coalesce(parcelle_id, v_lot.parcelle_id),
      updated_by = v_user, updated_at = now()
  where id = v_client.id;

  return jsonb_build_object(
    'acquisition_lot_id', v_acquisition_id, 'client_id', v_client.id,
    'lot_id', v_lot.id, 'parcelle_id', v_lot.parcelle_id,
    'surface_ha', v_lot.surface_ha, 'status', 'attribue'
  );
end;
$function$;

revoke all on function public.register_additional_client_lot(uuid, uuid, text) from public;
grant execute on function public.register_additional_client_lot(uuid, uuid, text) to authenticated;

-- Each lot is its own future plantation. Do not merge a second lot into the
-- first plantation for the same client and parcel, and use the selected lot's area.
create or replace function public.create_plantation_after_mise_en_terre()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_client public.clients%rowtype;
  v_parcelle public.parcelles%rowtype;
  v_lot public.lots_hectares%rowtype;
  v_existing uuid;
  v_surface numeric;
  v_density integer;
  v_date date;
  v_name text;
  v_role text;
  v_active boolean;
  v_actor uuid;
begin
  if new.type_intervention <> 'mise_en_terre' or new.statut <> 'realisee' then return new; end if;
  if new.client_id is null or new.parcelle_id is null then
    raise exception 'La mise en terre doit être rattachée à un Client et à une parcelle';
  end if;

  select * into v_client from public.clients where id = new.client_id;
  if v_client.id is null then raise exception 'Client du parcours technique introuvable'; end if;
  select * into v_parcelle from public.parcelles where id = new.parcelle_id for update;
  if v_parcelle.id is null then raise exception 'Parcelle introuvable pour la mise en terre'; end if;

  v_role := 'beneficiaire';
  if new.lot_id is not null then
    select * into v_lot from public.lots_hectares l
    where l.id = new.lot_id and l.client_id = new.client_id and l.parcelle_id = new.parcelle_id
      and (new.convention_id is null or l.convention_id = new.convention_id);
    if v_lot.id is null or coalesce(v_lot.surface_ha, 0) <= 0 then
      raise exception 'Le lot sélectionné n’est pas attribué à ce Client ou sa superficie est invalide';
    end if;
    v_surface := v_lot.surface_ha;
  else
    v_surface := greatest(0, coalesce(v_client.total_hectares, 0));
  end if;

  if v_client.type_client = 'beneficiaire_particulier' and new.lot_id is null then
    select coalesce(max(ba.surface_attribuee_ha), v_surface),
           coalesce(max(ba.role_attribution), 'beneficiaire')
    into v_surface, v_role
    from public.beneficiaire_attributions ba
    where ba.client_id = v_client.id and ba.parcelle_id = v_parcelle.id and ba.statut = 'active';
  end if;
  if coalesce(v_surface, 0) <= 0 then
    raise exception 'La superficie du dossier Client ou du lot doit être renseignée avant la mise en terre';
  end if;

  v_active := coalesce(v_client.compte_actif, false)
    or v_client.paiement_initial_paye_at is not null or v_client.pi_paye_at is not null;
  v_density := coalesce(v_parcelle.plantation_densite_plants, 143);
  v_date := new.date_intervention::date;
  v_name := 'Plantation ' || coalesce(nullif(v_client.nom_complet, ''), v_client.id_unique);
  v_actor := coalesce(auth.uid(), v_client.created_by);

  select p.id into v_existing from public.plantations p
  where p.client_id = v_client.id and p.parcelle_id = v_parcelle.id
    and ((new.lot_id is not null and p.lot_id = new.lot_id)
      or (new.lot_id is null and p.lot_id is null))
  order by p.created_at desc limit 1;

  if v_existing is null then
    insert into public.plantations(
      client_id, parcelle_id, role_attribution, nom, nom_plantation,
      superficie_ha, superficie_activee, nombre_plants, densite_plants,
      district_id, region_id, departement_id, sous_prefecture_id,
      village, village_nom, localite, localisation_gps_lat, localisation_gps_lng,
      latitude, longitude, date_plantation, date_activation, statut, statut_global,
      type_culture, notes, created_by, updated_by, lot_id
    ) values (
      v_client.id, v_parcelle.id, v_role, v_name, v_name,
      v_surface, case when v_active then v_surface else 0 end,
      (v_surface * v_density)::integer, v_density,
      v_parcelle.district_id, v_parcelle.region_id, v_parcelle.departement_id, v_parcelle.sous_prefecture_id,
      v_parcelle.village, v_parcelle.village, v_parcelle.village,
      v_parcelle.localisation_gps_lat, v_parcelle.localisation_gps_lng,
      v_parcelle.localisation_gps_lat, v_parcelle.localisation_gps_lng,
      v_date, case when v_active then v_date else null end,
      case when v_active then 'actif' else 'en_attente_pi' end,
      case when v_active then 'actif' else 'en_attente_pi' end,
      coalesce(v_parcelle.plantation_type_culture, 'Palmier à huile'),
      case when v_active
        then 'Créée automatiquement après validation technique de la mise en terre.'
        else 'Créée automatiquement après validation technique de la mise en terre ; activation après validation du paiement initial.'
      end,
      v_actor, v_actor, new.lot_id
    ) returning id into v_existing;
  else
    update public.plantations
    set date_plantation = coalesce(date_plantation, v_date),
        date_activation = case when v_active then coalesce(date_activation, v_date) else null end,
        superficie_activee = case when v_active then superficie_ha else 0 end,
        nombre_plants = coalesce(nombre_plants, (superficie_ha * v_density)::integer),
        densite_plants = coalesce(densite_plants, v_density),
        lot_id = coalesce(lot_id, new.lot_id),
        statut = case when v_active then 'actif' else 'en_attente_pi' end,
        statut_global = case when v_active then 'actif' else 'en_attente_pi' end,
        updated_at = now()
    where id = v_existing;
  end if;

  update public.clients
  set parcelle_id = coalesce(parcelle_id, v_parcelle.id),
      nombre_plantations = (select count(*) from public.plantations
        where client_id = v_client.id and statut not in ('archive', 'supprime')),
      phase_actuelle = 'plantation', updated_at = now()
  where id = v_client.id;

  if v_client.type_client = 'beneficiaire_particulier' then
    insert into public.beneficiaire_attributions(
      client_id, parcelle_id, plantation_id, surface_attribuee_ha, role_attribution, statut, notes
    )
    select v_client.id, v_parcelle.id, v_existing, v_surface, v_role, 'active',
      'Rattachement automatique de la plantation individuelle à la parcelle.'
    where not exists (
      select 1 from public.beneficiaire_attributions ba
      where ba.client_id = v_client.id and ba.parcelle_id = v_parcelle.id
        and ba.plantation_id = v_existing and ba.statut = 'active'
    );
  end if;
  return new;
end;
$function$;
