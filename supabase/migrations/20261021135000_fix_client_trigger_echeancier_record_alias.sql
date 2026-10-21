-- Avoid a PL/pgSQL record variable/SQL table-alias collision in the client pricing trigger.
-- The same trigger also uses the canonical pi_effectif output name from offre_prix_effectif().

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
  select ec.mensualite_par_ha into v_mens
  from public.offre_echeancier_effectif(new.offre_id) as ec
  order by ec.mois_debut limit 1;

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
