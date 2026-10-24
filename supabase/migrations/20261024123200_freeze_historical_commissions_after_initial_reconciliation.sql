create or replace function public.recalculer_commissions_depuis_grille()
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $function$
begin
  if not (private.is_global_admin(auth.uid()) or private.has_role(auth.uid(),'pdg') or private.has_role(auth.uid(),'dg')) then
    raise exception 'Accès réservé à la direction pour recalculer la rémunération.';
  end if;
  -- Les montants déjà enregistrés sont des instantanés historiques : aucune réécriture.
  perform public.recalculer_portefeuilles_commissions();
  return jsonb_build_object('ok',true,'historique_modifie',false);
end;
$function$;
revoke all on function public.recalculer_commissions_depuis_grille() from public, anon;
grant execute on function public.recalculer_commissions_depuis_grille() to authenticated;