create or replace function public.verifier_carte(_code text)
returns table(
  matricule text,
  nom_complet text,
  poste text,
  type_contrat text,
  date_expiration date,
  statut text,
  valide boolean
)
language sql
stable
security definer
set search_path = public
as $function$
  select c.matricule,
         p.nom_complet,
         coalesce(c.poste, p.poste),
         c.type_contrat,
         c.date_expiration,
         c.statut,
         (c.statut = 'active' and c.date_expiration >= current_date) as valide
  from public.cartes_personnel c
  join public.profiles p on p.id = c.profile_id
  where length(_code) between 6 and 64
    and lower(c.code_verification) = lower(_code)
    and private.is_staff(auth.uid())
  limit 1
$function$;
