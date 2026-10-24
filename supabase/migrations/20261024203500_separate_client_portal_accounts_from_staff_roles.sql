delete from public.user_roles ur
using public.profiles p
where p.user_id=ur.user_id and p.type_compte='client_portail';
update public.profiles
set relation_rh=null,departement=null,poste=null,equipe_id=null,updated_at=now()
where type_compte='client_portail'
  and (relation_rh is not null or departement is not null or poste is not null or equipe_id is not null);