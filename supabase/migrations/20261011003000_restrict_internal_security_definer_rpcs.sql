-- Restrict direct API access to internal SECURITY DEFINER routines. Trigger calls and owner-role calls remain valid.
revoke execute on function public.assign_sp_code(uuid) from public, anon, authenticated;
revoke execute on function public.calculer_commission_paiement(uuid) from public, anon, authenticated;
revoke execute on function public.compute_commission_for_paiement(uuid) from public, anon, authenticated;
revoke execute on function public.generate_client_id() from public, anon, authenticated;
revoke execute on function public.generate_parcelle_id() from public, anon, authenticated;
revoke execute on function public.generate_plantation_id() from public, anon, authenticated;
revoke execute on function public.generate_proprietaire_id() from public, anon, authenticated;
revoke execute on function public.notification_emit_event(text, jsonb) from public, anon, authenticated;
revoke execute on function public.notification_resolve_recipients(jsonb) from public, anon, authenticated;
revoke execute on function public.notification_resolve_recipients_target(jsonb) from public, anon, authenticated;
revoke execute on function public.notify_hierarchy(text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.recompute_profile_coverage(uuid) from public, anon, authenticated;
revoke execute on function public.reconcile_user_role_coverage(uuid) from public, anon, authenticated;
revoke execute on function public.refresh_client_account_activation(uuid) from public, anon, authenticated;
revoke execute on function public.recompute_contrat_totaux(uuid) from public, anon, authenticated;
revoke execute on function public.ensure_client_contracts(uuid) from public, anon, authenticated;
revoke execute on function public.recalculer_parametres_financiers_client(uuid) from public, anon, authenticated;
