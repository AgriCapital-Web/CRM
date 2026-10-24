begin;
set local app.internal_account_link = 'true';
update public.profiles
set relation_rh=null,departement=null,poste=null,equipe_id=null,updated_at=now()
where type_compte='client_portail'
  and (relation_rh is not null or departement is not null or poste is not null or equipe_id is not null);
commit;