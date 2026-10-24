do $$
declare
  v_definition text;
  v_updated text;
begin
  select pg_get_functiondef('public.transfer_agricapital_plantation(uuid,uuid)'::regprocedure)
    into v_definition;
  v_updated := replace(
    v_definition,
    $find$ur.role in ('pdg','dg','admin','super_admin','responsable_operations','responsable_technique_agronomique','directeur_tc','technicien','chef_equipe_technique')$find$,
    $replace$ur.role in ('pdg','service_client','chef_equipe_service_client')$replace$
  );
  if v_updated = v_definition then
    raise exception 'La règle d’accès au transfert a changé : correction automatique annulée.';
  end if;
  execute v_updated;
end $$;