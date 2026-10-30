alter table public.imported_phone_contacts rename column first_name to prenoms;
alter table public.imported_phone_contacts rename column last_name to nom;
comment on column public.imported_phone_contacts.nom is 'Nom du contact importé, selon le modèle CRM.';
comment on column public.imported_phone_contacts.prenoms is 'Prénom(s) du contact importé, selon le modèle CRM.';
notify pgrst, 'reload schema';
