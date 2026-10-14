-- Recalculate all unpaid commissions from editable rules after saving the remuneration grid.
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
