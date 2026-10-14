-- Calculate commercial acquisition and monthly commissions using the editable remuneration grid.
create or replace function public.compute_commission_for_paiement(p_paiement_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare p record; v_client record; v_profile_id uuid; v_montant numeric:=0; v_base numeric:=0; v_taux numeric:=0; v_formule text:=''; v_offer_class text:=''; v_commission_id uuid; v_annee integer:=1;
begin
 select * into p from public.paiements where id=p_paiement_id;
 if not found or lower(coalesce(p.statut,''))<>'valide' then return; end if;
 select c.id,c.commercial_id,c.total_hectares,c.formule_code,c.famille_offre,c.formule_nom,c.montant_total_contrat,c.contrat_debut_at into v_client from public.clients c where c.id=p.client_id;
 if not found or v_client.commercial_id is null then return; end if;
 select pr.id into v_profile_id from public.profiles pr where pr.user_id=v_client.commercial_id and pr.actif=true limit 1;
 if v_profile_id is null or not private.is_commercial_assignable(v_client.commercial_id) then return; end if;
 v_formule:=upper(concat_ws(' ',v_client.formule_code,v_client.famille_offre,v_client.formule_nom));
 if v_formule like '%FLEXIBLE%' then v_offer_class:='flexible';
 elsif v_formule like '%ESSENTIEL%' or v_formule like '%PALMTERROIR%' then v_offer_class:='essentiel';
 elsif v_formule like '%PALMINVEST%' or v_formule like '%TERRAPALM%' or v_formule like '%TERRA PALM%' then v_offer_class:='partenaire';
 else v_offer_class:='inconnu'; end if;
 if coalesce(p.est_paiement_initial,false) or upper(coalesce(p.type_paiement,'')) in ('PI','PAIEMENT_INITIAL') then
  select cm.id into v_commission_id from public.commissions cm where cm.paiement_id=p.id and cm.type_commission='acquisition' limit 1;
  v_base:=coalesce(v_client.montant_total_contrat,p.montant_theorique,p.montant_paye,p.montant,0);
  if v_offer_class='flexible' then
   select gr.montant into v_montant from public.grille_remuneration gr where gr.role_cible='commercial' and gr.type_remuneration='acquisition' and gr.actif and lower(coalesce(gr.description,'')) like '%flexible%' order by gr.updated_at desc limit 1;
  elsif v_offer_class='essentiel' then
   select gr.montant into v_montant from public.grille_remuneration gr where gr.role_cible='commercial' and gr.type_remuneration='acquisition' and gr.actif and (lower(coalesce(gr.description,'')) like '%essentiel%' or lower(coalesce(gr.description,'')) like '%palmterroir%') order by gr.updated_at desc limit 1;
  elsif v_offer_class='partenaire' then
   select gr.montant into v_montant from public.grille_remuneration gr where gr.role_cible='commercial' and gr.type_remuneration='acquisition' and gr.actif and (lower(coalesce(gr.description,'')) like '%palminvest%' or lower(coalesce(gr.description,'')) like '%terrapalm%') order by gr.updated_at desc limit 1;
  end if;
  v_montant:=coalesce(v_montant,0);
  if v_commission_id is not null then
   update public.commissions set profile_id=case when lower(coalesce(statut,''))='payee' then profile_id else v_profile_id end,client_id=v_client.id,montant_base=coalesce(montant_base,v_base),montant_commission=case when lower(coalesce(statut,''))='payee' then montant_commission else v_montant end,date_calcul=coalesce(date_calcul,now()) where id=v_commission_id;
  elsif v_montant>0 then
   insert into public.commissions(profile_id,plantation_id,type_commission,montant_base,taux_commission,montant_commission,periode,statut,valide_par,date_validation,date_calcul,paiement_id,client_id,taux_applique,annee_contrat)
   values(v_profile_id,p.plantation_id,'acquisition',v_base,0,v_montant,coalesce(p.date_paiement::date,current_date),'validee',coalesce(p.valide_par,auth.uid()),coalesce(p.date_validation,now()),now(),p.id,v_client.id,0,1);
  end if;
  perform public.recalculer_portefeuilles_commissions(); return;
 end if;
 if upper(coalesce(p.type_paiement,''))<>'MENSUALITE' then return; end if;
 select cm.id into v_commission_id from public.commissions cm where cm.paiement_id=p.id and cm.type_commission='recouvrement_mensuel' limit 1;
 if v_commission_id is not null or v_offer_class in ('essentiel','inconnu') then return; end if;
 if coalesce(p.numero_echeance,0)>0 then v_annee:=ceil(p.numero_echeance::numeric/12.0)::integer;
 elsif v_client.contrat_debut_at is not null then v_annee:=greatest(1,extract(year from age(coalesce(p.date_paiement::date,current_date),v_client.contrat_debut_at))::integer+1);
 else v_annee:=1; end if;
 v_annee:=greatest(1,least(3,v_annee));
 if v_offer_class='flexible' then
  select coalesce(gr.taux_pourcentage,0) into v_taux from public.grille_remuneration gr where gr.role_cible='commercial' and gr.type_remuneration='recouvrement_mensuel' and gr.actif and gr.annee_application=v_annee and lower(coalesce(gr.description,'')) like '%flexible%' order by gr.updated_at desc limit 1;
 else
  select coalesce(gr.taux_pourcentage,0) into v_taux from public.grille_remuneration gr where gr.role_cible='commercial' and gr.type_remuneration='recouvrement_mensuel' and gr.actif and gr.annee_application=v_annee and (lower(coalesce(gr.description,'')) like '%palminvest%' or lower(coalesce(gr.description,'')) like '%terrapalm%') order by gr.updated_at desc limit 1;
 end if;
 v_base:=coalesce(p.montant_paye,p.montant,0); v_montant:=round(v_base*coalesce(v_taux,0)/100.0,2);
 if v_montant<=0 then return; end if;
 insert into public.commissions(profile_id,plantation_id,type_commission,montant_base,taux_commission,montant_commission,periode,statut,date_calcul,paiement_id,client_id,taux_applique,annee_contrat)
 values(v_profile_id,p.plantation_id,'recouvrement_mensuel',v_base,v_taux,v_montant,coalesce(p.date_paiement::date,current_date),'calculee',now(),p.id,v_client.id,v_taux,v_annee);
 perform public.recalculer_portefeuilles_commissions();
end; $function$;
