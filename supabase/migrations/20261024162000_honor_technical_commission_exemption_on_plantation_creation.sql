do $$
declare
  v_definition text;
  v_updated text;
begin
  select pg_get_functiondef('public.generer_commission_technique_a_la_creation_plantation()'::regprocedure)
    into v_definition;
  v_updated := replace(
    v_definition,
    'v_client_id:=new.client_id; if v_client_id is null then return new; end if;',
    'v_client_id:=new.client_id; if v_client_id is null then return new; end if; if new.acquisition_id is not null and exists(select 1 from public.acquisitions a where a.id=new.acquisition_id and coalesce((a.metadata->>''commission_technique_exoneree'')::boolean,false)) then return new; end if;'
  );
  if v_updated = v_definition then
    raise exception 'La règle de commission à la création de plantation a changé : correction automatique annulée.';
  end if;
  execute v_updated;
end $$;