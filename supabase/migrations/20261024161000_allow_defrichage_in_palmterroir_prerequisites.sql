do $$
declare
  v_definition text;
  v_updated text;
begin
  select pg_get_functiondef('public.validate_formula_technical_intervention()'::regprocedure)
    into v_definition;
  v_updated := replace(
    v_definition,
    'and new.type_intervention not in (''validation_parcelle'',''piquetage'',''trouaison'',''mise_en_terre'',''autre'')',
    'and new.type_intervention not in (''validation_parcelle'',''defrichage'',''piquetage'',''trouaison'',''mise_en_terre'',''autre'')'
  );
  if v_updated = v_definition then
    raise exception 'La règle de validation des interventions PalmTerroir a changé : correction automatique annulée.';
  end if;
  execute v_updated;
end $$;