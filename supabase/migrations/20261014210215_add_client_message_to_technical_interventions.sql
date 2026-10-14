alter table public.interventions_techniques add column if not exists contenu_client text;

comment on column public.interventions_techniques.contenu_client is 'Message destiné au client associé au compte rendu de l’intervention technique.';
