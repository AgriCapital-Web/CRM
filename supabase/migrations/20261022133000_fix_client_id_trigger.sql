CREATE OR REPLACE FUNCTION public.set_generated_ids()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_TABLE_NAME = 'clients' AND (NEW.id_unique IS NULL OR NEW.id_unique = '') THEN
    IF coalesce(NEW.is_internal,false) OR lower(coalesce(NEW.nom_complet,'')) LIKE '%agricapital%' THEN
      NEW.id_unique := 'AC-INTERNAL';
    ELSE
      NEW.id_unique := public.generate_client_id(NEW.type_client);
    END IF;
  ELSIF TG_TABLE_NAME = 'plantations' AND (NEW.id_unique IS NULL OR NEW.id_unique = '') THEN
    NEW.id_unique := public.generate_plantation_id();
  ELSIF TG_TABLE_NAME = 'parcelles' AND (NEW.id_unique IS NULL OR NEW.id_unique = '') THEN
    NEW.id_unique := public.generate_parcelle_id();
  ELSIF TG_TABLE_NAME = 'proprietaires_terres' AND (NEW.id_unique IS NULL OR NEW.id_unique = '') THEN
    NEW.id_unique := public.generate_proprietaire_id();
  END IF;
  RETURN NEW;
END;
$function$;
