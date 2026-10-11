-- Keep CRM operational tables synchronized through Supabase Realtime.
-- RLS remains enabled and unchanged; this only adds the tables to the publication.
do $$
declare
  target_table text;
  target_tables text[] := array[
    'commissions',
    'documents_acquisition',
    'parcelles',
    'proprietaires_terres',
    'leads',
    'offre_formulaire_etapes',
    'offre_formulaire_documents',
    'offre_formulaire_contrats',
    'client_enquetes',
    'client_cotitulaires_mandataires',
    'interventions_techniques',
    'photos_plantation',
    'beneficiaire_attributions',
    'beneficiaire_documents',
    'rapports_visites_techniques',
    'tickets_techniques',
    'profiles'
  ];
begin
  foreach target_table in array target_tables loop
    if to_regclass(format('public.%I', target_table)) is not null
       and not exists (
         select 1
         from pg_publication_tables
         where pubname = 'supabase_realtime'
           and schemaname = 'public'
           and tablename = target_table
       ) then
      execute format('alter publication supabase_realtime add table public.%I', target_table);
    end if;
  end loop;
end
$$;
