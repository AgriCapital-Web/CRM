-- Extend the remuneration catalogue so commission amounts and rates are editable from Settings.
alter table public.grille_remuneration drop constraint if exists grille_remuneration_role_cible_check;
alter table public.grille_remuneration add constraint grille_remuneration_role_cible_check
  check (role_cible = any (array['commercial'::text,'equipe_technique'::text,'mobilisateur_foncier'::text]));
alter table public.grille_remuneration drop constraint if exists grille_remuneration_type_remuneration_check;
alter table public.grille_remuneration add constraint grille_remuneration_type_remuneration_check
  check (type_remuneration = any (array['acquisition'::text,'recouvrement_mensuel'::text,'cash'::text,'salaire_fixe'::text,'prime_ha'::text,'bonus_qualite'::text,'commission_ha_signature'::text,'commission_cash'::text,'commission_surplus_pi'::text,'commission_recouvrement'::text,'bonus_palier'::text,'objectif_mensuel'::text,'mobilisation_fonciere'::text,'commission_technique'::text]));

update public.grille_remuneration set description='Offre PalmInvest / TerraPalme — prime fixe à la vente',montant=10000,taux_pourcentage=null,annee_application=1,actif=true,updated_at=now()
where role_cible='commercial' and type_remuneration='acquisition' and (lower(coalesce(description,'')) like '%palminvest%' or lower(coalesce(description,'')) like '%terrapalm%');
update public.grille_remuneration set description='Offre Essentiel (PalmTerroir) — prime fixe à la vente',montant=15000,taux_pourcentage=null,annee_application=1,actif=true,updated_at=now()
where role_cible='commercial' and type_remuneration='acquisition' and lower(coalesce(description,'')) like '%palmterroir%';
update public.grille_remuneration set description='Offre flexible — prime fixe à la vente',montant=5000,taux_pourcentage=null,annee_application=1,actif=true,updated_at=now()
where role_cible='commercial' and type_remuneration='acquisition' and lower(coalesce(description,'')) like '%flexible%';
update public.grille_remuneration set description='Offre flexible — 2,5 % par mensualité — année 1',montant=null,taux_pourcentage=2.5,annee_application=1,actif=true,updated_at=now()
where role_cible='commercial' and type_remuneration='recouvrement_mensuel' and lower(coalesce(description,'')) not like '%palminvest%' and lower(coalesce(description,'')) not like '%terrapalm%' and annee_application=1;

insert into public.grille_remuneration(role_cible,type_remuneration,montant,taux_pourcentage,annee_application,description,actif)
select v.role_cible,v.type_remuneration,v.montant,v.taux_pourcentage,v.annee_application,v.description,true
from (values
 ('commercial','acquisition',5000::numeric,null::numeric,1,'Offre flexible — prime fixe à la vente'),
 ('commercial','recouvrement_mensuel',null::numeric,2.5::numeric,2,'Offre flexible — 2,5 % par mensualité — année 2'),
 ('commercial','recouvrement_mensuel',null::numeric,2.5::numeric,3,'Offre flexible — 2,5 % par mensualité — année 3'),
 ('commercial','recouvrement_mensuel',null::numeric,2.5::numeric,1,'Offre PalmInvest / TerraPalme — 2,5 % par mensualité — année 1'),
 ('commercial','recouvrement_mensuel',null::numeric,2.0::numeric,2,'Offre PalmInvest / TerraPalme — 2 % par mensualité — année 2'),
 ('commercial','recouvrement_mensuel',null::numeric,1.5::numeric,3,'Offre PalmInvest / TerraPalme — 1,5 % par mensualité — année 3'),
 ('mobilisateur_foncier','mobilisation_fonciere',10000::numeric,0::numeric,1,'Propriétaire foncier validé — prime par hectare mobilisé'),
 ('equipe_technique','commission_technique',5000::numeric,0::numeric,1,'Commission technique par mise en terre réalisée')
) v(role_cible,type_remuneration,montant,taux_pourcentage,annee_application,description)
where not exists(select 1 from public.grille_remuneration g where g.role_cible=v.role_cible and g.type_remuneration=v.type_remuneration and g.annee_application=v.annee_application and lower(coalesce(g.description,''))=lower(v.description));
