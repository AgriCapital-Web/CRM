-- A mobilizer earns the configured per-hectare amount only after the client account is validated.
create or replace function public.compute_commission_foncier_client()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare v_profile_id uuid; v_rate numeric; v_amount numeric;
begin
 if not coalesce(new.compte_actif,false) and new.documents_valides_at is null then return new; end if;
 if tg_op='UPDATE' and coalesce(old.compte_actif,false) and old.documents_valides_at is not null then return new; end if;
 if new.created_by is null or coalesce(new.total_hectares,0)<=0 then return new; end if;
 select pr.id into v_profile_id from public.profiles pr join public.user_roles ur on ur.user_id=pr.user_id and ur.role='mobilisateur_foncier' where pr.user_id=new.created_by and pr.actif=true limit 1;
 if v_profile_id is null then return new; end if;
 select gr.montant into v_rate from public.grille_remuneration gr where gr.role_cible='mobilisateur_foncier' and gr.type_remuneration='mobilisation_fonciere' and gr.actif order by gr.updated_at desc limit 1;
 if coalesce(v_rate,0)<=0 then return new; end if;
 v_amount:=round(coalesce(new.total_hectares,0)*v_rate,2);
 if not exists(select 1 from public.commissions c where c.profile_id=v_profile_id and c.client_id=new.id and c.type_commission='mobilisation_fonciere') then
  insert into public.commissions(profile_id,client_id,type_commission,montant_base,taux_commission,montant_commission,periode,date_calcul,statut) values(v_profile_id,new.id,'mobilisation_fonciere',new.total_hectares,0,v_amount,current_date,now(),'calculee');
  perform public.recalculer_portefeuilles_commissions();
 end if; return new;
end; $function$;
drop trigger if exists trg_commission_foncier_client on public.clients;
create trigger trg_commission_foncier_client after insert or update of compte_actif,documents_valides_at on public.clients for each row execute function public.compute_commission_foncier_client();

-- Technical commissions are assigned to the actual technician and use the database grid; no person-name fallback.
create or replace function public.generer_commission_technique_a_la_creation_plantation()
returns trigger language plpgsql set search_path to 'public' as $function$
declare v_profile_id uuid; v_client_id uuid; v_montant numeric;
begin
 v_client_id:=new.client_id; if v_client_id is null then return new; end if;
 select i.agent_technique_id into v_profile_id from public.interventions_techniques i where i.client_id=v_client_id and i.type_intervention='mise_en_terre' and i.statut='realisee' order by i.date_intervention desc nulls last,i.created_at desc limit 1;
 if v_profile_id is null then return new; end if;
 select gr.montant into v_montant from public.grille_remuneration gr where gr.role_cible='equipe_technique' and gr.type_remuneration='commission_technique' and gr.actif order by gr.updated_at desc limit 1;
 if coalesce(v_montant,0)<=0 then return new; end if;
 if not exists(select 1 from public.commissions c where c.profile_id=v_profile_id and c.client_id=v_client_id and c.type_commission='technique' and c.plantation_id=new.id) then
  insert into public.commissions(profile_id,plantation_id,client_id,type_commission,montant_base,taux_commission,montant_commission,periode,date_calcul,statut) values(v_profile_id,new.id,v_client_id,'technique',v_montant,0,v_montant,coalesce(new.date_plantation,current_date),now(),'validee');
 end if; return new;
end; $function$;

create or replace function public.generer_commission_technique_mise_en_terre()
returns trigger language plpgsql set search_path to 'public' as $function$
declare v_client_id uuid; v_plantation_id uuid; v_profile_id uuid; v_montant numeric;
begin
 if new.statut<>'realisee' or new.type_intervention<>'mise_en_terre' then return new; end if;
 v_client_id:=new.client_id; v_plantation_id:=new.plantation_id;
 if v_plantation_id is null and v_client_id is not null then select p.id into v_plantation_id from public.plantations p where p.client_id=v_client_id order by p.date_plantation desc nulls last,p.created_at desc limit 1; end if;
 v_profile_id:=new.agent_technique_id; if v_profile_id is null or v_client_id is null then return new; end if;
 select gr.montant into v_montant from public.grille_remuneration gr where gr.role_cible='equipe_technique' and gr.type_remuneration='commission_technique' and gr.actif order by gr.updated_at desc limit 1;
 if coalesce(v_montant,0)<=0 then return new; end if;
 if not exists(select 1 from public.commissions c where c.profile_id=v_profile_id and c.client_id=v_client_id and c.type_commission='technique' and ((v_plantation_id is not null and c.plantation_id=v_plantation_id) or (v_plantation_id is null and c.plantation_id is null))) then
  insert into public.commissions(profile_id,plantation_id,client_id,type_commission,montant_base,taux_commission,montant_commission,periode,date_calcul,statut) values(v_profile_id,v_plantation_id,v_client_id,'technique',v_montant,0,v_montant,coalesce(new.date_intervention,current_date),now(),'validee');
 end if; return new;
end; $function$;

create or replace function public.recalculer_portefeuilles_commissions()
returns void language plpgsql security definer set search_path to 'public' as $function$
begin
 insert into public.portefeuilles(user_id,created_at,updated_at)
 select distinct pr.user_id,now(),now() from public.profiles pr join public.user_roles ur on ur.user_id=pr.user_id and ur.role in ('commercial','technicien','mobilisateur_foncier') where pr.user_id is not null on conflict (user_id) do nothing;
 update public.portefeuilles pf
 set total_gagne=coalesce((select sum(c.montant_commission) from public.commissions c where c.profile_id=pr.id and c.statut in ('calculee','validee','payee')),0),
 solde_commissions=coalesce((select sum(c.montant_commission) from public.commissions c where c.profile_id=pr.id and c.statut in ('calculee','validee')),0),
 total_verse=coalesce((select sum(v.montant_paye) from public.portefeuille_versements v where v.profile_id=pr.id and v.statut='paye'),0),
 total_retire=coalesce((select sum(v.montant_paye) from public.portefeuille_versements v where v.profile_id=pr.id and v.statut='paye'),0),updated_at=now()
 from public.profiles pr where pr.user_id=pf.user_id;
end; $function$;
