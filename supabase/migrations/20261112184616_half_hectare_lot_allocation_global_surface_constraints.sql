
ALTER TABLE public.lots_hectares ADD COLUMN IF NOT EXISTS surface_attribuee_ha numeric NOT NULL DEFAULT 0;
ALTER TABLE public.lots_hectares ADD COLUMN IF NOT EXISTS surface_disponible_ha numeric GENERATED ALWAYS AS (greatest(coalesce(surface_ha,0)-coalesce(surface_attribuee_ha,0),0)) STORED;
UPDATE public.lots_hectares l SET surface_attribuee_ha=least(coalesce(l.surface_ha,0),greatest(
 coalesce((SELECT sum(al.surface_ha) FROM public.acquisition_lots al LEFT JOIN public.acquisitions a ON a.id=al.acquisition_id WHERE al.lot_id=l.id AND (al.acquisition_id IS NULL OR lower(coalesce(a.statut,'')) NOT IN ('annule','annulee','annulée','cancelled','supprime','supprimee','supprimé','refuse','refusee','refusé'))),0),
 CASE WHEN l.client_id IS NOT NULL AND lower(coalesce(l.statut,''))='attribue' THEN coalesce(l.surface_ha,0) ELSE 0 END));
UPDATE public.lots_hectares SET statut=CASE WHEN surface_attribuee_ha>=coalesce(surface_ha,0)-0.000001 THEN 'attribue' ELSE 'partiellement_attribue' END WHERE client_id IS NULL AND surface_attribuee_ha>0;

ALTER TABLE public.lots_hectares DROP CONSTRAINT IF EXISTS lots_hectares_surface_half_check, DROP CONSTRAINT IF EXISTS lots_hectares_surface_attribuee_check;
ALTER TABLE public.lots_hectares ADD CONSTRAINT lots_hectares_surface_half_check CHECK (surface_ha IS NULL OR surface_ha=0 OR (surface_ha>=0.5 AND abs(surface_ha*2-round(surface_ha*2))<0.000001)),
ADD CONSTRAINT lots_hectares_surface_attribuee_check CHECK (surface_attribuee_ha>=0 AND surface_attribuee_ha<=coalesce(surface_ha,0)+0.000001 AND (surface_attribuee_ha=0 OR (surface_attribuee_ha>=0.5 AND abs(surface_attribuee_ha*2-round(surface_attribuee_ha*2))<0.000001)));

ALTER TABLE public.acquisition_lots DROP CONSTRAINT IF EXISTS acquisition_lots_surface_half_check;
ALTER TABLE public.acquisition_lots ADD CONSTRAINT acquisition_lots_surface_half_check CHECK (surface_ha IS NULL OR surface_ha=0 OR (surface_ha>=0.5 AND abs(surface_ha*2-round(surface_ha*2))<0.000001));

ALTER TABLE public.parcelles DROP CONSTRAINT IF EXISTS parcelles_surface_totale_half_check, DROP CONSTRAINT IF EXISTS parcelles_surface_components_half_check;
ALTER TABLE public.parcelles ADD CONSTRAINT parcelles_surface_totale_half_check CHECK (surface_totale_ha IS NULL OR surface_totale_ha=0 OR (surface_totale_ha>=0.5 AND abs(surface_totale_ha*2-round(surface_totale_ha*2))<0.000001 AND (convention_id IS NULL OR (surface_totale_ha>=2 AND abs(surface_totale_ha/2-round(surface_totale_ha/2))<0.000001)))),
ADD CONSTRAINT parcelles_surface_components_half_check CHECK (
(surface_proprietaire_ha IS NULL OR (surface_proprietaire_ha>=0 AND abs(surface_proprietaire_ha*2-round(surface_proprietaire_ha*2))<0.000001))
AND (surface_agricapital_ha IS NULL OR (surface_agricapital_ha>=0 AND abs(surface_agricapital_ha*2-round(surface_agricapital_ha*2))<0.000001))
AND (surface_attribuee_ha IS NULL OR (surface_attribuee_ha>=0 AND abs(surface_attribuee_ha*2-round(surface_attribuee_ha*2))<0.000001))
AND (surface_disponible_ha IS NULL OR (surface_disponible_ha>=0 AND abs(surface_disponible_ha*2-round(surface_disponible_ha*2))<0.000001))
AND (plantation_surface_cible_ha IS NULL OR (plantation_surface_cible_ha>=0 AND abs(plantation_surface_cible_ha*2-round(plantation_surface_cible_ha*2))<0.000001)));

ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_total_hectares_half_check;
ALTER TABLE public.clients ADD CONSTRAINT clients_total_hectares_half_check CHECK (total_hectares IS NULL OR total_hectares=0 OR (total_hectares>=0.5 AND abs(total_hectares*2-round(total_hectares*2))<0.000001));
ALTER TABLE public.proprietaires_terres DROP CONSTRAINT IF EXISTS proprietaires_terres_surface_two_hectare_check;
ALTER TABLE public.proprietaires_terres ADD CONSTRAINT proprietaires_terres_surface_two_hectare_check CHECK (
(surface_totale_ha IS NULL OR surface_totale_ha=0 OR (surface_totale_ha>=2 AND abs(surface_totale_ha/2-round(surface_totale_ha/2))<0.000001))
AND (surface_totale_declaree_ha IS NULL OR surface_totale_declaree_ha=0 OR (surface_totale_declaree_ha>=2 AND abs(surface_totale_declaree_ha/2-round(surface_totale_declaree_ha/2))<0.000001)));
ALTER TABLE public.plantation_activations DROP CONSTRAINT IF EXISTS plantation_activations_surface_half_check;
ALTER TABLE public.plantation_activations ADD CONSTRAINT plantation_activations_surface_half_check CHECK (
(surface_client_ha IS NULL OR (surface_client_ha>=0.5 AND abs(surface_client_ha*2-round(surface_client_ha*2))<0.000001))
AND (surface_proprietaire_ha IS NULL OR (surface_proprietaire_ha>=0.5 AND abs(surface_proprietaire_ha*2-round(surface_proprietaire_ha*2))<0.000001)));

CREATE OR REPLACE FUNCTION public.update_parcelle_attribution()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_parcelle_id uuid; v_attribue numeric;
BEGIN
 v_parcelle_id:=coalesce(NEW.parcelle_id,OLD.parcelle_id);
 IF v_parcelle_id IS NOT NULL THEN
  SELECT coalesce(sum(CASE WHEN coalesce(l.surface_attribuee_ha,0)>0 THEN l.surface_attribuee_ha WHEN l.client_id IS NOT NULL AND lower(coalesce(l.statut,''))='attribue' THEN coalesce(l.surface_ha,0) ELSE 0 END),0)
   INTO v_attribue FROM public.lots_hectares l WHERE l.parcelle_id=v_parcelle_id;
  UPDATE public.parcelles SET surface_attribuee_ha=v_attribue,updated_at=now() WHERE id=v_parcelle_id;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END
$function$;

CREATE OR REPLACE FUNCTION public.sync_lot_attribution()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
 IF TG_OP='UPDATE' AND OLD.client_id IS NOT DISTINCT FROM NEW.client_id AND OLD.surface_ha IS NOT DISTINCT FROM NEW.surface_ha THEN RETURN NEW; END IF;
 IF NEW.client_id IS NOT NULL THEN
  IF coalesce(NEW.surface_attribuee_ha,0)>0 AND NEW.surface_attribuee_ha<coalesce(NEW.surface_ha,0)-0.000001 AND OLD.client_id IS NULL THEN
   RAISE EXCEPTION 'Ce lot contient déjà une attribution partielle; il ne peut pas être attribué en bloc.';
  END IF;
  IF TG_OP='UPDATE' AND OLD.client_id IS NOT NULL AND OLD.client_id IS DISTINCT FROM NEW.client_id THEN
   DELETE FROM public.acquisition_lots WHERE lot_id=NEW.id AND client_id=OLD.client_id;
  END IF;
  UPDATE public.lots_hectares SET statut='attribue',date_attribution=coalesce(date_attribution,current_date),surface_attribuee_ha=coalesce(surface_ha,0),updated_at=now()
   WHERE id=NEW.id AND (statut IS DISTINCT FROM 'attribue' OR date_attribution IS NULL OR surface_attribuee_ha IS DISTINCT FROM coalesce(surface_ha,0));
  INSERT INTO public.acquisition_lots(client_id,lot_id,date_attribution,surface_ha) VALUES(NEW.client_id,NEW.id,coalesce(NEW.date_attribution,current_date),NEW.surface_ha)
   ON CONFLICT(client_id,lot_id) DO UPDATE SET date_attribution=excluded.date_attribution,surface_ha=greatest(coalesce(acquisition_lots.surface_ha,0),coalesce(excluded.surface_ha,0));
 ELSE
  IF TG_OP='UPDATE' AND OLD.client_id IS NOT NULL THEN
   DELETE FROM public.acquisition_lots WHERE lot_id=NEW.id AND client_id=OLD.client_id;
   UPDATE public.lots_hectares SET statut='disponible',date_attribution=NULL,surface_attribuee_ha=0,updated_at=now() WHERE id=NEW.id;
  ELSIF coalesce(NEW.surface_attribuee_ha,0)>0 THEN
   UPDATE public.lots_hectares SET statut=CASE WHEN surface_attribuee_ha>=coalesce(surface_ha,0)-0.000001 THEN 'attribue' ELSE 'partiellement_attribue' END,updated_at=now()
    WHERE id=NEW.id AND statut IS DISTINCT FROM CASE WHEN surface_attribuee_ha>=coalesce(surface_ha,0)-0.000001 THEN 'attribue' ELSE 'partiellement_attribue' END;
  ELSE
   DELETE FROM public.acquisition_lots WHERE lot_id=NEW.id;
   UPDATE public.lots_hectares SET statut='disponible',date_attribution=NULL,updated_at=now() WHERE id=NEW.id AND (statut IS DISTINCT FROM 'disponible' OR date_attribution IS NOT NULL);
  END IF;
 END IF;
 RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION public.validate_client_acquisition_foncier()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
 v_lot public.lots_hectares%rowtype; v_parcelle public.parcelles%rowtype;
 v_allocation jsonb; v_allocation_lot public.lots_hectares%rowtype;
 v_amount numeric; v_total numeric:=0; v_first_lot_id uuid; v_first_convention_id uuid;
 v_expected_lot_number integer; v_allocation_count integer:=0; v_family text;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF OLD.client_id IS DISTINCT FROM NEW.client_id OR OLD.lot_id IS DISTINCT FROM NEW.lot_id OR OLD.parcelle_id IS DISTINCT FROM NEW.parcelle_id OR OLD.necessite_foncier_client IS DISTINCT FROM NEW.necessite_foncier_client THEN
   RAISE EXCEPTION 'L’affectation foncière d’une acquisition enregistrée ne peut pas être modifiée directement.';
  END IF;
  RETURN NEW;
 END IF;
 IF NEW.necessite_foncier_client THEN
  IF NEW.lot_id IS NOT NULL THEN RAISE EXCEPTION 'Une offre sur terrain propre ne peut pas réserver un lot partenaire.'; END IF;
  RETURN NEW;
 END IF;
 IF NEW.lot_id IS NULL THEN RAISE EXCEPTION 'Une offre partenaire doit être liée à un lot disponible.'; END IF;
 v_family:=regexp_replace(upper(coalesce(NEW.famille_offre,'')||' '||coalesce(NEW.offre_code,'')),'[-_[:space:]]','','g');
 IF jsonb_typeof(coalesce(NEW.metadata->'lot_allocations','[]'::jsonb))='array' AND jsonb_array_length(coalesce(NEW.metadata->'lot_allocations','[]'::jsonb))>0 THEN
  FOR v_allocation IN SELECT value FROM jsonb_array_elements(NEW.metadata->'lot_allocations')
  LOOP
   SELECT * INTO v_allocation_lot FROM public.lots_hectares WHERE id=(v_allocation->>'lot_id')::uuid FOR UPDATE;
   IF v_allocation_lot.id IS NULL THEN RAISE EXCEPTION 'Un des lots de la série est introuvable.'; END IF;
   IF v_allocation_count=0 THEN v_first_lot_id:=v_allocation_lot.id; v_first_convention_id:=v_allocation_lot.convention_id;
   ELSIF v_allocation_lot.convention_id IS DISTINCT FROM v_first_convention_id OR v_allocation_lot.numero_h<>v_expected_lot_number THEN
    RAISE EXCEPTION 'Les lots sélectionnés doivent être contigus et appartenir à la même convention foncière.';
   END IF;
   IF v_allocation_lot.parcelle_id IS DISTINCT FROM NEW.parcelle_id OR coalesce(v_allocation_lot.part_type,'agricapital')<>'agricapital'
    OR v_allocation_lot.client_id IS NOT NULL OR v_allocation_lot.acquisition_id IS NOT NULL
    OR lower(coalesce(v_allocation_lot.statut,'')) NOT IN ('disponible','libre','partiellement_attribue') THEN
    RAISE EXCEPTION 'Un des lots de la série n’est plus disponible pour cette acquisition.';
   END IF;
   v_amount:=coalesce((v_allocation->>'surface_ha')::numeric,0);
   IF v_family LIKE '%PALMINVEST%' THEN
    IF abs(v_amount-1)>0.000001 THEN RAISE EXCEPTION 'PalmInvest exige un lot entier de 1 ha.'; END IF;
   ELSIF v_amount<0.5 OR abs(v_amount*2-round(v_amount*2))>0.000001 THEN
    RAISE EXCEPTION 'Chaque quote-part doit être un multiple de 0,50 ha.';
   END IF;
   IF v_amount>coalesce(v_allocation_lot.surface_disponible_ha,0)+0.000001 THEN
    RAISE EXCEPTION 'La quote-part demandée dépasse la superficie encore disponible du lot %.',v_allocation_lot.reference;
   END IF;
   IF NOT EXISTS(SELECT 1 FROM public.conventions_foncieres cf WHERE cf.id=v_allocation_lot.convention_id AND cf.parcelle_id=v_allocation_lot.parcelle_id AND cf.statut='active') THEN
    RAISE EXCEPTION 'Chaque lot doit dépendre d’une convention foncière active.';
   END IF;
   v_total:=v_total+v_amount; v_expected_lot_number:=v_allocation_lot.numero_h+1; v_allocation_count:=v_allocation_count+1;
  END LOOP;
  IF v_first_lot_id IS DISTINCT FROM NEW.lot_id OR abs(v_total-coalesce(NEW.superficie_ha,0))>0.000001 THEN
   RAISE EXCEPTION 'La somme des quotes-parts des lots doit correspondre exactement à la superficie de l’acquisition.';
  END IF;
  SELECT * INTO v_parcelle FROM public.parcelles WHERE id=NEW.parcelle_id;
  IF v_parcelle.id IS NULL OR v_parcelle.proprietaire_id IS NULL THEN RAISE EXCEPTION 'Le propriétaire partenaire doit être enregistré.'; END IF;
  RETURN NEW;
 END IF;
 SELECT * INTO v_lot FROM public.lots_hectares WHERE id=NEW.lot_id;
 IF v_lot.id IS NULL OR v_lot.parcelle_id IS NULL THEN RAISE EXCEPTION 'Lot partenaire introuvable ou sans parcelle.'; END IF;
 IF v_lot.client_id IS NOT NULL OR v_lot.acquisition_id IS NOT NULL OR lower(coalesce(v_lot.statut,'')) NOT IN ('disponible','libre','partiellement_attribue') OR coalesce(v_lot.surface_disponible_ha,0)<=0 THEN
  RAISE EXCEPTION 'Le lot n’est plus disponible ou est réservé à une autre acquisition.';
 END IF;
 SELECT * INTO v_parcelle FROM public.parcelles WHERE id=v_lot.parcelle_id;
 IF v_parcelle.id IS NULL OR v_parcelle.proprietaire_id IS NULL THEN RAISE EXCEPTION 'Le propriétaire partenaire doit être enregistré.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.conventions_foncieres cf WHERE cf.id=v_lot.convention_id AND cf.parcelle_id=v_lot.parcelle_id AND cf.statut='active') THEN
  RAISE EXCEPTION 'Le lot doit dépendre d’une convention foncière active.';
 END IF;
 IF NEW.parcelle_id IS DISTINCT FROM v_lot.parcelle_id THEN RAISE EXCEPTION 'La parcelle de l’acquisition ne correspond pas au lot réservé.'; END IF;
 RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION public.release_client_acquisition_lot_allocations()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_allocation jsonb; v_lot_id uuid; v_amount numeric; v_lot public.lots_hectares%rowtype;
BEGIN
 IF lower(coalesce(NEW.statut,'')) IN ('annule','annulee','annulée','cancelled','supprime','supprimee','supprimé','refuse','refusee','refusé')
 AND lower(coalesce(OLD.statut,'')) NOT IN ('annule','annulee','annulée','cancelled','supprime','supprimee','supprimé','refuse','refusee','refusé')
 AND jsonb_typeof(coalesce(NEW.metadata->'lot_allocations','[]'::jsonb))='array'
 AND jsonb_array_length(coalesce(NEW.metadata->'lot_allocations','[]'::jsonb))>0 THEN
  FOR v_allocation IN SELECT value FROM jsonb_array_elements(NEW.metadata->'lot_allocations')
  LOOP
   v_lot_id:=(v_allocation->>'lot_id')::uuid; v_amount:=coalesce((v_allocation->>'surface_ha')::numeric,0);
   SELECT * INTO v_lot FROM public.lots_hectares WHERE id=v_lot_id FOR UPDATE;
   IF NOT FOUND THEN CONTINUE; END IF;
   IF v_lot.client_id=NEW.client_id AND v_lot.acquisition_id=NEW.id THEN
    UPDATE public.lots_hectares SET client_id=NULL,acquisition_id=NULL,statut='disponible',date_attribution=NULL,surface_attribuee_ha=0,updated_at=now() WHERE id=v_lot_id;
   ELSE
    UPDATE public.lots_hectares SET surface_attribuee_ha=greatest(0,surface_attribuee_ha-v_amount),
     statut=CASE WHEN greatest(0,surface_attribuee_ha-v_amount)<=0.000001 THEN 'disponible'
                 WHEN greatest(0,surface_attribuee_ha-v_amount)>=coalesce(surface_ha,0)-0.000001 THEN 'attribue' ELSE 'partiellement_attribue' END,
     date_attribution=CASE WHEN greatest(0,surface_attribuee_ha-v_amount)<=0.000001 THEN NULL ELSE date_attribution END,updated_at=now()
     WHERE id=v_lot_id;
    UPDATE public.acquisition_lots SET surface_ha=greatest(0,coalesce(surface_ha,0)-v_amount) WHERE client_id=NEW.client_id AND lot_id=v_lot_id;
    DELETE FROM public.acquisition_lots WHERE client_id=NEW.client_id AND lot_id=v_lot_id AND coalesce(surface_ha,0)<=0.000001;
   END IF;
  END LOOP;
 END IF;
 RETURN NEW;
END
$function$;
REVOKE ALL ON FUNCTION public.release_client_acquisition_lot_allocations() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_release_client_acquisition_lot_allocations ON public.acquisitions;
CREATE TRIGGER trg_release_client_acquisition_lot_allocations AFTER UPDATE OF statut ON public.acquisitions FOR EACH ROW EXECUTE FUNCTION public.release_client_acquisition_lot_allocations();

DO $do$
DECLARE v_definition text; v_old text; v_new text;
BEGIN
 SELECT pg_get_functiondef('public.create_client_acquisition(uuid,uuid,text,numeric,text,uuid,uuid,text)'::regprocedure) INTO v_definition;
 v_old := $old$  v_last_lot_number integer;
$old$;
 v_new := $new$  v_last_lot_number integer;
  v_offer_family text := '';
  v_lot_allocations jsonb := '[]'::jsonb;
  v_candidate record;
  v_remaining numeric := 0;
  v_take numeric := 0;
  v_expected_lot_number integer;
  v_allocation jsonb;
  v_allocation_lot_id uuid;
  v_allocation_surface numeric;
$new$;
 IF position(v_old IN v_definition)=0 THEN RAISE EXCEPTION 'Déclaration des variables de lots introuvable'; END IF;
 v_definition:=replace(v_definition,v_old,v_new);

 v_old := $old$  if v_offer.id is null then raise exception 'L’offre choisie n’est plus active'; end if;
$old$;
 v_new := $new$  if v_offer.id is null then raise exception 'L’offre choisie n’est plus active'; end if;
  v_offer_family:=regexp_replace(upper(coalesce(v_offer.famille_offre,'')||' '||coalesce(v_offer.code,'')),'[-_[:space:]]','','g');
  if v_offer_family like '%PALMINVEST%' then
   if v_surface<1 or abs(v_surface-round(v_surface))>0.000001 then raise exception 'PalmInvest exige des lots entiers de 1 ha minimum.'; end if;
  elsif v_surface<0.5 or abs(v_surface*2-round(v_surface*2))>0.000001 then
   raise exception 'La superficie minimale est de 0,50 ha, par pas de 0,50 ha.';
  end if;
$new$;
 IF position(v_old IN v_definition)=0 THEN RAISE EXCEPTION 'Validation de l’offre active introuvable'; END IF;
 v_definition:=replace(v_definition,v_old,v_new);

 v_old := $old$    if v_lot.client_id is not null or lower(coalesce(v_lot.statut,'')) not in ('disponible','libre') or v_lot.acquisition_id is not null then
$old$;
 v_new := $new$    if v_lot.client_id is not null or lower(coalesce(v_lot.statut,'')) not in ('disponible','libre','partiellement_attribue') or v_lot.acquisition_id is not null or coalesce(v_lot.surface_disponible_ha,0)<=0 then
$new$;
 IF position(v_old IN v_definition)=0 THEN RAISE EXCEPTION 'Contrôle de disponibilité du lot introuvable'; END IF;
 v_definition:=replace(v_definition,v_old,v_new);

 v_old := $old$    if upper(coalesce(v_offer.famille_offre,v_offer.code,''))='PALMINVEST' then
$old$;
 v_new := $new$    if v_offer_family like '%PALMINVEST%' then
$new$;
 IF position(v_old IN v_definition)=0 THEN RAISE EXCEPTION 'Branche PalmInvest introuvable'; END IF;
 v_definition:=replace(v_definition,v_old,v_new);

 v_old := $old$    else
      if abs(coalesce(v_lot.surface_ha,0)-v_surface)>0.0001 then
        raise exception 'La superficie demandée doit correspondre à la superficie du lot sélectionné.';
      end if;
      v_available_lot_ids:=array[p_lot_id]::uuid[];
      v_available_lot_count:=1;
      v_first_lot_number:=v_lot.numero_h;
      v_last_lot_number:=v_lot.numero_h;
    end if;
$old$;
 v_new := $new$    else
      v_remaining:=v_surface; v_available_lot_ids:=ARRAY[]::uuid[]; v_available_lot_count:=0;
      v_lot_allocations:='[]'::jsonb; v_expected_lot_number:=NULL;
      FOR v_candidate IN
       SELECT l.id,l.numero_h,l.reference,l.surface_ha,l.surface_disponible_ha
       FROM public.lots_hectares l
       WHERE l.parcelle_id=v_parcelle.id AND l.convention_id IS NOT DISTINCT FROM v_lot.convention_id
        AND coalesce(l.part_type,'agricapital')='agricapital' AND l.client_id IS NULL AND l.acquisition_id IS NULL
        AND lower(coalesce(l.statut,'')) IN ('disponible','libre','partiellement_attribue')
        AND l.numero_h>=v_lot.numero_h AND coalesce(l.surface_disponible_ha,0)>0
       ORDER BY l.numero_h FOR UPDATE
      LOOP
       IF v_available_lot_count=0 THEN
        IF v_candidate.id IS DISTINCT FROM p_lot_id THEN RAISE EXCEPTION 'Le lot de départ n’est plus disponible. Actualisez la liste.'; END IF;
        v_first_lot_number:=v_candidate.numero_h;
       ELSIF v_candidate.numero_h<>v_expected_lot_number THEN EXIT;
       END IF;
       v_take:=least(v_remaining,v_candidate.surface_disponible_ha);
       IF v_take>0 THEN
        v_available_lot_ids:=array_append(v_available_lot_ids,v_candidate.id);
        v_lot_allocations:=v_lot_allocations||jsonb_build_array(jsonb_build_object('lot_id',v_candidate.id,'surface_ha',v_take,'reference',v_candidate.reference,'numero_h',v_candidate.numero_h));
        v_available_lot_count:=v_available_lot_count+1; v_last_lot_number:=v_candidate.numero_h;
        v_remaining:=round((v_remaining-v_take)::numeric,6); v_expected_lot_number:=v_candidate.numero_h+1;
       END IF;
       EXIT WHEN v_remaining<=0.000001;
      END LOOP;
      IF v_available_lot_count=0 OR v_remaining>0.000001 THEN RAISE EXCEPTION 'Lots contigus insuffisants pour réserver % ha. Choisissez un autre lot de départ ou une autre parcelle.',v_surface; END IF;
    end if;
$new$;
 IF position(v_old IN v_definition)=0 THEN RAISE EXCEPTION 'Branche de sélection des lots non PalmInvest introuvable'; END IF;
 v_definition:=replace(v_definition,v_old,v_new);

 v_old := $old$      if coalesce(v_available_lot_count,0)<>v_required_lots
         or v_first_lot_number is distinct from v_lot.numero_h
         or v_last_lot_number-v_first_lot_number+1<>v_required_lots
         or v_available_lot_ids[1] is distinct from p_lot_id then
        raise exception 'Il faut sélectionner un début de série disposant de % lots contigus de 1 ha. Aucun lot ne sera attribué tant que la série complète n’est pas disponible.',v_required_lots;
      end if;
    else
$old$;
 v_new := $new$      if coalesce(v_available_lot_count,0)<>v_required_lots
         or v_first_lot_number is distinct from v_lot.numero_h
         or v_last_lot_number-v_first_lot_number+1<>v_required_lots
         or v_available_lot_ids[1] is distinct from p_lot_id then
        raise exception 'Il faut sélectionner un début de série disposant de % lots contigus de 1 ha. Aucun lot ne sera attribué tant que la série complète n’est pas disponible.',v_required_lots;
      end if;
      SELECT coalesce(jsonb_agg(jsonb_build_object('lot_id',l.id,'surface_ha',1,'reference',l.reference,'numero_h',l.numero_h) ORDER BY l.numero_h),'[]'::jsonb)
        INTO v_lot_allocations FROM public.lots_hectares l WHERE l.id=ANY(v_available_lot_ids);
    else
$new$;
 IF position(v_old IN v_definition)=0 THEN RAISE EXCEPTION 'Fin de la sélection PalmInvest introuvable'; END IF;
 v_definition:=replace(v_definition,v_old,v_new);

 v_old := $old$      'lot_ids',to_jsonb(coalesce(v_available_lot_ids,array[]::uuid[])),
      'lot_references',$old$;
 v_new := $new$      'lot_ids',to_jsonb(coalesce(v_available_lot_ids,array[]::uuid[])),
      'lot_allocations',coalesce(v_lot_allocations,'[]'::jsonb),
      'lot_references',$new$;
 IF position(v_old IN v_definition)=0 THEN RAISE EXCEPTION 'Métadonnées de lots introuvables'; END IF;
 v_definition:=replace(v_definition,v_old,v_new);

 v_old := $old$  if p_lot_id is not null then
    if v_available_lot_ids is null then
      v_available_lot_ids:=array[p_lot_id]::uuid[];
      v_available_lot_count:=1;
      v_first_lot_number:=v_lot.numero_h;
      v_last_lot_number:=v_lot.numero_h;
    end if;
    update public.lots_hectares set client_id=v_client.id,statut='attribue',
      date_attribution=coalesce(date_attribution,current_date),acquisition_id=v_acquisition_id,updated_at=now()
    where id=any(v_available_lot_ids);
    insert into public.acquisition_lots(client_id,lot_id,surface_ha,notes,created_by,acquisition_id)
    select v_client.id,l.id,coalesce(l.surface_ha,1),'Attribution de lot(s) à la souscription '||v_acquisition_id::text,v_user,v_acquisition_id
      from public.lots_hectares l where l.id=any(v_available_lot_ids)
    on conflict (client_id,lot_id) do update
      set acquisition_id=excluded.acquisition_id,surface_ha=excluded.surface_ha,notes=excluded.notes;
  end if;
$old$;
 v_new := $new$  if p_lot_id is not null then
   if v_offer_family like '%PALMINVEST%' then
    if v_available_lot_ids is null then
     v_available_lot_ids:=array[p_lot_id]::uuid[]; v_available_lot_count:=1;
     v_first_lot_number:=v_lot.numero_h; v_last_lot_number:=v_lot.numero_h;
    end if;
    update public.lots_hectares set client_id=v_client.id,statut='attribue',
     date_attribution=coalesce(date_attribution,current_date),acquisition_id=v_acquisition_id,updated_at=now()
    where id=any(v_available_lot_ids);
    insert into public.acquisition_lots(client_id,lot_id,surface_ha,notes,created_by,acquisition_id)
    select v_client.id,l.id,coalesce(l.surface_ha,1),'Attribution de lot(s) à la souscription '||v_acquisition_id::text,v_user,v_acquisition_id
    from public.lots_hectares l where l.id=any(v_available_lot_ids)
    on conflict(client_id,lot_id) do update set acquisition_id=excluded.acquisition_id,surface_ha=excluded.surface_ha,notes=excluded.notes;
   else
    FOR v_allocation IN SELECT value FROM jsonb_array_elements(coalesce(v_lot_allocations,'[]'::jsonb))
    LOOP
     v_allocation_lot_id:=(v_allocation->>'lot_id')::uuid; v_allocation_surface:=coalesce((v_allocation->>'surface_ha')::numeric,0);
     INSERT INTO public.acquisition_lots(client_id,lot_id,date_attribution,surface_ha,notes,created_by,acquisition_id)
     VALUES(v_client.id,v_allocation_lot_id,current_date,v_allocation_surface,'Quote-part de '||v_allocation_surface||' ha dans la souscription '||v_acquisition_id::text,v_user,NULL)
     ON CONFLICT(client_id,lot_id) DO UPDATE SET surface_ha=coalesce(acquisition_lots.surface_ha,0)+excluded.surface_ha,acquisition_id=NULL,notes=concat_ws(' ; ',nullif(acquisition_lots.notes,''),excluded.notes);
     UPDATE public.lots_hectares SET surface_attribuee_ha=surface_attribuee_ha+v_allocation_surface,
      statut=CASE WHEN surface_attribuee_ha+v_allocation_surface>=coalesce(surface_ha,0)-0.000001 THEN 'attribue' ELSE 'partiellement_attribue' END,
      date_attribution=coalesce(date_attribution,current_date),updated_at=now()
     WHERE id=v_allocation_lot_id AND surface_disponible_ha+0.000001>=v_allocation_surface;
     IF NOT FOUND THEN RAISE EXCEPTION 'La disponibilité du lot a changé pendant la réservation. Aucun dossier ne sera conservé.'; END IF;
    END LOOP;
   end if;
  end if;
$new$;
 IF position(v_old IN v_definition)=0 THEN RAISE EXCEPTION 'Bloc d''attribution des lots après acquisition introuvable'; END IF;
 v_definition:=replace(v_definition,v_old,v_new);
 EXECUTE v_definition;
END
$do$;
