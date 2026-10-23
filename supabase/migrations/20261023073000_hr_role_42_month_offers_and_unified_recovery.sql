insert into public.app_roles (code, nom, court, description, niveau, niveau_label, actif)
values ('ressources_humaines','Responsable des Ressources Humaines','RH','Gestion des dossiers du personnel, cartes, contrats et informations RH',3,'Management',true)
on conflict (code) do update set nom=excluded.nom, court=excluded.court, description=excluded.description, niveau=excluded.niveau, niveau_label=excluded.niveau_label, actif=true, updated_at=now();

insert into public.app_permissions (code,module,action,libelle,description,actif)
values
 ('ressources_humaines.view','ressources_humaines','view','Consulter les dossiers du personnel','Consulter les cartes et dossiers RH',true),
 ('ressources_humaines.manage_cards','ressources_humaines','manage_cards','Gérer les cartes du personnel et les contrats','Créer et mettre à jour les cartes du personnel et leurs contrats',true),
 ('ressources_humaines.manage_contracts','ressources_humaines','manage_contracts','Gérer les types de contrat et leur durée','Gérer les types et durées contractuelles',true),
 ('ressources_humaines.manage_payroll','ressources_humaines','manage_payroll','Gérer les éléments RH liés à la paie','Accès aux éléments RH nécessaires à la paie',true)
on conflict (code) do update set module=excluded.module, action=excluded.action, libelle=excluded.libelle, description=excluded.description, actif=true;

insert into public.role_permissions (role_code, permission_code)
select 'ressources_humaines', p.code
from public.app_permissions p
where p.code in ('ressources_humaines.view','ressources_humaines.manage_cards','ressources_humaines.manage_contracts','ressources_humaines.manage_payroll','utilisateurs.view','utilisateurs.create','utilisateurs.update','finance.view','finance.payroll','parametres.view')
on conflict (role_code, permission_code) do nothing;

update public.grille_remuneration set taux_pourcentage=2.5, actif=true, annee_application=1, description='PalmInvest / TerraPalm — commission unique de recouvrement de 2,5 % sur chaque mensualité', updated_at=now() where code_regle='COMMERCIAL_REC_PARTENAIRE_AN1';
update public.grille_remuneration set taux_pourcentage=2.5, actif=true, annee_application=2, description='Compatibilité moteur historique — taux commun de recouvrement 2,5 %', updated_at=now() where code_regle='COMMERCIAL_REC_PARTENAIRE_AN2';
update public.grille_remuneration set taux_pourcentage=2.5, actif=true, annee_application=3, description='Compatibilité moteur historique — taux commun de recouvrement 2,5 %', updated_at=now() where code_regle='COMMERCIAL_REC_PARTENAIRE_AN3';

do $$
declare o record; form jsonb; fm jsonb; pi numeric; monthly numeric; tranches jsonb; newforms jsonb;
begin
 for o in select * from public.offres loop
   newforms := '[]'::jsonb;
   if jsonb_typeof(coalesce(o.formules_configuration,'[]'::jsonb))='array' then
     for form in select value from jsonb_array_elements(coalesce(o.formules_configuration,'[]'::jsonb)) loop
       pi := coalesce((form->>'montant_pi_par_ha')::numeric, o.montant_pi_par_ha, 0);
       monthly := coalesce((form->>'mensualite_par_ha')::numeric, o.mensualite_par_ha, 0);
       tranches := jsonb_build_array(jsonb_build_object('annee',1,'mois_debut',1,'mois_fin',42,'mois',42,'type','mensualite_unique','mensualite_par_ha',monthly,'total_periode_par_ha',monthly*42));
       fm := jsonb_set(form,'{duree_paiement_mois}','42'::jsonb,true);
       fm := jsonb_set(fm,'{tranches_paiement}',tranches,true);
       fm := jsonb_set(fm,'{montant_total_par_ha}',to_jsonb(pi+monthly*42),true);
       fm := jsonb_set(fm,'{montant_cash_par_ha}',to_jsonb(pi+monthly*42),true);
       newforms := newforms || jsonb_build_array(fm);
     end loop;
   end if;
   pi := coalesce(o.montant_pi_par_ha,0);
   monthly := coalesce(o.mensualite_par_ha,0);
   tranches := jsonb_build_array(jsonb_build_object('annee',1,'mois_debut',1,'mois_fin',42,'mois',42,'type','mensualite_unique','mensualite_par_ha',monthly,'total_periode_par_ha',monthly*42));
   update public.offres set
     duree_paiement_mois=42,
     tranches_paiement=tranches,
     formules_configuration=case when jsonb_typeof(coalesce(o.formules_configuration,'[]'::jsonb))='array' and jsonb_array_length(coalesce(o.formules_configuration,'[]'::jsonb))>0 then newforms else coalesce(o.formules_configuration,'[]'::jsonb) end,
     montant_total_par_ha=pi+monthly*42,
     montant_cash_par_ha=pi+monthly*42,
     updated_at=now()
   where id=o.id;
 end loop;
end $$;
