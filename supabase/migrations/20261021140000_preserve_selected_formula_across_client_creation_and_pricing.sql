-- Preserve selected formula configuration throughout client creation, acquisition creation,
-- and scheduled financial recalculation. The offer code is the parcours, not a formula.

CREATE OR REPLACE FUNCTION public.sync_offre_fields_on_client()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare o record; f jsonb;
begin
  if new.offre_id is null then return new; end if;
  select * into o from public.offres where id=new.offre_id;
  if not found then return new; end if;
  new.famille_offre := o.famille_offre;
  new.parcours_code := coalesce(o.parcours_code, o.code);
  select item.value into f from jsonb_array_elements(coalesce(o.formules_configuration,'[]'::jsonb)) with ordinality as item(value,ord)
    where item.value->>'code'=new.formule_code order by item.ord limit 1;
  if f is null then
    select item.value into f from jsonb_array_elements(coalesce(o.formules_configuration,'[]'::jsonb)) with ordinality as item(value,ord)
      order by item.ord limit 1;
  end if;
  if f is not null then
    new.formule_code:=f->>'code'; new.formule_nom:=f->>'nom';
  else
    new.formule_code:=coalesce(new.formule_code,o.formule_code,o.code);
    new.formule_nom:=coalesce(new.formule_nom,o.formule_nom,o.nom);
  end if;
  return new;
end
$function$;

CREATE OR REPLACE FUNCTION public.trg_client_recompute()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_di numeric; v_total numeric; v_base_total numeric; v_duree int; v_taux numeric; v_mens numeric:=0; v_ha numeric; v_amount numeric; v_formula jsonb;
begin
  if coalesce(new.compte_actif,false)=true or new.offre_id is null then return new; end if;
  if tg_op='UPDATE' and new.offre_id is not distinct from old.offre_id
    and new.promotion_id is not distinct from old.promotion_id
    and new.total_hectares is not distinct from old.total_hectares
    and new.formule_code is not distinct from old.formule_code then return new; end if;

  select item.value into v_formula from public.offres o
    cross join lateral jsonb_array_elements(coalesce(o.formules_configuration,'[]'::jsonb)) as item(value)
    where o.id=new.offre_id and item.value->>'code'=new.formule_code limit 1;
  if v_formula is null then
    select item.value into v_formula from public.offres o
      cross join lateral jsonb_array_elements(coalesce(o.formules_configuration,'[]'::jsonb)) with ordinality as item(value,ord)
      where o.id=new.offre_id order by item.ord limit 1;
    if v_formula is not null then new.formule_code:=v_formula->>'code'; new.formule_nom:=v_formula->>'nom'; end if;
  end if;

  select duree_paiement_mois into v_duree from public.offres where id=new.offre_id;
  v_ha:=coalesce(new.total_hectares,0);
  if v_ha<=0 then return new; end if;

  if v_formula is not null then
    v_di:=coalesce(nullif(v_formula->>'montant_pi_par_ha','')::numeric,0);
    v_base_total:=coalesce(nullif(v_formula->>'montant_total_par_ha','')::numeric,nullif(v_formula->>'montant_cash_par_ha','')::numeric,0);
    v_total:=v_base_total;
    v_mens:=coalesce(nullif(v_formula->>'mensualite_par_ha','')::numeric,0);
    v_duree:=coalesce(nullif(v_formula->>'duree_paiement_mois','')::int,v_duree,36);
    if coalesce(new.montant_total_contrat,0)>0 then v_total:=new.montant_total_contrat/v_ha; end if;
    if coalesce(new.paiement_initial_montant,0)>0 then v_di:=new.paiement_initial_montant/v_ha; end if;
    if coalesce(new.mensualite_montant,0)>0 then v_mens:=new.mensualite_montant/v_ha; end if;
  else
    select pi_effectif,montant_total_effectif into v_di,v_total from public.offre_prix_effectif() where offre_id=new.offre_id;
    v_base_total:=v_total;
    select ec.mensualite_par_ha into v_mens from public.offre_echeancier_effectif(new.offre_id) as ec order by ec.mois_debut limit 1;
  end if;
  if v_di is null then return new; end if;
  v_amount:=v_di*v_ha;
  new.paiement_initial_montant:=v_amount;
  new.montant_total_contrat:=coalesce(v_total,0)*v_ha;
  new.mensualite_montant:=coalesce(v_mens,0)*v_ha;
  new.jours_contrat_total:=coalesce(v_duree,36)*30;
  v_taux:=case when coalesce(v_duree,0)>0 then coalesce(v_total,0)/(v_duree*30) else 0 end;
  new.taux_journalier_ha:=v_taux;
  if v_formula is not null then new.montant_promo_applique:=greatest(coalesce(v_base_total,0)*v_ha-new.montant_total_contrat,0); end if;

  if v_amount<=0 then
    update public.paiements set statut='annule',montant=0,montant_paye=0,montant_theorique=0,cancelled_at=coalesce(cancelled_at,now()),
      notes=concat_ws(' — ',nullif(notes,''),'Paiement Initial annulé automatiquement : tarif à 0 F'),updated_at=now()
    where client_id=new.id and est_paiement_initial=true and statut='en_attente';
  else
    update public.paiements set montant=v_amount,montant_paye=0,montant_theorique=v_amount,updated_at=now()
    where client_id=new.id and est_paiement_initial=true and statut='en_attente';
  end if;
  return new;
end
$function$;

CREATE OR REPLACE FUNCTION public.recalculer_parametres_financiers_client(_client_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
declare c record; o record; f jsonb; months integer; total numeric; initial numeric; monthly numeric; daily numeric; ha numeric; formula_total numeric;
begin
  select * into c from public.clients where id=_client_id; if not found then return; end if;
  select * into o from public.offres where id=c.offre_id; if o.id is null then return; end if;
  ha:=coalesce(c.total_hectares,0);
  select item.value into f from jsonb_array_elements(coalesce(o.formules_configuration,'[]'::jsonb)) as item(value) where item.value->>'code'=c.formule_code limit 1;
  if f is not null and ha>0 and coalesce(c.paiement_personnalise,'{}'::jsonb)='{}'::jsonb then
    months:=greatest(1,coalesce(nullif(f->>'duree_paiement_mois','')::integer,o.duree_paiement_mois,36));
    initial:=coalesce(nullif(c.paiement_initial_montant,0),coalesce(nullif(f->>'montant_pi_par_ha','')::numeric,0)*ha);
    monthly:=coalesce(nullif(c.mensualite_montant,0),coalesce(nullif(f->>'mensualite_par_ha','')::numeric,0)*ha);
    formula_total:=coalesce(nullif(f->>'montant_total_par_ha','')::numeric,nullif(f->>'montant_cash_par_ha','')::numeric,0)*ha;
    total:=case when coalesce(c.montant_promo_applique,0)>0 and coalesce(c.montant_total_contrat,0)>0 then c.montant_total_contrat else coalesce(nullif(c.montant_total_contrat,0),formula_total) end;
  else
    months:=greatest(1,coalesce(o.duree_paiement_mois,36)); initial:=coalesce(c.paiement_initial_montant,0); monthly:=coalesce(c.mensualite_montant,0);
    if o.id is not null and coalesce(c.paiement_personnalise,'{}'::jsonb)='{}'::jsonb and monthly=coalesce(o.mensualite_par_ha,0)*ha
      and initial=coalesce(o.montant_pi_par_ha,0)*ha and coalesce(o.montant_total_par_ha,0)>0 then total:=o.montant_total_par_ha*ha;
    else total:=initial+monthly*months; end if;
  end if;
  daily:=case when ha>0 and total>0 then total/(greatest(months,1)*30*ha) else 0 end;
  update public.clients set paiement_initial_montant=initial,mensualite_montant=monthly,montant_total_contrat=round(total,2),
    taux_journalier_ha=round(daily,6),jours_contrat_total=greatest(months,1)*30,updated_at=now() where id=_client_id;
end
$function$;

CREATE OR REPLACE FUNCTION public.create_acquisition_for_new_client()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_offre public.offres%ROWTYPE; v_formula jsonb; v_surface numeric; v_pi_par_ha numeric; v_total_par_ha numeric; v_mensualite_par_ha numeric; v_duree integer; v_echeancier jsonb; v_gestion_type text;
BEGIN
  v_surface:=coalesce(NEW.total_hectares,0);
  if NEW.offre_id is null or v_surface<=0 then return NEW; end if;
  if coalesce(NEW.montant_total_contrat,0)<=0 then raise exception 'Le montant contractuel doit être positif avant de créer une vente.'; end if;
  if exists(select 1 from public.acquisitions a where a.client_id=NEW.id) then return NEW; end if;
  select * into v_offre from public.offres where id=NEW.offre_id;
  if not found or v_offre.code is null or v_offre.nom is null then raise exception 'Offre absente ou incomplète pour la création de l’acquisition du client %',NEW.id; end if;
  select item.value into v_formula from jsonb_array_elements(coalesce(v_offre.formules_configuration,'[]'::jsonb)) as item(value) where item.value->>'code'=NEW.formule_code limit 1;
  if v_formula is not null then
    v_pi_par_ha:=coalesce(nullif(v_formula->>'montant_pi_par_ha','')::numeric,0);
    v_mensualite_par_ha:=coalesce(nullif(v_formula->>'mensualite_par_ha','')::numeric,0);
    v_duree:=coalesce(nullif(v_formula->>'duree_paiement_mois','')::integer,v_offre.duree_paiement_mois);
    v_echeancier:=coalesce(v_formula->'tranches_paiement','[]'::jsonb);
    v_gestion_type:=coalesce(v_formula->>'gestion_type',v_offre.gestion_type);
  else
    v_pi_par_ha:=coalesce(v_offre.montant_pi_par_ha,v_offre.paiement_signature_par_ha);
    v_mensualite_par_ha:=v_offre.mensualite_par_ha; v_duree:=v_offre.duree_paiement_mois;
    v_echeancier:=coalesce(v_offre.tranches_paiement,'[]'::jsonb); v_gestion_type:=v_offre.gestion_type;
  end if;
  if v_pi_par_ha is null or v_mensualite_par_ha is null or v_duree is null then raise exception 'Les conditions de paiement de la formule % sont incomplètes.',coalesce(NEW.formule_code,v_offre.code); end if;
  v_total_par_ha:=NEW.montant_total_contrat/v_surface;
  insert into public.acquisitions (
    client_id,offre_id,offre_code,offre_nom,famille_offre,formule_code,formule_nom,gestion_type,necessite_foncier_client,
    superficie_ha,parcelle_id,lot_id,mode_paiement,montant_pi_par_ha,montant_pi_total,montant_total_par_ha,montant_total_contrat,
    mensualite_par_ha,mensualite_montant,duree_paiement_mois,echeancier,promotion_id,montant_promo_applique,statut,statut_technique,
    notes,metadata,created_by,validation_statut
  ) values (
    NEW.id,v_offre.id,v_offre.code,v_offre.nom,v_offre.famille_offre,coalesce(NEW.formule_code,v_offre.formule_code,v_offre.code),
    coalesce(NEW.formule_nom,v_offre.formule_nom,v_offre.nom),v_gestion_type,coalesce(v_offre.necessite_foncier_client,false),
    v_surface,NEW.parcelle_id,null,'echeancier',v_pi_par_ha,coalesce(NEW.paiement_initial_montant,v_pi_par_ha*v_surface),v_total_par_ha,
    NEW.montant_total_contrat,v_mensualite_par_ha,coalesce(NEW.mensualite_montant,v_mensualite_par_ha*v_surface),v_duree,v_echeancier,
    NEW.promotion_id,coalesce(NEW.montant_promo_applique,0),'souscrite','en_attente_intervention',null,
    jsonb_build_object('source','clients','client_id',NEW.id,'created_from_client_workflow',true),NEW.created_by,'a_valider'
  );
  return NEW;
END
$function$;

CREATE OR REPLACE FUNCTION public.recompute_contrat_totaux(_client_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare c record; o record; f jsonb; total numeric; pi numeric; days int; rate numeric; monthly numeric; ha numeric;
begin
  if auth.uid() is not null and not public.is_staff(auth.uid()) then raise exception 'Accès refusé'; end if;
  select * into c from public.clients where id=_client_id; if not found or c.offre_id is null then return; end if;
  select * into o from public.offres where id=c.offre_id; ha:=coalesce(c.total_hectares,0);
  select item.value into f from jsonb_array_elements(coalesce(o.formules_configuration,'[]'::jsonb)) as item(value) where item.value->>'code'=c.formule_code limit 1;
  if f is not null and ha>0 then
    pi:=coalesce(nullif(f->>'montant_pi_par_ha','')::numeric,0)*ha;
    monthly:=coalesce(nullif(f->>'mensualite_par_ha','')::numeric,0)*ha;
    days:=greatest(1,coalesce(nullif(f->>'duree_paiement_mois','')::int,o.duree_paiement_mois,36))*30;
    total:=case when coalesce(c.montant_promo_applique,0)>0 and coalesce(c.montant_total_contrat,0)>0 then c.montant_total_contrat
      else coalesce(nullif(f->>'montant_total_par_ha','')::numeric,nullif(f->>'montant_cash_par_ha','')::numeric,0)*ha end;
  else
    select * into o from public.offre_prix_effectif() where offre_id=c.offre_id limit 1; if o is null then return; end if;
    total:=coalesce(o.montant_total_effectif,0)*ha; pi:=least(coalesce(o.pi_effectif,0)*ha,total);
    days:=coalesce((select duree_paiement_mois from public.offres where id=c.offre_id),40)*30;
    select coalesce(ec.mensualite_par_ha,0)*ha into monthly from public.offre_echeancier_effectif(c.offre_id) ec order by ec.mois_debut limit 1;
  end if;
  rate:=case when days>0 and ha>0 then total/days/ha else 0 end;
  update public.clients set montant_total_contrat=total,mensualite_montant=coalesce(monthly,0),jours_contrat_total=days,
    taux_journalier_ha=rate,paiement_initial_montant=pi,updated_at=now() where id=_client_id;
end
$function$;

CREATE OR REPLACE FUNCTION public.recompute_pending_pi()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE r RECORD; o record; f jsonb; pi numeric; total numeric; monthly numeric; ha numeric; months int;
BEGIN
  FOR r IN SELECT s.id sid,s.offre_id,s.total_hectares,s.formule_code,s.montant_total_contrat,s.montant_promo_applique
    FROM public.clients s WHERE coalesce(s.compte_actif,false)=false AND s.offre_id is not null
  LOOP
    SELECT * INTO o FROM public.offres WHERE id=r.offre_id;
    SELECT item.value INTO f FROM jsonb_array_elements(coalesce(o.formules_configuration,'[]'::jsonb)) as item(value) WHERE item.value->>'code'=r.formule_code LIMIT 1;
    ha:=coalesce(r.total_hectares,0);
    if f is not null then
      pi:=coalesce(nullif(f->>'montant_pi_par_ha','')::numeric,0)*ha;
      monthly:=coalesce(nullif(f->>'mensualite_par_ha','')::numeric,0)*ha;
      months:=coalesce(nullif(f->>'duree_paiement_mois','')::int,o.duree_paiement_mois,34);
      total:=case when coalesce(r.montant_promo_applique,0)>0 and coalesce(r.montant_total_contrat,0)>0 then r.montant_total_contrat
        else coalesce(nullif(f->>'montant_total_par_ha','')::numeric,nullif(f->>'montant_cash_par_ha','')::numeric,0)*ha end;
    else
      select * into o from public.offre_prix_effectif() where offre_id=r.offre_id limit 1; if o is null then continue; end if;
      pi:=coalesce(o.pi_effectif,0)*ha; total:=coalesce(o.montant_total_effectif,0)*ha;
      monthly:=coalesce(o.mensualite_effective,0)*ha; months:=coalesce((select duree_paiement_mois from public.offres where id=r.offre_id),34);
    end if;
    update public.clients set montant_total_contrat=total,mensualite_montant=monthly,paiement_initial_montant=pi,
      jours_contrat_total=months*30,taux_journalier_ha=case when months>0 then total/(months*30*greatest(ha,1)) else 0 end,
      updated_at=now() where id=r.sid;
    update public.paiements set montant=pi,montant_paye=pi,montant_theorique=pi,updated_at=now()
      where client_id=r.sid and est_paiement_initial=true and statut='en_attente';
    if pi<=0 then update public.paiements set statut='annule',montant=0,montant_paye=0,montant_theorique=0,
      cancelled_at=coalesce(cancelled_at,now()),notes=concat_ws(' — ',nullif(notes,''),'Paiement Initial annulé automatiquement : montant à 0 F'),updated_at=now()
      where client_id=r.sid and est_paiement_initial=true and statut='en_attente'; end if;
  END LOOP;
END
$function$;


CREATE OR REPLACE FUNCTION public.trg_recalculer_parametres_financiers_client()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  if pg_trigger_depth() > 1 then return new; end if;
  perform public.recalculer_parametres_financiers_client(new.id);
  return new;
end
$function$;
