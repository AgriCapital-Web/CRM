-- Portfolio access follows financial permissions, team membership and mobilization coverage zones.
create or replace function public.list_visible_portfolio_profiles()
returns table(id uuid,user_id uuid,nom_complet text,telephone text,equipe_id uuid,region_id uuid,poste text,actif boolean,roles text[],equipe jsonb,team_memberships jsonb)
language sql stable security definer set search_path to ''
as $function$
 select p.id,p.user_id,p.nom_complet,p.telephone,p.equipe_id,p.region_id,p.poste,p.actif,
  coalesce((select array_agg(ur.role order by ur.role) from public.user_roles ur where ur.user_id=p.user_id),array[]::text[]),
  case when t.id is null then null else jsonb_build_object('id',t.id,'type_equipe',t.type_equipe,'zone_couverture',t.zone_couverture) end,
  coalesce((select jsonb_agg(jsonb_build_object('profile_id',em.profile_id,'equipe_id',em.equipe_id,'equipe',jsonb_build_object('id',mt.id,'type_equipe',mt.type_equipe,'zone_couverture',mt.zone_couverture))) from public.equipe_membres em join public.equipes mt on mt.id=em.equipe_id where em.profile_id=p.id),'[]'::jsonb)
 from public.profiles p left join public.equipes t on t.id=p.equipe_id
 where (
  private.is_global_admin(auth.uid()) or private.has_role(auth.uid(),'pdg') or private.has_role(auth.uid(),'dg')
  or private.has_role(auth.uid(),'comptable')
  or private.has_role_permission('portefeuilles.manage_payouts')
  or private.has_role_permission('commissions.manage_payouts')
  or p.user_id=auth.uid()
  or (private.has_role(auth.uid(),'chef_equipe_technique') and exists(
    select 1 from public.profiles viewer join public.equipes et on lower(coalesce(et.type_equipe,'')) like '%technique%'
    where viewer.user_id=auth.uid() and ((viewer.equipe_id=et.id and p.equipe_id=et.id)
      or (exists(select 1 from public.equipe_membres vm where vm.profile_id=viewer.id and vm.equipe_id=et.id)
        and exists(select 1 from public.equipe_membres pm where pm.profile_id=p.id and pm.equipe_id=et.id)))
      and exists(select 1 from public.user_roles ur where ur.user_id=p.user_id and ur.role='technicien')))
  or ((private.has_role(auth.uid(),'chef_equipe_commercial') or private.has_role(auth.uid(),'responsable_commercial')) and exists(
    select 1 from public.profiles viewer join public.equipes et on lower(coalesce(et.type_equipe,'')) like '%commercial%'
    where viewer.user_id=auth.uid() and ((viewer.equipe_id=et.id and p.equipe_id=et.id)
      or (exists(select 1 from public.equipe_membres vm where vm.profile_id=viewer.id and vm.equipe_id=et.id)
        and exists(select 1 from public.equipe_membres pm where pm.profile_id=p.id and pm.equipe_id=et.id)))
      and exists(select 1 from public.user_roles ur where ur.user_id=p.user_id and ur.role in ('commercial','chef_equipe_commercial','responsable_commercial'))))
  or (private.has_role(auth.uid(),'superviseur_mobilisation_fonciere') and exists(
    select 1 from public.profiles viewer where viewer.user_id=auth.uid() and (
      (exists(select 1 from public.equipe_membres vm join public.equipes vt on vt.id=vm.equipe_id where vm.profile_id=viewer.id and nullif(trim(vt.zone_couverture),'') is not null)
       and exists(select 1 from public.equipe_membres vm join public.equipes vt on vt.id=vm.equipe_id join public.equipe_membres pm on pm.equipe_id=vt.id where vm.profile_id=viewer.id and nullif(trim(vt.zone_couverture),'') is not null and pm.profile_id=p.id))
      or (not exists(select 1 from public.equipe_membres vm join public.equipes vt on vt.id=vm.equipe_id where vm.profile_id=viewer.id and nullif(trim(vt.zone_couverture),'') is not null)
          and viewer.region_id is not null and viewer.region_id=p.region_id)))
    and exists(select 1 from public.user_roles ur where ur.user_id=p.user_id and ur.role='mobilisateur_foncier'))
 ) order by p.nom_complet;
$function$;
revoke all on function public.list_visible_portfolio_profiles() from public;
grant execute on function public.list_visible_portfolio_profiles() to authenticated;

-- Recalculate existing unpaid commercial commissions from the editable rule codes.
create or replace function public.compute_commission_for_paiement(p_paiement_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare p record; c record; pid uuid; amount numeric:=0; base_amount numeric:=0; rate numeric:=0; offer text; kind text; existing_id uuid; existing_status text; yr integer:=1; rule_key text;
begin
 select * into p from public.paiements where id=p_paiement_id;
 if not found or lower(coalesce(p.statut,''))<>'valide' then return; end if;
 select id,commercial_id,formule_code,famille_offre,formule_nom,montant_total_contrat,contrat_debut_at into c from public.clients where id=p.client_id;
 if not found or c.commercial_id is null then return; end if;
 select id into pid from public.profiles where user_id=c.commercial_id and actif=true limit 1;
 if pid is null or not private.is_commercial_assignable(c.commercial_id) then return; end if;
 offer:=upper(concat_ws(' ',c.formule_code,c.famille_offre,c.formule_nom));
 if offer like '%FLEXIBLE%' then kind:='flexible';
 elsif offer like '%ESSENTIEL%' or offer like '%PALMTERROIR%' then kind:='essentiel';
 elsif offer like '%PALMINVEST%' or offer like '%TERRAPALM%' or offer like '%TERRA PALM%' then kind:='partenaire';
 else kind:='inconnu'; end if;
 if coalesce(p.est_paiement_initial,false) or upper(coalesce(p.type_paiement,'')) in ('PI','PAIEMENT_INITIAL') then
  select id,statut into existing_id,existing_status from public.commissions where paiement_id=p.id and type_commission='acquisition' limit 1;
  base_amount:=coalesce(c.montant_total_contrat,p.montant_theorique,p.montant_paye,p.montant,0);
  rule_key:=case kind when 'flexible' then 'COMMERCIAL_ACQUISITION_FLEXIBLE' when 'essentiel' then 'COMMERCIAL_ACQUISITION_ESSENTIEL' when 'partenaire' then 'COMMERCIAL_ACQUISITION_PARTENAIRE' else null end;
  if rule_key is not null then select montant into amount from public.grille_remuneration where code_regle=rule_key and actif order by updated_at desc limit 1; end if;
  amount:=coalesce(amount,0);
  if existing_id is not null then
   if lower(coalesce(existing_status,''))<>'payee' then update public.commissions set profile_id=pid,client_id=c.id,montant_base=base_amount,montant_commission=amount,date_calcul=now(),taux_applique=0,annee_contrat=1 where id=existing_id; end if;
  elsif amount>0 then
   insert into public.commissions(profile_id,plantation_id,type_commission,montant_base,taux_commission,montant_commission,periode,statut,valide_par,date_validation,date_calcul,paiement_id,client_id,taux_applique,annee_contrat)
   values(pid,p.plantation_id,'acquisition',base_amount,0,amount,coalesce(p.date_paiement::date,current_date),'validee',coalesce(p.valide_par,auth.uid()),coalesce(p.date_validation,now()),now(),p.id,c.id,0,1);
  end if;
  perform public.recalculer_portefeuilles_commissions(); return;
 end if;
 if upper(coalesce(p.type_paiement,''))<>'MENSUALITE' or kind in ('essentiel','inconnu') then return; end if;
 select id,statut into existing_id,existing_status from public.commissions where paiement_id=p.id and type_commission='recouvrement_mensuel' limit 1;
 if coalesce(p.numero_echeance,0)>0 then yr:=ceil(p.numero_echeance::numeric/12.0)::integer;
 elsif c.contrat_debut_at is not null then yr:=greatest(1,extract(year from age(coalesce(p.date_paiement::date,current_date),c.contrat_debut_at))::integer+1);
 else yr:=1; end if;
 yr:=greatest(1,least(3,yr));
 rule_key:=case when kind='flexible' then 'COMMERCIAL_REC_FLEXIBLE_AN'||yr::text else 'COMMERCIAL_REC_PARTENAIRE_AN'||yr::text end;
 select coalesce(taux_pourcentage,0) into rate from public.grille_remuneration where code_regle=rule_key and actif order by updated_at desc limit 1;
 base_amount:=coalesce(p.montant_paye,p.montant,0); amount:=round(base_amount*coalesce(rate,0)/100.0,2);
 if existing_id is not null then
  if lower(coalesce(existing_status,''))<>'payee' then update public.commissions set profile_id=pid,montant_base=base_amount,taux_commission=rate,montant_commission=amount,taux_applique=rate,annee_contrat=yr,date_calcul=now() where id=existing_id; end if;
 elsif amount>0 then
  insert into public.commissions(profile_id,plantation_id,type_commission,montant_base,taux_commission,montant_commission,periode,statut,date_calcul,paiement_id,client_id,taux_applique,annee_contrat)
  values(pid,p.plantation_id,'recouvrement_mensuel',base_amount,rate,amount,coalesce(p.date_paiement::date,current_date),'calculee',now(),p.id,c.id,rate,yr);
 end if;
 perform public.recalculer_portefeuilles_commissions();
end; $function$;

create or replace function public.recalculer_commissions_depuis_grille()
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare p record; foncier_count integer:=0; technique_count integer:=0;
begin
 if not (private.is_global_admin(auth.uid()) or private.has_role(auth.uid(),'pdg') or private.has_role(auth.uid(),'dg')) then
  raise exception 'Accès réservé à la direction pour recalculer la rémunération.';
 end if;
 for p in select id from public.paiements where lower(coalesce(statut,''))='valide' loop
  perform public.compute_commission_for_paiement(p.id);
 end loop;
 update public.commissions c set montant_commission=round(coalesce(c.montant_base,0)*coalesce(g.montant,0),2),taux_commission=0,taux_applique=0,date_calcul=now()
 from public.grille_remuneration g where c.type_commission='mobilisation_fonciere' and c.statut in ('calculee','validee') and g.code_regle='MOBILISATEUR_FONCIER_PAR_HA' and g.actif;
 get diagnostics foncier_count=row_count;
 update public.commissions c set montant_base=g.montant,montant_commission=g.montant,taux_commission=0,taux_applique=0,date_calcul=now()
 from public.grille_remuneration g where c.type_commission='technique' and c.statut in ('calculee','validee') and g.code_regle='TECHNIQUE_MISE_EN_TERRE' and g.actif;
 get diagnostics technique_count=row_count;
 perform public.recalculer_portefeuilles_commissions();
 return jsonb_build_object('ok',true,'foncier_recalcule',foncier_count,'technique_recalcule',technique_count);
end; $function$;
revoke all on function public.recalculer_commissions_depuis_grille() from public;
grant execute on function public.recalculer_commissions_depuis_grille() to authenticated;
