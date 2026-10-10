-- Canonicalise les nationalités déjà enregistrées sur le code ISO du référentiel.
update public.clients c
set nationalite = r.code
from public.referentiels_systeme r
where r.categorie = 'pays_nationalite'
  and r.actif = true
  and lower(trim(c.nationalite)) = lower(trim(r.libelle))
  and c.nationalite is distinct from r.code;

update public.client_cotitulaires_mandataires c
set nationalite = r.code
from public.referentiels_systeme r
where r.categorie = 'pays_nationalite'
  and r.actif = true
  and lower(trim(c.nationalite)) = lower(trim(r.libelle))
  and c.nationalite is distinct from r.code;

update public.clients set nationalite = 'CI'
where lower(trim(nationalite)) in ('ivoirienne','ivoirien','cote d''ivoire','côte d’ivoire','côte d''ivoire');

update public.client_cotitulaires_mandataires set nationalite = 'CI'
where lower(trim(nationalite)) in ('ivoirienne','ivoirien','cote d''ivoire','côte d’ivoire','côte d''ivoire');

update public.referentiels_systeme
set metadata = metadata || jsonb_build_object('is_default', code = 'CI')
where categorie = 'pays_telephone';
