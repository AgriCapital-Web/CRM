do $$
declare
  v_definition text;
  v_updated text;
begin
  select pg_get_functiondef('public.sync_palminvest_lot_activation()'::regprocedure)
    into v_definition;
  v_updated := replace(
    v_definition,
    $find$v_formula:=upper(coalesce(v_client.formule_code,''));$find$,
    $replace$if new.acquisition_id is not null then
    select upper(coalesce(a.formule_code,'')) into v_formula
      from public.acquisitions a where a.id=new.acquisition_id;
  else
    v_formula:=upper(coalesce(v_client.formule_code,''));
  end if;$replace$
  );
  if v_updated = v_definition then
    raise exception 'La règle d’activation PalmInvest a changé : correction automatique annulée.';
  end if;
  execute v_updated;
end $$;