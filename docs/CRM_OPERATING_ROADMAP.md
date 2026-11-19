# AgriCapital CRM — feuille de route opérationnelle et mémoire durable

**Dernière mise à jour : 19 novembre 2026**  
**Référence à lire avant tout nouveau travail : ce document et le fichier `AGENTS.md`.**

Ce document consolide les décisions et règles AgriCapital présentes dans le contexte projet accessible, les changements déjà appliqués et les dossiers en attente. Il sert de mémoire durable entre conversations et entre assistants. Il ne prétend pas reconstituer des conversations historiques qui ne seraient pas accessibles dans le contexte courant. Toute nouvelle décision confirmée doit être ajoutée ici, sans effacer les décisions antérieures encore valides.

## 1. Règles de travail et de décision

- L'utilisateur attend l'exécution réelle des tâches, pas des propositions, maquettes ou comptes rendus répétitifs.
- Ne pas demander à nouveau une information déjà présente dans ce document ou dans la base.
- Avant chaque intervention, vérifier le dépôt, le schéma et les données réelles, l'historique des migrations et l'état du déploiement.
- Une tâche n'est terminée qu'après application de la migration, vérification des données, commit GitHub et déploiement de production lorsque le travail touche le CRM.
- Après chaque tâche terminée, mettre à jour cette feuille de route dans le même commit que le travail. Y inscrire la migration, le commit, les vérifications et les dépendances restantes.
- En cas de conflit entre deux demandes, la consigne explicite la plus récente ne remplace que le point contradictoire. Toutes les autres décisions confirmées restent valables.
- Ne jamais inventer de date, mode de paiement, référence, justificatif, convention foncière, date de signature, document juridique ou donnée client.
- Ne jamais déclarer un paiement réel annulé lorsqu'il s'agit seulement d'un brouillon administratif.
- Ne pas envoyer de message, e-mail, SMS ou WhatsApp aux clients sans autorisation explicite.
- Ne pas contourner RLS, les contrôles de rôle ou les triggers par falsification de JWT, désactivation de triggers ou changement de rôle de session.
- Les plantations et parcelles sont alimentées par les workflows et fonctions métier. Pas d'action manuelle de création/modification/suppression dans l'interface ; les migrations contrôlées et RPC autorisées restent des opérations techniques.
- Pour un tarif personnalisé, modifier le dossier client, jamais le catalogue partagé.
- Pour un dossier non facturable, ne créer ni facture, ni échéancier, ni dette.

## 2. Cibles techniques

| Élément | Valeur |
|---|---|
| Dépôt GitHub | `AgriCapital-Web/CRM` |
| Branche de production | `main` |
| Projet Supabase CRM | `rfzfsmpsuempafhkqhra` |
| Projet Vercel | `prj_WH9tAjEHUBgD4fltzFNCquoOBvWC` |
| Équipe Vercel | `team_hyengWkA9yBTWFZjc8GllDSF` |

Ne pas confondre le projet Supabase CRM avec le projet distinct `sxsolthkxfavimitoowy`.

## 3. Règles métier CRM à préserver

### 3.1 Propriétaire foncier et client

- Le propriétaire foncier juridique est enregistré dans `proprietaires_terres`.
- Un propriétaire peut aussi avoir un profil CRM `beneficiaire_particulier`, mais ce profil n'est pas une souscription commerciale.
- Un profil propriétaire bénéficiaire particulier ne doit porter aucune offre, acquisition, facture, paiement, mensualité, échéancier financier ou dette.
- Le champ `mode_paiement='echeancier'` peut être imposé par le schéma sur certains profils bénéficiaires. Dans ce cas, il s'agit d'une valeur technique obligatoire : les montants doivent rester à zéro, la durée vide et aucun paiement/échéancier ne doit être créé.
- Un même propriétaire peut être associé à plusieurs clients commerciaux PalmInvest. L'index unique `uq_clients_proprietaire_portal` doit garantir l'unicité du profil portail propriétaire/bénéficiaire, pas empêcher plusieurs clients commerciaux d'être rattachés au même propriétaire.

### 3.2 Parcelle partagée PalmInvest

- La plantation du client et celle du propriétaire sont deux enregistrements distincts.
- Pour un lot AgriCapital de 1 ha sur une parcelle partagée : 1 ha pour le client PalmInvest et 1 ha pour le propriétaire en bénéficiaire particulier.
- La quote-part propriétaire n'est jamais un lot AgriCapital et ne doit pas être ajoutée à la superficie commerciale du client.
- L'activation partagée est représentée par `plantation_activations`, avec `surface_client_ha=1` et `surface_proprietaire_ha=1`.
- La plantation propriétaire porte `role_attribution='beneficiaire_particulier'` et le `client_id` du profil bénéficiaire du propriétaire.
- Les deux plantations peuvent générer chacune une commission technique de 5 000 FCFA lorsque la grille active le prévoit.
- Les fonctions de synchronisation doivent reconnaître le profil propriétaire bénéficiaire et éviter les doublons.

### 3.3 Convention foncière en attente

- L'absence de convention active ne doit pas empêcher de rattacher une plantation et une activation partagée lorsque le propriétaire, la parcelle et le lot sont correctement identifiés et que la direction a demandé de compléter la convention ultérieurement.
- Dans ce cas, l'acquisition reste `statut='souscrite'`, `validation_statut='a_valider'`, avec `metadata.foncier_convention_en_attente=true`.
- La plantation et le paiement réellement confirmés peuvent être actifs/valides ; cela ne valide pas la convention ni l'acquisition foncière.
- Ne jamais créer une convention fictive, réutiliser celle d'une autre parcelle ou inventer une référence/date de signature.
- Pour finaliser après la mise à jour manuelle de la convention, celle-ci doit être active et liée au bon propriétaire et à la bonne parcelle. Le même identifiant de convention doit être renseigné sur `parcelles.convention_id` et `lots_hectares.convention_id`. Ensuite, enlever le drapeau d'attente et passer l'acquisition à active/valide par une mise à jour normale : le trigger `validate_client_acquisition_foncier` revérifie le lot et la convention.
- La fonction `sync_palminvest_lot_activation` doit accepter une plantation client de 1 ha et créer/synchroniser séparément la quote-part propriétaire de 1 ha. Elle ne doit pas exiger que la ligne de plantation du client fasse 2 ha.
- Ne pas inférer que les étapes antérieures (validation parcelle, défrichage, piquetage, trouaison) ont été réalisées à la date de mise en terre. N'enregistrer que les dates réellement connues.

### 3.4 Paiements et commissions

- Les champs mode de paiement et référence restent nuls s'ils ne sont pas fournis.
- Les commissions techniques sont distinctes par plantation, même si elles proviennent de la même intervention.
- Le générateur doit reconnaître les plantations de rôle `beneficiaire_particulier` liées au propriétaire de la parcelle.
- Ne pas créer de seconde écriture financière pour un paiement déjà synchronisé.
- Les brouillons de versement administratifs ne sont pas des paiements réels annulés.
- Les lignes de commissions dupliquées/bruit administratif marquées annulées ne doivent pas être décrites comme des règlements réels annulés.
- Le champ `agent_technique_id` d'une intervention ne doit pas être renseigné en contournant le contrôle d'affectation. Les commissions peuvent être reliées au profil rémunéré lorsque le règlement est confirmé ; ne pas falsifier l'identité de l'agent d'intervention.

## 4. Dossier LOUKOU Paulin — état appliqué

### 4.1 Données commerciales et opérationnelles

- Client : **LOUKOU Paulin**.
- Profil client : `bd329d85-a259-477b-a98e-7058cd982d7f`.
- Prospect source : `13464613-ff8d-414a-977e-cb5382d8930e`.
- Lead source : `0611d168-9e66-46ce-b32e-04ace55de263`.
- Prospect et lead reliés au même client, identité corrigée et statuts convertis.
- Offre : PalmInvest, formule `PALMINVEST_AUTONOME` / Autonome.
- Superficie : 1 ha.
- Paiement initial : 90 700 FCFA, reçu le 1er novembre 2026.
- Mensualité : 56 600 FCFA pendant 42 mois.
- Total contractuel : 2 467 900 FCFA.
- Mise en terre : 3 novembre 2026.
- Le mode de paiement et la référence du paiement initial ne sont pas renseignés, faute d'information.
- Le snapshot de l'offre client est synchronisé sur celui de l'acquisition et les champs offre/formule sont remplis.

### 4.2 Parcelle et lots

- Propriétaire juridique : Zongo Boukary, propriétaire enregistré dans `proprietaires_terres` sous l'identifiant `42a884da-f5b8-43d3-954c-95ff09b7d3a9`.
- Parcelle : `ac75c9cd-5d8c-437b-b8b6-664d4299a40e`, référence `PAR-000008`, code parcelle `PARC013`, village GONATÉ.
- Surface totale : 6 ha ; part AgriCapital : 3 ha ; part propriétaire : 3 ha.
- Lot AgriCapital L01 : `deabcd85-9010-4523-9090-14ed0c2381e4`, 1 ha, attribué à Paulin.
- Lots L02 et L03 : restent disponibles, 1 ha chacun.
- Surface AgriCapital attribuée : 1 ha ; surface disponible AgriCapital : 2 ha.
- La convention foncière de cette parcelle n'a pas été créée ni falsifiée. La direction a indiqué qu'elle la mettra à jour elle-même.

### 4.3 Profil bénéficiaire particulier de Zongo Boukary

- Le profil CRM existant de Zongo a été requalifié en `beneficiaire_particulier` : `ebb85e04-a6dc-49af-94cc-ae6ab1132c1d`.
- L'identité juridique de propriétaire reste dans `proprietaires_terres`.
- Ce profil bénéficiaire représente 1 ha sur cette parcelle ; la surface foncière totale de 6 ha reste conservée dans la parcelle et les métadonnées.
- Aucune offre, acquisition, mensualité, facture, paiement ou dette n'est créée pour Zongo.
- Les montants commerciaux de son profil restent à zéro. Aucun échéancier financier n'est créé.

### 4.4 Plantations, activation et intervention

- Acquisition Paulin : `39be445f-e724-45fa-9770-d779c5dda280`.
- L'acquisition reste souscrite et à valider tant que la convention active n'est pas liée à la parcelle et au lot. Son étape technique est `mise_en_terre_realisee`.
- Activation partagée : `81f51e7b-f823-445d-b6e2-268d1ae87d8d`, 1 ha client + 1 ha propriétaire.
- Plantation Paulin : `e41f2484-dcca-4fce-9ea9-27fb33a7d109`, 1 ha, active, mise en terre le 03/11/2026.
- Plantation bénéficiaire particulier Zongo : `26c684b3-178a-40d5-9c2b-4eedd9de3b45`, 1 ha, active, mise en terre le 03/11/2026.
- Intervention de mise en terre : `f7c7326b-383b-4fbc-8ac4-0ffc7612da66`, 143 plants prévus et 143 réalisés.
- `agent_technique_id` reste nul car le contrôle d'affectation exige une session autorisée ; ne pas contourner ce contrôle. Les deux commissions confirmées sont bien reliées au profil rémunéré Jean-Marie.

### 4.5 Paiement et commissions

- Paiement initial : `ff00a0e2-9ae4-4893-83b3-b8186da81253`, 90 700 FCFA, valide, daté du 01/11/2026.
- Deux commissions techniques de 5 000 FCFA ont été enregistrées payées le 14/11/2026 au profil Jean-Marie :
  - `75b9225b-a056-431f-a85d-63ff042da3b1` — plantation Paulin.
  - `9f6fbaf9-6a6d-4114-a060-d27fb16e5e18` — plantation bénéficiaire particulier Zongo.
- Deux écritures financières de commission de 5 000 FCFA sont présentes et valides.
- Portefeuille de commissions Jean-Marie : brut 45 000 FCFA ; réglé 36 000 FCFA ; solde 9 000 FCFA. Le détail distingue les 26 000 FCFA antérieurs et les 10 000 FCFA réglés le 14/11/2026.

### 4.6 Migrations et corrections associées

- `20261119153000_reconcile_shared_parcel_beneficiary_and_register_loukou_paulin` : appliquée sur Supabase. Corrige la logique d'acquisition foncière en attente, l'activation PalmInvest 1 ha + 1 ha, le profil bénéficiaire particulier, les plantations, l'intervention, le paiement, les commissions et l'index unique propriétaire.
- `20261119163000_finalize_loukou_client_offer_snapshot_and_harden_owner_sync` : appliquée sur Supabase. Corrige les champs offre/formule du client, le snapshot, le récapitulatif des commissions et le bug PL/pgSQL où `PERFORM set_config` écrasait la variable `FOUND` avant le choix INSERT/UPDATE dans la synchronisation propriétaire.
- La synchronisation des étapes techniques antérieures ne doit plus inventer des réalisations à la date de mise en terre.
- Vérifications effectuées : client et prospect/lead reliés ; lot L01 attribué ; L02/L03 disponibles ; activation 1+1 ; deux plantations actives ; paiement initial valide ; deux commissions payées et deux écritures financières ; profil Zongo sans offre ni flux financier ; acquisition toujours en attente de convention.

## 5. Réconciliation historique des commissions Jean-Marie

- Trois lignes de `portefeuille_versements` qui étaient des brouillons administratifs incohérents/redondants ont été clôturées comme annulées avec montant payé nul. Cela ne correspond pas à des paiements réels annulés.
- Les quatre commissions techniques payées de 5 000 FCFA chacune et l'acompte de 6 000 FCFA du 19/10/2026 sont conservés.
- Les lignes de commission annulées/dupliquées étaient des enregistrements de bruit administratif, pas des paiements réels annulés.
- Avant Paulin/Zongo : brut 35 000 FCFA, réglé 26 000 FCFA, solde 9 000 FCFA.
- Après les deux nouvelles commissions réglées le 14/11 : brut 45 000 FCFA, réglé 36 000 FCFA, solde 9 000 FCFA.

## 6. Autres dossiers clients à traiter — ne pas inventer les données manquantes

### DJAHA KOUAME

- Prospect existant : `27ca3b84-d3d3-4e7c-9bc0-a75b51f1c25a`.
- 2 ha PalmInvest Autonome ; paiement initial 181 400 FCFA ; mensualité 113 200 FCFA ; 42 mois ; total 4 935 800 FCFA.
- Localité de résidence : GOGOGUHÉ, quartier Extension.
- Pas de plantation, pas de parcelle réservée, pas de date de mise en terre. Ne pas inventer de parcelle ni d'intervention.

### KONAN Yao Lambert

- Lead existant à convertir sans doublon ; aucun prospect/client confirmé au dernier contrôle.
- 0,5 ha PalmTerroir Flexible ; inscription 27/09/2026 ; paiement 34 000 FCFA le 28/09/2026 ; mise en terre 30/09/2026.
- Tarif initial catalogue : 65 000 FCFA/ha, soit 32 500 FCFA pour 0,5 ha.
- Mensualité 6 300 FCFA ; 36 mois ; total 259 300 FCFA.
- Trop-perçu 1 500 FCFA : crédit de 7 jours (1 470 FCFA) et reliquat de 30 FCFA à conserver dans un registre de crédit auditable. Ne pas créer une deuxième recette.
- Ne pas précréer une parcelle ; l'intervention technique crée la parcelle/plantation automatiquement. Ne pas utiliser le domicile comme localisation foncière.

### KOUASSI KOUADIO Patrice

- 1,5 ha PalmTerroir personnalisé ; paiement initial reçu : 30 000 FCFA le 07/11/2026 ; inscription 06/11/2026 ; mise en terre 09/11/2026.
- Initial attendu : 52 500 FCFA ; solde initial : 22 500 FCFA.
- Mensualité 10 000 FCFA pendant 36 mois ; total 412 500 FCFA.
- Appliquer le tarif personnalisé au seul dossier client, sans modifier le catalogue commun.
- Pas de lead/prospect trouvé au dernier contrôle ; téléphone connu dans le contexte projet. Aucune localité foncière confirmée. Ne pas en inventer.
- Ne pas précréer la parcelle ; laisser le workflow d'intervention la créer.

### Jacques KOUAKOU KOUAME

- Associé bénéficiaire de 6,5 ha, explicitement non facturable.
- Aucun client/propriétaire correspondant confirmé ; téléphone inconnu et `clients.telephone` est obligatoire.
- Ne créer ni client, ni facture, ni échéancier, ni dette tant que les informations nécessaires ne sont pas fournies.

## 7. Autres travaux techniques déjà connus

- `src/lib/finance-categories.ts` : catégorie `SERVICES` ajoutée ; commit `e49cece117842c8e4d4486b210aa5cd1c0a29a9d` ; déploiement de production antérieur `dpl_iDzb7vucrpMjRxeRyNDZxPVNV1xb`.
- `supabase/migrations/20261114150000_technical_commissions_include_owner_plantations.sql` : ajout du lien `commissions.intervention_id`, index anti-doublon et générateurs de commissions pour les plantations propriétaire ; commit `28f1ef9ccceecbd96f256d67e742889db2571a87`.
- Le cache hors ligne actuel concerne l'application et ses ressources statiques ; le cache hors ligne des données métier CRM n'a pas été implémenté.
- Ne pas présenter ce travail hors ligne comme terminé.

## 8. Déploiement et journal des tâches

### État au 19/11/2026

- Les deux migrations Paulin/shared parcel sont appliquées et les données ont été vérifiées dans Supabase.
- Commits des migrations : `8b88a541154c53336587f184ca73d315286c3814` et `0a78e918e0406a4ee2ef81643b58aca9f0c9abe8`.
- Le commit de documentation et l'état du déploiement Vercel doivent être ajoutés ici après création de la présente feuille de route et du commit correspondant.
- Le seul élément foncier restant sur Paulin est le rattachement de la convention active par la direction. Ne pas fermer ce point avant vérification de `parcelles.convention_id`, `lots_hectares.convention_id`, du statut de la convention et de la validation de l'acquisition.

### Modèle obligatoire pour chaque nouvelle tâche terminée

Ajouter une entrée datée avec :
- demande et décision métier conservée ;
- fichiers/migrations modifiés ;
- commit GitHub ;
- migration Supabase appliquée ;
- vérifications de données et de non-duplication ;
- déploiement Vercel (ID, environnement, statut READY) ;
- éléments restant à faire et responsable de la prochaine action.

**Règle permanente : après chaque tâche achevée, mettre à jour cette feuille de route automatiquement. Lorsqu'un nouvel assistant arrive, il doit lire `AGENTS.md` puis ce document et reprendre à partir de l'état vérifié, sans demander à l'utilisateur de reprendre toute l'histoire.**
