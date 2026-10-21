-- Align all pricing consumers with the canonical output names of offre_prix_effectif().
-- The function exposes pi_effectif (not the removed paiement_initial_effectif alias).

CREATE OR REPLACE FUNCTION public.trg_client_recompute()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_di numeric;
  v_total numeric;
  v_duree int;
  v_taux numeric;
  v_mens numeric := 0;
  v_ha numeric;
  v_amount numeric;
  e record;
begin
  if coalesce(new.compte_actif,false)=true or new.offre_id is null then return new; end if;
  if tg_op='UPDATE'
    and new.offre_id is not distinct from old.offre_id
    and new.promotion_id is not distinct from old.promotion_id
    and new.total_hectares is not distinct from old.total_hectares then return new; end if;

  select pi_effectif, montant_total_effectif into v_di, v_total
  from public.offre_prix_effectif() where offre_id=new.offre_id;
  select duree_paiement_mois into v_duree from public.offres where id=new.offre_id;

  v_ha:=coalesce(new.total_hectares,0);
  if v_di is null or v_ha<=0 then return new; end if;
  v_amount:=v_di*v_ha;
  v_taux:=case when coalesce(v_duree,0)>0 then coalesce(v_total,0)/(v_duree*30) else 0 end;
  select e.mensualite_par_ha into v_mens from public.offre_echeancier_effectif(new.offre_id) e order by e.mois_debut limit 1;

  new.montant_total_contrat:=coalesce(v_total,0)*v_ha;
  new.jours_contrat_total:=coalesce(v_duree,34)*30;
  new.taux_journalier_ha:=v_taux;
  new.mensualite_montant:=coalesce(v_mens,0)*v_ha;

  if v_amount<=0 then
    update public.paiements set statut='annule',montant=0,montant_paye=0,montant_theorique=0,
      cancelled_at=coalesce(cancelled_at,now()),
      notes=concat_ws(' — ',nullif(notes,''),'Paiement Initial annulé automatiquement : tarif à 0 F'),updated_at=now()
    where client_id=new.id and est_paiement_initial=true and statut='en_attente';
  else
    update public.paiements set montant=v_amount,montant_paye=0,montant_theorique=v_amount,updated_at=now()
    where client_id=new.id and est_paiement_initial=true and statut='en_attente';
  end if;
  return new;
end
$function$;

CREATE OR REPLACE FUNCTION public.recompute_contrat_totaux(_client_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare s record; p record; total numeric; pi numeric; days int; rate numeric; monthly numeric;
begin
  if auth.uid() is not null and not public.is_staff(auth.uid()) then raise exception 'Accès refusé'; end if;
  select * into s from public.clients where id=_client_id;
  if s is null or s.offre_id is null then return; end if;
  select * into p from public.offre_prix_effectif() where offre_id=s.offre_id limit 1;
  if p is null then return; end if;
  total:=coalesce(p.montant_total_effectif,0)*coalesce(s.total_hectares,0);
  pi:=least(coalesce(p.pi_effectif,0)*coalesce(s.total_hectares,0),total);
  days:=coalesce((select duree_paiement_mois from public.offres where id=s.offre_id),40)*30;
  rate:=case when days>0 and coalesce(s.total_hectares,0)>0 then total/days/coalesce(s.total_hectares,0) else 0 end;
  select coalesce(e.mensualite_par_ha,0)*coalesce(s.total_hectares,0) into monthly
  from public.offre_echeancier_effectif(s.offre_id) e order by e.mois_debut limit 1;
  update public.clients set montant_total_contrat=total,
    montant_promo_applique=greatest(coalesce(p.montant_total_base,0)*coalesce(s.total_hectares,0)-total,0),
    mensualite_montant=coalesce(monthly,0),jours_contrat_total=days,
    taux_journalier_ha=rate,paiement_initial_montant=pi,updated_at=now()
  where id=_client_id;
end
$function$;

CREATE OR REPLACE FUNCTION public.recompute_pending_pi()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE r RECORD; p RECORD; pi numeric; total numeric; monthly numeric; ha numeric; months int;
BEGIN
  FOR r IN SELECT s.id sid,s.offre_id,s.total_hectares FROM public.clients s
    WHERE COALESCE(s.compte_actif,false)=false AND s.offre_id is not null
  LOOP
    SELECT * INTO p FROM public.offre_prix_effectif() WHERE offre_id=r.offre_id LIMIT 1;
    IF p IS NULL THEN CONTINUE; END IF;
    ha=COALESCE(r.total_hectares,0);
    pi=COALESCE(p.pi_effectif,0)*ha;
    total=COALESCE(p.montant_total_effectif,0)*ha;
    monthly=COALESCE(p.mensualite_effective,0)*ha;
    months=COALESCE((select duree_paiement_mois from public.offres where id=r.offre_id),34);
    update public.clients set montant_total_contrat=total,mensualite_montant=monthly,
      jours_contrat_total=months*30,
      taux_journalier_ha=case when months>0 then total/(months*30*greatest(ha,1)) else 0 end,
      updated_at=now() where id=r.sid;
    update public.paiements set montant=pi,montant_paye=pi,montant_theorique=pi,updated_at=now()
      where client_id=r.sid and est_paiement_initial=true and statut='en_attente';
    if pi<=0 then
      update public.paiements set statut='annule',montant=0,montant_paye=0,montant_theorique=0,
        cancelled_at=COALESCE(cancelled_at,now()),
        notes=concat_ws(' — ',nullif(notes,''),'Paiement Initial annulé automatiquement : montant à 0 F'),
        updated_at=now()
      where client_id=r.sid and est_paiement_initial=true and statut='en_attente';
    end if;
  END LOOP;
END
$function$;
