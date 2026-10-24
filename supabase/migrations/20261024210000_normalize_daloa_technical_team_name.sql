update public.equipes
set nom='Daloa_T1'
where regexp_replace(lower(trim(nom)),'\s+','','g')='daloa_t1'
  and nom is distinct from 'Daloa_T1';