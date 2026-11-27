# AgriCapital CRM — feuille de route opérationnelle et mémoire durable

**Dernière mise à jour : 24 novembre 2026**  
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

### 3.3 Convention foncière et validation métier

- Consigne explicite du PDG du 19/11/2026 : l'absence de convention active ne doit plus bloquer la validation métier d'une acquisition lorsque le lot, la parcelle, le propriétaire et la quote-part sont correctement identifiés.
- Le trigger `validate_client_acquisition_foncier` continue de contrôler le lot cible, son rattachement à la parcelle, la quote-part AgriCapital, le propriétaire partenaire et la superficie PalmInvest. Lorsque `validation_statut='valide'`, il autorise l'acquisition à passer à `statut='active'`, même si `metadata.foncier_convention_en_attente=true`.
- La validation de l'acquisition ne vaut pas création ni validation juridique de la convention. Le drapeau `foncier_convention_en_attente` reste conservé pour la traçabilité jusqu'au rattachement réel de la convention par la direction.
- Ne jamais créer une convention fictive, réutiliser celle d'une autre parcelle ou inventer une référence/date de signature.
- La convention peut être ajoutée ultérieurement sur la bonne parcelle et les bons lots, sans revenir sur la validation métier déjà effectuée.
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
- L'acquisition a été validée par le PDG le 19/11/2026 : `statut='active'`, `validation_statut='valide'`. Le drapeau `metadata.foncier_convention_en_attente=true` reste conservé ; la convention sera rattachée par la direction ultérieurement. L'étape technique reste `mise_en_terre_realisee`.
- Activation partagée : `81f51e7b-f823-445d-b6e2-268d1ae87d8d`, 1 ha client + 1 ha propriétaire.
- Plantation Paulin : `e41f2484-dcca-4fce-9ea9-27fb33a7d109`, 1 ha, statut base `actif`, mise en terre le 03/11/2026.
- Plantation bénéficiaire particulier Zongo : `26c684b3-178a-40d5-9c2b-4eedd9de3b45`, 1 ha, statut base `active`, mise en terre le 03/11/2026.
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

- Client créé et validé : `ecbe72e6-171e-4b78-923a-31b34e6f53bc`. Acquisition : `ee3c5707-77dc-43c9-81ef-83ba52e90d61`, active et validée. Lead source `51f06de0-1d5b-4195-9bc6-48f17859b377` converti et relié au client.
- 0,5 ha PalmTerroir Flexible (+) ; inscription 27/09/2026 ; paiement 34 000 FCFA le 28/09/2026 ; mise en terre déclarée le 30/09/2026.
- Tarif initial contractuel : 65 000 FCFA/ha, soit 32 500 FCFA pour 0,5 ha ; mensualité 6 300 FCFA pendant 36 mois ; total 259 300 FCFA.
- Paiement initial validé : `10573e6b-bab9-42ed-9165-22214eb52e7d`, 34 000 FCFA ; mode et référence laissés nuls car non communiqués.
- Trop-perçu de 1 500 FCFA conservé dans un mouvement de crédit unique : 7 jours (1 470 FCFA) et reliquat de 30 FCFA. Aucun second encaissement créé.
- Aucune parcelle n'a été précréée ; la localisation foncière reste à renseigner par le workflow technique. Le champ `compte_actif` reste faux car aucun compte portail Auth n'est rattaché ; la fiche client et l'acquisition sont validées.

### KOUASSI KOUADIO Patrice

- Client créé et validé : `31748f03-e2a2-4e17-8609-87b51a9d4b02`. Acquisition : `081648b8-1d31-488c-9317-5b018f4d8efb`, active et validée.
- 1,5 ha PalmTerroir personnalisé ; inscription 06/11/2026 ; mise en terre déclarée le 09/11/2026.
- Initial attendu : 52 500 FCFA ; paiement partiel validé : `9b7ee7df-6efd-4236-96b9-8feac55aed12`, 30 000 FCFA le 07/11/2026 ; solde initial : 22 500 FCFA. Mode et référence laissés nuls.
- Mensualité 10 000 FCFA pendant 36 mois ; total 412 500 FCFA. Le tarif personnalisé est enregistré au niveau du client et de son acquisition uniquement ; le catalogue commun n'a pas été modifié.
- Aucune parcelle n'a été précréée ; aucune localité foncière n'est inventée. Le champ `compte_actif` reste faux car aucun compte portail Auth n'est rattaché ; la fiche client et l'acquisition sont validées.

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
- L'acquisition Paulin a été validée et passée active par le PDG le 19/11/2026, malgré la convention active encore à rattacher. Le drapeau `foncier_convention_en_attente=true` reste conservé pour la traçabilité juridique ; ce point ne bloque plus la validation métier. La direction doit toujours rattacher la convention réelle lorsqu'elle sera disponible.

### Réconciliation clients et acquisitions — 19/11/2026

- Les 11 fiches clients déjà présentes ont été contrôlées : elles portent `validation_statut='valide'`.
- KONAN Yao Lambert et KOUASSI KOUADIO Patrice ont été enregistrés comme clients, chacun avec son acquisition PalmTerroir active et validée ; le lead de Yao Lambert est converti et relié au client.
- Les paiements initiaux confirmés ont été inscrits dans `paiements` et synchronisés au registre financier. Le crédit de trop-perçu de Yao Lambert est auditable. Les modes de paiement et références non communiqués restent nuls.
- L'acquisition Paulin est désormais active et validée par le PDG sans convention active, conformément à la nouvelle consigne. Le drapeau d'attente foncière reste présent pour la traçabilité.
- DJAHA KOUAME reste un prospect PalmInvest de 2 ha : aucune parcelle/lot ne lui a été affecté et aucun paiement n'est enregistré faute de date de réception. Ne pas le convertir en acquisition sans allocation foncière confirmée.
- Migrations Supabase appliquées : `20261119191000_allow_authorized_acquisition_validation_without_active_convention`, `20261119192000_validate_paulin_acquisition_without_active_convention`, `20261119193000_register_and_validate_yao_lambert_and_patrice`, `20261119194000_add_authorized_account_request_profile_sync`, `20261119195000_align_boty_account_request_role_and_phone`.

### Comptes utilisateurs et bienvenue automatique — 19/11/2026

- BOTI BI TRA JULES : profil `bc0da3ca-97c4-49c5-886d-4312590c4615`, demande `ba094701-7134-4c8f-b6fb-56e0b4c659d3`, rôle attribué `chef_equipe_commercial`, poste harmonisé « Chef d’équipe commerciale », téléphone synchronisé `+2250703537932`.
- Le profil est marqué actif, mais la demande reste `en_attente` et `auth.users.email_confirmed_at` est nul. Le compte n'est donc pas encore prêt à se connecter. L'approbation doit passer par la fonction Auth sécurisée `approve-account-request`, qui confirme l'e-mail, active le profil, persiste le rôle et clôture la demande. Ne pas modifier directement `auth.users` par SQL.
- La RPC sécurisée `admin_sync_account_request_profile` permet à la fonction d'approbation de synchroniser le téléphone et le poste malgré le trigger de protection du profil ; elle vérifie la permission `parametres.manage_users` et est réservée au service role.
- Après approbation, la fonction crée une notification interne `account_welcome` dédupliquée et la fonction `send-account-approved-notification` envoie le SMS de bienvenue via Senndo. Le SMS contient le nom complet et reste limité à 150 caractères.
- SMS BOTI BI TRA JULES : « BOTI BI TRA JULES, bienvenue chez AgriCapital ! Votre accès est activé. Connectez-vous : app.agricapital.ci/login » (113 caractères).
- Le bouton d'approbation de `AccountRequests.tsx` affiche maintenant le résultat réel de l'envoi SMS/e-mail. Après le déploiement, le PDG devra relancer l'action « Approuver » sur la demande encore en attente ; cette action finalisera la confirmation Auth et déclenchera le SMS. Aucun SMS n'est prétendu envoyé avant cette approbation.


### Déploiement et contrôles de la tâche — 19/11/2026, 16:22 UTC

- Commit GitHub final : `2f3213d9386d5900d13c6fd73edfe78d142810a1` — le commit `4f87799d4c12ad70cc40d79c30f59151436fdb62` contient les migrations métier ; les commits `216fbce5344e36564c881d95c90070d5ca2e4234`, `52a541e764c083f3ab9e6a8d275b919d8a592f0f` et `2f3213d9386d5900d13c6fd73edfe78d142810a1` ajoutent respectivement l'approbation sécurisée, le SMS/e-mail et le retour d'état dans l'interface.
- Déploiement Vercel production final : `dpl_GQ3RhoqMr5Ux7QXEVP23oYBt9hEi`, état **READY**, commit exact `2f3213d9386d5900d13c6fd73edfe78d142810a1`, alias `https://app.agricapital.ci`.
- Contrôle HTTP de `https://app.agricapital.ci` : **200 OK**.
- Edge Function `approve-account-request` déployée active, version 126. Edge Function `send-account-approved-notification` déployée active, version 43.
- Le bouton d'approbation utilise maintenant la RPC `admin_sync_account_request_profile` pour synchroniser le téléphone et le poste sans contourner le trigger de protection ; l'approbation confirme l'adresse Auth, active le profil, attribue le rôle, crée une notification interne dédupliquée et appelle le service de bienvenue.
- Le SMS de bienvenue est construit avec le nom complet, contrôlé à 150 caractères maximum et envoyé avec une clé d'idempotence. L'interface affiche le résultat réel de l'envoi SMS et e-mail.
- BOTI BI TRA JULES : rôle `chef_equipe_commercial`, poste « Chef d’équipe commerciale », téléphone `+2250703537932`, profil actif. La demande reste toutefois `en_attente` et `email_confirmed_at` est nul ; le clic d'approbation antérieur n'a donc pas terminé le workflow Auth. Après déploiement, le PDG doit relancer une seule fois « Approuver » sur cette demande pour finaliser la confirmation Auth et déclencher le SMS. Aucun SMS n'a été envoyé ni déclaré envoyé avant cette étape.

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


### Vérification finale du déploiement — 19/11/2026, 15:06 UTC

- Déploiement Vercel de production contrôlé : `dpl_D71kz7YzTFM7HuYsMKpvjoWJe7qR`, commit `753b83c39ad6b69581a751e135b33e35c956a428`, état **READY**.
- Alias de production associé : `https://app.agricapital.ci`.
- Vérification HTTP de l'alias : réponse **200 OK**, HTML de l'application AgriCapital 360 servi par Vercel.
- Vérification Supabase finale : 13 fiches clients non internes, toutes `validation_statut='valide'` ; 8 acquisitions, toutes `validation_statut='valide'` (4 `active`, 4 `souscrite`) ; acquisition Paulin active et validée malgré le drapeau de convention en attente ; Yao Lambert et Patrice enregistrés, acquisitions validées, paiements initiaux valides et synchronisés au grand livre ; lot L01 attribué ; L02/L03 disponibles ; plantations Paulin/Zongo 1 ha chacune ; deux commissions de 5 000 FCFA payées ; portefeuille Jean-Marie brut 45 000 FCFA, payé 36 000 FCFA.
- La migration Supabase est déjà appliquée : aucune réexécution nécessaire. Les deux plantations sont bien présentes ; le contrôle final confirme les deux statuts réels distincts (`actif` pour Paulin, `active` pour Zongo).
- Aucune autre modification applicative n'était nécessaire pour ce contrôle. La convention foncière de Zongo reste à renseigner par la direction ; jusqu'à cette mise à jour, l'acquisition reste à valider et ne doit pas être présentée comme juridiquement finalisée.


## Reprise et finalisation du 19 novembre 2026

### Données commerciales, acquisitions et technique
- Les 8 acquisitions commerciales existantes sont maintenant toutes au statut `active`, avec `validation_statut='valide'`. Aucune acquisition validée ne reste au statut `souscrite`.
- La validation de Paulin LOUKOU reste active sans convention foncière active, conformément à la décision explicite de la direction. Le suivi juridique de la convention reste une information séparée et ne bloque plus la validation opérationnelle.
- Les quatre dossiers historiquement plantés dont l'acquisition était restée `souscrite` ont été remis en cohérence avec leur plantation et leur parcelle : YAO KOUAKOU GUY LAURENT, TIONON MADOU, KOUAKOU KONAN DONALD et KOUAME FERDINAND KOUAKOU.
- YAO Lambert KONAN : acquisition 0,5 ha active et validée, mise en terre au 30/09/2026, parcelle client saturée, plantation active. Intervention technique réalisée et liée à la plantation. Compte portail actif et provisionné.
- KOUASSI KOUADIO Patrice : acquisition 1,5 ha active et validée, mise en terre au 09/11/2026, parcelle client saturée, plantation active. Intervention technique réalisée et liée à la plantation. Compte portail actif et provisionné.
- Pour ces deux plantations, 72 et 215 plants sont des quantités **prévues** calculées sur la densité de référence de 143 plants/ha. Les quantités réellement mises en terre et le taux de réussite restent volontairement non renseignés, faute de relevé confirmé.
- Les comptes portail de YAO Lambert KONAN et KOUASSI KOUADIO Patrice ont été créés via `refresh_client_account_activation` puis `provision-client-account`. Les profils sont classés `type_compte='client'`, `relation_rh='Client'`, `poste='client'`; les téléphones sont confirmés. Les clients pourront initialiser leur code portail par OTP.
- Vérification globale après migration : 13 fiches clients présentes, 13 validées et 13 comptes actifs ; 8 acquisitions, 8 validées et 8 actives ; 13 plantations sans statut d'attente de paiement.

### Compte BOTI BI TRA JULES et notifications de bienvenue
- Demande `ba094701-7134-4c8f-b6fb-56e0b4c659d3` approuvée avec le rôle `chef_equipe_commercial`, par l'acteur PDG autorisé `bd9579fd-1d07-4431-9cc4-b57dfeeab593`.
- Profil actif, rôle principal attribué, adresse `botibitrajules@gmail.com` confirmée dans Auth. Téléphone enregistré : `+2250703537932`.
- SMS de bienvenue envoyé avec succès : 113 caractères, nom complet compris. La création de la notification interne est également confirmée. L'envoi e-mail n'a pas été confirmé par le fournisseur ; le SMS, demandé par la direction, a bien été envoyé.
- `approve-account-request` version 128 déclenche maintenant côté serveur la notification de bienvenue après chaque approbation, avec contrôle du secret interne et vérification des permissions de l'acteur. `AccountRequests.tsx` ne lance plus un second envoi, ce qui évite les doublons.
- `provision-client-account` version 47 classe les profils provisionnés comme comptes clients, y compris lors d'un appel idempotent sur un compte déjà lié.

### Finance & Comptabilité et affichage des clients
- `Clients.tsx` trie désormais les identifiants clients par ordre décroissant : les fiches les plus récentes apparaissent en premier.
- `Finance.tsx` propose une recherche dans les catégories des sorties et des dépenses à payer.
- Les options de frais restent cohérentes : « Sans frais » pour les entrées et apports concernés ; « Avec les frais » pour les sorties et paiements concernés.
- Les formulaires de mouvement associé et de paiement de paie disposent désormais, eux aussi, d'un choix exclusif entre référence et téléversement du justificatif. Le paiement de paie prend également en charge l'option « Avec les frais ».
- Les formulaires d'entrée, de sortie, de dépense à payer et de paiement client conservent leur case de bascule : un seul champ est affiché à la fois, référence ou fichier.
- Migration `20261119199000_add_payroll_payment_fees_and_file_proof` : la fonction de paiement de paie enregistre séparément le montant de base, les frais éventuels et le justificatif, sans perdre le contrôle d'autorisation.

### Migrations de cette reprise
- `20261119196000_backfill_yao_lambert_and_patrice_planting_workflows`
- `20261119197000_finalize_client_portal_profiles_and_planting_links`
- `20261119198000_activate_all_validated_planting_acquisitions`
- `20261119199000_add_payroll_payment_fees_and_file_proof`
- Les quatre migrations ont été appliquées avec succès sur le projet Supabase CRM `rfzfsmpsuempafhkqhra`.

### Points nécessitant une confirmation de la direction
- Aucun client, lead ou prospect nommé « Diop » n'a été retrouvé dans les tables CRM vérifiées. Ne pas créer de fiche incomplète : demander le nom complet et le téléphone.
- Le prospect `KOMENAN OSIMEON KOUAME` (`+17203854284`) est actuellement enregistré à 2 ha, formule `PALMINVEST_AUTONOME`, résidence USA, sans paiement ni lead lié. Un lead distinct `Beau Siméon ZOUKPANGBEU` (`+2250506526722`) existe également, sans superficie ni formule. Aucun des deux dossiers ne correspond sans ambiguïté à la demande « Kwame Siméon, 10 ha, formule suggestion, 303 000 FCFA déjà payés ». Ne pas convertir, fusionner ni enregistrer le paiement avant confirmation de l'identité et de la formule.
- La parcelle client de BI BERTIN BI à Gonaté (1 ha) reste `a_valider` : elle n'a ni acquisition, ni intervention, ni plantation reliée. Aucune date de mise en terre n'est disponible ; ne pas la déclarer saturée ou plantée sans confirmation technique.
- DJAHA KOUAME reste un prospect chaud de 2 ha : `dispose_terrain=false`, aucun paiement enregistré et aucun client lié. Ne pas le convertir automatiquement sans confirmation de souscription/paiement.


## Ajustement d’interface — 19 novembre 2026
- Page **Acquisitions** : suppression du paragraphe explicatif sur les préfixes AC_C et AC_B. Les identifiants et leur logique de génération ne sont pas modifiés par cet ajustement.
- Fichier : `src/pages/Clients.tsx`. Commit applicatif : `77400294ea861871c695b7e52ad41a046203b167`.
- Contrôle de production à effectuer après le déploiement automatique Vercel.


## Reprise des acquisitions, des superficies et des accès — 19 novembre 2026

### Acquisitions et suivi financier
- `AC_C000008` — **PAULIN LOUKOU** : superficie contractuelle fixée à **10 ha**. Le dossier conserve **1 ha attribué/planté** et **9 ha restant à affecter**. Le PI contractuel est de **907 000 FCFA** : **90 700 FCFA encaissés**, **816 300 FCFA restant dus**. Mensualité contractuelle : **566 000 FCFA**.
- `AC_C000012` — **KOMENAN SIMEON KOUAME** : acquisition validée et activée pour **10 ha**. PI contractuel : **907 000 FCFA** ; paiement enregistré : **303 000 FCFA** ; solde PI : **604 000 FCFA**. Aucun hectare n'est encore affecté ; les **10 ha** restent à attribuer et l'intervention technique reste à planifier.
- Contrôle après reprise : **10 acquisitions sur 10** sont au statut `valide` et `active`.
- Le prospect distinct `KOMENAN OSIMEON KOUAME` (2 ha, résidence USA) et le lead `Beau Siméon ZOUKPANGBEU` restent séparés et inchangés : ils ne sont pas fusionnés avec le dossier AC_C000012.

### Superficies et foncier
- La base distingue désormais `total_hectares` (surface contractuelle) et `surface_plantee_ha` (surface effectivement plantée).
- La fonction `update_client_stats()` met à jour les plantations et `surface_plantee_ha` sans écraser la superficie contractuelle lors d'une mise à jour GPS.
- La synchronisation client/acquisition conserve la surface du lot réellement attribué et enregistre séparément la surface contractuelle, la surface foncière attribuée et le reliquat à affecter.
- `finance_associates` : ajout des champs de surface bénéficiaire et GPS. **Jacques Kouakou KOUAME** reste un associé bénéficiaire de **6,5 ha**, non facturable, sans création de client, d'acquisition ou d'échéancier.

### Coordonnées GPS enregistrées
- Paulin LOUKOU : `6.997856, -6.214123`.
- Boukary ZONGO : `6.997856, -6.214114`.
- Lambert : `6.942856, -6.236825`.
- Emmanuel (2 ha) : `6.993066, -6.437648`.
- ZAGBLE BOLOU JEAN-JACQUES : `6.994030, -6.440636`.
- Ferdinand : `6.966816, -6.216460`.
- Jacques KOUAME, associé bénéficiaire : `6.966916, -6.216489`.
- Patrice : aucune coordonnée n'ayant été fournie, sa localisation n'a pas été modifiée.
- Pour les parcelles partagées, les coordonnées du bénéficiaire et le point de référence de la parcelle restent enregistrés séparément.

### Interface et accès
- `src/pages/Clients.tsx` : déplacement de `clientSurface` au niveau du module pour corriger l'erreur `Cannot access 'W' before initialization`.
- La vue Acquisitions affiche le détail « hectares contractuels / hectares attribués / hectares restant à attribuer ».
- La vue Acquisitions inclut les associés bénéficiaires disposant d'une superficie non facturable, avec un accès vers Finance.
- Le compte de **BOTI BI TRA JULES** est actif, son adresse e-mail est confirmée et son rôle principal `chef_equipe_commercial` est attribué. Aucun historique de connexion réussie n'est encore enregistré ; un test de connexion réel reste à effectuer.

### Migrations appliquées sur Supabase CRM
- `20261119234333_reconcile_acquisition_contract_sync_20261119`
- `20261119234349_update_paulin_contract_to_10ha_20261119`
- `20261119234359_validate_simeon_deferred_land_acquisition_20261119`
- `20261119234436_update_land_gps_and_associate_beneficiary_area_20261119_v2`
- `20261119235120_separate_contract_and_planted_surfaces_20261119`

### Points antérieurs restant à confirmer
- Aucun client, lead ou prospect nommé « Diop » n'a été retrouvé dans les tables CRM vérifiées. Demander le nom complet et le téléphone avant création.
- La parcelle de BI BERTIN BI à Gonaté (1 ha) reste à valider techniquement ; aucune plantation ne doit être déclarée sans constat.
- DJAHA KOUAME reste un prospect chaud de 2 ha, sans paiement ni client lié ; ne pas le convertir sans confirmation.


## Finalisation du 20 novembre 2026 — suivi progressif et étapes techniques

### Corrections applicatives préparées sur `feat/progressive-planting-multi-parcel-20261120`
- Tableau de bord : suppression du champ de recherche en double dans « Clients récents » et « Paiements récents » ; un seul filtre reste affiché par tableau.
- Tri des associés bénéficiaires dans Acquisition : ordre chronologique de création, avec les propriétaires affichés à côté du dossier client correspondant.
- Interventions techniques : les étapes de préparation foncière « Défrichage » et « Nettoyage » ne sont proposées que pour PalmInvest et TerraPalm ; elles sont masquées pour PalmTerroir. L'édition d'une intervention existante est ramenée vers une étape autorisée pour la formule du client.
- Les interventions antérieures à la mise en terre sont matérialisées sans prétendre connaître leur date exacte : la note d'audit indique explicitement que la date affichée est la date de mise en terre connue, et non une date historique vérifiée.
- Commit de branche : `cf041b7b1054e6a8c54a65bbf802a670a2255b3d`. À fusionner et déployer après contrôle du build et de l'aperçu Vercel.

### Contrôle des commissions Jean-Marie — 20/11/2026
- Les commissions de Paulin et de Boukary Zongo sont enregistrées payées : 5 000 FCFA chacune, soit 10 000 FCFA réglés.
- Les commissions de Yao Lambert et de Patrice sont validées à 5 000 FCFA chacune, soit 10 000 FCFA à régler.
- Pour ces quatre dossiers : 20 000 FCFA de commissions générées, dont 10 000 FCFA payées et 10 000 FCFA validées non encore payées. Les deux lignes Paulin/Zongo sont distinctes et correspondent aux deux plantations de la parcelle partagée.
- Le registre global de Jean-Marie contient 30 000 FCFA payés, 25 000 FCFA validés non payés et 25 000 FCFA annulés. Les lignes annulées sont exclues du montant dû/payé.
- Les commissions sont reliées au profil de Jean-Marie. L'affectation de l'agent dans la fiche intervention doit rester soumise à la fonction sécurisée `reassign_intervention`, qui exige une session d'un rôle autorisé ; ne pas la contourner via SQL.

### Tarification 10 ha
- Vérification en base : Paulin et Siméon ont chacun un PI contractuel de 907 000 FCFA, une mensualité unitaire de 50 900 FCFA/ha (réduction d'environ 10,07 % par rapport à 56 600 FCFA), une mensualité totale de 509 000 FCFA et un total contractuel de 22 285 000 FCFA.
- Paulin : 10 ha contractuels, 1 ha planté, 9 ha à attribuer/planter progressivement.
- Siméon : 10 ha contractuels, 0 ha planté, 10 ha à attribuer/planter progressivement.
- Les données client/acquisition sont cohérentes sur ces valeurs ; aucun nouveau recalcul n'est nécessaire.

### État de production au contrôle du 20/11/2026
- Dernier déploiement CRM de production contrôlé : commit `9bfb691e16c33fd407a0041103ea20e6d65faa96`, état `READY`.
- Aucun groupe d'erreurs runtime remonté sur les dernières 24 h. La lecture des logs détaillés sur une heure n'est pas disponible sur le plan Vercel courant ; une lecture sur 30 minutes n'a retourné aucun log d'erreur.
- Les modifications de la branche ci-dessus ne sont pas encore en production à cette date.

## État vérifié et reprise — 20 novembre 2026

Cette section prévaut sur les anciennes notes de reprise lorsque les données ont évolué depuis leur rédaction.

### Travaux appliqués et vérifiés en base
- Paulin LOUKOU (AC_C000008) : contrat 10 ha ; 1 ha effectivement planté sur la parcelle de Boukary Zongo ; 9 ha restent à affecter puis à planter. La parcelle de Boukary reste à 6 ha. Le parcours progressif multi-parcelles est porté par les migrations 20261120030324 à 20261120031939, déjà appliquées.
- Paulin et Siméon (AC_C000012) : contrats 10 ha, PI contractuel 907 000 FCFA chacun. Paiements PI confirmés : Paulin 90 700 FCFA ; Siméon 303 000 FCFA. Pour 10 ha, mensualité unitaire 50 900 FCFA/ha, soit 509 000 FCFA par mois pour 10 ha ; total contractuel recalculé 22 285 000 FCFA. La remise correspond à 10,07 % sur la mensualité de référence de 56 600 FCFA/ha ; le PI reste inchangé. Migration 20261120041814_add_surface_based_monthly_discount_10ha appliquée.
- Géographie des plantations : 13/13 plantations sont rattachées à la région Haut-Sassandra ; aucune région absente.
- Identité client : AC_C000001 est correctement enregistrée comme nom VANIE, prénoms BI BERTIN, nom complet VANIE BI BERTIN.
- Étapes techniques antérieures : les étapes préalables à la mise en terre ont été inscrites comme réalisées pour les plantations déjà mises en terre. Le défrichage et le nettoyage restent limités aux familles PalmInvest et TerraPalm ; PalmTerroir conserve validation parcelle, piquetage et trouaison sans ces deux étapes.
- Jean-Marie : les interventions de mise en terre de Paulin, Lambert et Patrice sont attribuées à YAO KONAN JEAN-MARIE. Les commissions Paulin et Boukary sont reliées à son profil et payées ; celles de Lambert et Patrice sont enregistrées et validées, en attente de règlement.
- Commissions Jean-Marie : portefeuille réconcilié à 55 000 FCFA brut, 36 000 FCFA réglés (dont l'acompte antérieur de 6 000 FCFA) et 19 000 FCFA restant dus. Les 5 lignes annulées, 25 000 FCFA, sont des doublons/bruits administratifs et non des paiements réels annulés.
- Portail : le parcours de progression masque défrichage/nettoyage pour PalmTerroir ; PalmInvest et TerraPalm les conservent.

### Éléments vérifiés mais non supprimés
- Aucun dossier Diop ni KOMENAN OSIMEON KOUAME n'a été retrouvé parmi les leads/prospects/clients vérifiés.
- VANIE BI BERTIN est un client existant correctement nommé ; il ne doit pas être supprimé.
- DJAHA KOUAME n'est pas un brouillon : la base contient un client actif, une acquisition PalmInvest active et validée de 2 ha et un paiement PI validé de 181 400 FCFA. Aucune suppression destructive n'a été faite sur ce dossier.

### Déploiement et dépendances
- Les migrations métier de cette reprise sont appliquées sur Supabase CRM.
- PR #58 contient les ajustements d'interface pour les plantations progressives, les recherches redondantes, la géographie client, l'ordre des dossiers, les formulaires contractuels et les étapes techniques.
- PR #58 reste ouverte. Le dernier commit cf041b7b1054e6a8c54a65bbf802a670a2255b3d n'a pas obtenu de build Vercel : le service a renvoyé une limitation de déploiement pendant 24 h. Les previews antérieures 76c5df9 et e221942 étaient READY, mais ne correspondent pas au dernier commit.
- Ne pas fusionner/déployer PR #58 avant un build réussi du dernier commit. Reprendre le contrôle dès la levée de la limitation.
- Point contractuel toujours ouvert : le modèle d'acquisition et son avenant affichent respectivement 42 et 40 mois. Ne pas changer la durée ou le tarif sans décision formelle.


## Contrôle final après fusion et déploiement — 20 novembre 2026, 07:32 UTC

Cette entrée remplace les anciens statuts de PR et de déploiement qui précèdent.

### Livraison CRM
- PR #58 fusionnée dans `main` ; commit de fusion : `854337f5cb067c70e38996d6f96122ad3273b42d`.
- Déploiement Vercel production : `dpl_9ZAzm2dJ69Q3Eqj3itDcwjHGYnrU`, **READY**, alias `https://app.agricapital.ci`.
- Contrôle HTTP de `/clients` : **200 OK**. Aucun runtime error sur les dernières 24 h ; aucun log error/fatal sur les 30 dernières minutes.
- Aperçu correspondant au dernier commit avant fusion : **READY**, build Vercel réussi.
- Les migrations 20261120030324 à 20261120042606 sont enregistrées dans le registre Supabase ; les règles de plantation progressive, formulaires, offres, convention, remise 10 ha et étapes techniques sont appliquées.

### Données et commissions — corrections de référence
- Les 13 plantations sur 13 ont bien `region_id = Haut-Sassandra`. La répartition géographique du tableau de bord reste calculée à partir des plantations. Aucun « Non renseignée » n'est justifié par les données actuelles des plantations.
- Paulin : 10 ha contractuels, 1 ha planté, 9 ha restant à attribuer/planter ; parcelle Boukary Zongo conservée à 6 ha.
- Siméon : 10 ha contractuels, 0 ha planté, 10 ha restant à attribuer/planter.
- Pour chacun : PI contractuel 907 000 FCFA ; mensualité 50 900 FCFA/ha, soit 509 000 FCFA pour 10 ha ; total contrat 22 285 000 FCFA.
- Commissions des quatre dossiers demandés (Paulin, Boukary Zongo, Lambert, Patrice) : 20 000 FCFA au total, dont 10 000 FCFA payés (Paulin et Boukary, 5 000 FCFA chacun) et 10 000 FCFA validés en attente de paiement (Lambert et Patrice, 5 000 FCFA chacun). Boukary est le bénéficiaire propriétaire de la parcelle partagée ; sa ligne de commission est distincte, mais elle se rattache à la même opération de plantation que Paulin.
- État des lignes de commission du profil Jean-Marie dans `commissions` au contrôle : 30 000 FCFA `payee`, 25 000 FCFA `validee`, 25 000 FCFA `annule`. Les lignes annulées ne sont ni des paiements effectués ni un solde à payer. Cette extraction ne doit pas être confondue avec les anciens totaux de portefeuille figurant plus haut dans l'historique de cette feuille.

### Dossiers mentionnés comme inexistants ou brouillons
- Aucun dossier Diop ni KOMENAN OSIMEON KOUAME n'a été retrouvé dans les tables prospects/leads interrogées.
- VANIE BI BERTIN (`AC_C000001`) est une fiche client réelle, validée et active, correctement nommée ; ce n'est pas un brouillon et elle n'a pas été supprimée.
- DJAHA KOUAME (`AC_C000011`) n'est pas un brouillon : prospect `P000014` converti, client actif et validé, acquisition PalmInvest active/validée de 2 ha et paiement PI de 181 400 FCFA validé. Aucune suppression n'a été faite sur cette fiche financière existante.
- Aucun brouillon correspondant à ces noms n'a été identifié dans les résultats vérifiés. Ne pas supprimer les fiches actives ni les écritures financières sans instruction explicite de suppression de ces dossiers actifs.

### Portail client
- Déploiement de production : `dpl_2uJA9MnV5kUo5kNxZZ3ES1vyPNas`, **READY**, commit `9b20288a239d08d05cd7063ae3e2fc3e1a73ff53`, alias `https://client.agricapital.ci`.
- La démo `/demo` charge un compte local PalmInvest ; le paiement est simulé localement sans débit réel. Paramètres actuels : PI 90 700 FCFA, mensualité 56 600 FCFA/ha, total cohérent 2 467 900 FCFA pour 1 ha, aucun arriéré et prochaine échéance à J+10.
- Favicon, icône PWA, Open Graph et Twitter utilisent le fichier de logo officiel `/logo-agricapital.png` via les références du portail.
- Défrichage et Nettoyage sont masqués dans la progression PalmTerroir ; ils restent disponibles pour PalmInvest et TerraPalm.
- Restent à traiter dans la feuille de route portail : intégrer les sept photos démo fournies (six fichiers actuellement présents), finaliser le contrôle visuel de l'accueil/historique/conseiller, et vérifier l'exhaustivité du référentiel pays.

### Point contractuel encore ouvert
- Les documents d'acquisition consultés affichent deux durées différentes : 42 mois dans le contrat et 40 mois dans l'avenant. Aucune durée n'a été changée sans arbitrage écrit de la direction.


## Reprise demandée par la direction — 20 novembre 2026

### Tarification et dossier Paulin
- Consigne actualisée du PDG : aucune remise automatique « 10 ha et plus » ne doit être activée ni affichée comme une promotion permanente. La mensualité de base issue de la formule PalmInvest reste 56 600 FCFA par hectare et par mois ; le total mensuel du dossier est calculé sur la superficie contractuelle (566 000 FCFA/mois pour 10 ha). Le prix global suit également la superficie.
- La remise test « Remise volume — 10 ha et plus » a été désactivée. Les contrats concernés ont été restaurés depuis leur configuration de formule enregistrée : Paulin LOUKOU (AC_C000008) et KOUAME KOMENAN SIMEON (AC_C000012) sont chacun à 10 ha, 24 679 000 FCFA de total contractuel et 566 000 FCFA par mois. Le PI contractuel de 907 000 FCFA et les paiements réellement encaissés restent inchangés.
- Migration appliquée sur Supabase CRM : `20261120050000_remove_test_volume_discount_and_restore_base_contracts`.
- Vérification SQL après migration : la promotion est inactive ; aucun client ni acquisition ne conserve son `promotion_id` ; les deux clients et leurs acquisitions affichent 24 679 000 FCFA et 566 000 FCFA/mois.
- La superficie contractuelle de Paulin reste 10 ha. Le 1 ha planté/attribué et les 9 ha restant à affecter demeurent des données foncières distinctes ; aucune donnée de parcelle n'a été modifiée.

### Cohérence mobile / ordinateur
- Une branche de correction est ouverte : `fix/crm-coherence-paul-inventaire-finance-20261120`.
- Le cache du service worker est incrémenté de v33 à v34 afin de forcer le renouvellement du bundle PWA potentiellement conservé par les navigateurs de bureau. Le contrôle du déploiement et le test de cohérence multi-appareils restent à effectuer.
- La source actuelle `Clients.tsx` lit la superficie contractuelle depuis `metadata.surface_contractuelle_ha`, puis `total_hectares`, et trie les clients du plus récent au plus ancien. Le contrôle de la session/du périmètre RLS sur le poste où l'écart est constaté reste à effectuer si l'écart persiste après actualisation du PWA.

### Corrections appliquées sur la branche
- **Paulin** : la base confirme 10 ha contractuels et 1 ha planté. La surface contractuelle reste 10 ha ; les données de plantation restent distinctes. La valeur affichée par le CRM doit se baser sur la superficie contractuelle.
- **Tarifs** : les deux dossiers restaurés utilisent 24 679 000 FCFA au total et 566 000 FCFA/mois pour 10 ha. La remise test est inactive et aucun libellé de promotion n'est affiché dans le parcours.
- **Parcours client** : migration appliquée pour désactiver l'étape Documents, rendre le contrat signé obligatoire à l'étape Client et ramener les offres actives à 4 étapes. Le parcours conditionnel à 5 étapes est prévu uniquement si une offre Palme du Roi existe ; aucune offre Palme du Roi n'est actuellement configurée dans les offres actives.
- **Représentant** : le dépôt de procuration est proposé et contrôlé uniquement lorsque la qualité choisie est « Mandataire ».
- **Documents de référence** : les liens vers les modèles déposés dans le CRM ont été retirés du formulaire client. Les champs fonciers détaillés ne sont plus présentés pour les offres ordinaires ; le parcours Palme du Roi conserve uniquement la localisation, le lieu-dit, la référence et les coordonnées GPS.
- **Finance** : catégories réorganisées par familles agricoles, recherche et défilement mobile/ordinateur renforcés ; choix « Avec frais / Sans frais » harmonisé dans les formulaires de mouvements ; référence par défaut et bascule exclusive vers le fichier justificatif dans le formulaire de paiement client.
- **Géographie** : les formulaires de compte et les cascades partagées filtrent les régions, districts, départements, sous-préfectures et villages actifs. Les entrées anciennes du cache qui ne portent pas un statut actif explicite sont ignorées. Le composant de prestation indépendante reste séparé et conserve sa géographie directe.
- **Téléphones et profils** : les indicatifs internationaux sont réinterprétés depuis les numéros E.164 lors de la conversion prospect/client ; le sélecteur de pays se resynchronise après chargement asynchrone. Les deux indicateurs WhatsApp sont indépendants dans les formulaires client, prospect, profil et acquisition. Les vues profil et administration utilisent le bon espace de stockage pour les photos issues des demandes de compte.
- **Tableaux et PWA** : tri des identifiants CRM inversé pour afficher le plus récent en haut ; listes d'attributions et de parcelles harmonisées. Cache du service worker passé en v34 pour forcer le renouvellement des versions de bureau.
- **Mensualités** : les formulaires d'acquisition et d'édition affichent le montant mensuel total calculé sur la superficie, sans libellé « par hectare ».

### Validation et points restant à terminer
- Migration SQL appliquée et contrôlée sur Supabase : `remove_test_volume_discount_and_restore_base_contracts` et `align_acquisition_steps_and_contract_upload`.
- Déploiement Vercel Preview de la branche : état READY. La validation TypeScript, les tests et le lint via le workflow GitHub restent à confirmer.
- Le contrôle de toutes les pages de tableaux et l'audit champ par champ de l'ensemble des formulaires restent à finaliser avant la mise en production.
- Aucun champ métier ni aucune colonne de base n'est supprimé sans audit de dépendances et de données.


## Revue complémentaire des formulaires — 21 novembre 2026

- Formulaire d'acquisition / étape Client : correction de l'actualisation des pièces et contrats conditionnels. Le filtrage des documents dépend désormais aussi du type de représentant, de la présence du représentant et des exigences foncières/contractuelles de l'offre. Un changement de ces champs met immédiatement à jour les pièces affichées.
- Formulaire d'acquisition / étape Client : lorsque l'offre n'est pas encore sélectionnée, la liste des pièces et contrats est réinitialisée et l'état de chargement se termine ; le formulaire ne reste plus bloqué sur « Chargement des pièces requises… ».
- Formulaire de modification de fiche client : le contrat déjà rattaché reste consultable/remplaçable ; les montants contractuels, paiement initial et mensualité totale sont recalculés à partir de la surface et du snapshot du contrat. Le contrat signé obligatoire reste contrôlé dans le parcours de création d'acquisition, conformément à la dernière consigne conservée.
- Formulaire de convention foncière : les champs et annexes conditionnelles sont présents. Les annexes « à fournir » restent traçables dans le dossier soumis à validation ; ne pas bloquer l'enregistrement initial ni transformer leur absence en pièce jointe fictive. La date de signature reste facultative tant qu'elle n'est pas confirmée.
- Historique des conversations antérieures : la recherche des sessions Notion n'est pas autorisée par le niveau d'accès actuel. Cette revue s'appuie sur les décisions conservées dans le dépôt et sur le code de la branche ; les demandes non conservées ne sont pas reconstituées par supposition.


## Correction des numéros de téléphone — 21 novembre 2026

- Cause identifiée dans le composant partagé `src/components/common/CountryPhoneInput.tsx` : à chaque frappe, le numéro local était reparsé puis remplacé par `nationalNumber`. Le parseur pouvait interpréter le zéro initial comme un préfixe national et le supprimer du champ contrôlé.
- Correction : conserver les chiffres locaux exactement comme saisis, y compris le zéro initial. Le préfixe pays n'est retiré que lorsqu'un numéro international complet est explicitement collé.
- Le composant partagé alimente les formulaires client, propriétaire foncier, utilisateur, profil, leads et la fiche financière de paiement. La correction s'applique donc à ces écrans sans duplication de patch.
- Dans le portail client, le composant `src/components/common/CountryPhoneInput.tsx` conservait déjà les chiffres saisis sans reparsage ; cette règle est explicitement documentée pour éviter une régression. Les champs d'identifiants et de pièces sont des champs texte, et les champs de montants/surfaces restent numériques.


## Localisations GPS individualisées et choix des frais — 23 novembre 2026

- Mise à jour des coordonnées GPS propres aux plantations : ZAGBLE BOLOU (PLT-000002) : 6.994030, -6.440640 ; YAO KONAN EMMANUEL pour sa plantation de 2 ha (PLT-000001) : 6.994392, -6.440456 ; Jacques KOUAKOU KOUAME (PLT-000014, 6,5 ha) : 6.994115, -6.440071.
- Les coordonnées des fiches clients correspondantes ont été alignées pour ZAGBLE BOLOU et Emmanuel. La parcelle propre à Jacques a également été mise à jour. La parcelle commune de ZAGBLE BOLOU et Emmanuel n'a pas été écrasée par une coordonnée individuelle.
- Carte des plantations : suppression du décalage artificiel de 100 m ; chaque repère reprend désormais strictement le GPS enregistré sur sa plantation.
- Finance et Comptabilité : remplacement du sélecteur à boutons « Avec frais / Sans frais » par deux petites cases à cocher mutuellement exclusives. Le composant commun couvre les formulaires de saisie de dépense, paiement d'une dépense, paiement de paie et mouvement d'associé ; les calculs métier restent inchangés.


## Justificatifs multiples en Finance et Comptabilité — 23 novembre 2026

- Les champs de justificatifs des formulaires d'entrées, sorties, dépenses à payer, règlements de dépenses, paiements de paie et mouvements d'associés acceptent désormais la sélection multiple, jusqu'à 25 fichiers par opération.
- Les fichiers sont téléversés individuellement dans le stockage privé et leurs chemins/noms sont conservés ensemble dans les champs justificatifs existants au format JSON, sans migration de schéma ; les anciens justificatifs unitaires restent compatibles.
- La sélection ne rajoute aucun texte d'aide ni compteur explicatif dans les formulaires.
- L'ouverture des justificatifs prend en charge les anciens fichiers unitaires et les nouvelles listes de fichiers.


## Justificatifs multiples — 23 novembre 2026

- Finance et Comptabilité : les champs de justificatifs acceptent une sélection multiple jusqu'à 25 fichiers par opération. Les champs existants de la page Finance couvrent les entrées, sorties, dépenses à payer, règlements, mouvements d'associés et paiements de paie.
- Formulaire de paiement client : remplacement du téléversement mono-fichier par une sélection multiple ; les chemins des reçus sont enregistrés ensemble dans les champs de preuve existants, sans ajouter de texte d'aide ni de message explicatif dans l'interface.
- La limite de 25 est appliquée au nombre total de fichiers associés à l'opération. Les justificatifs sont téléversés dans le stockage privé existant.

## Actions financières dans la fiche client — 23 novembre 2026

- La fiche client et le module Paiements proposent les actions de conversion de monnaie client en jours, en complément de la saisie de paiement, du remboursement et du transfert.
- Les boutons d'action sont réservés au PDG et à la Relation Client (service client et chef d'équipe Relation Client). Les profils disposant uniquement d'un droit de consultation conservent l'accès aux informations sans les commandes d'exécution.
- Les profils autorisés à consulter une fiche client voient également l'historique des paiements et le solde de monnaie en lecture seule, dans le périmètre des clients auxquels ils ont accès. Le module global Paiements conserve son contrôle d'accès dédié.
- Le formulaire de paiement ouvert depuis une fiche client conserve le client pré-sélectionné même lorsque le type de paiement change.
- Le calcul du rachat de monnaie utilise le tarif journalier total du client : tarif journalier par hectare multiplié par la superficie, ou tarif total personnalisé lorsqu'il existe. Le calcul est aligné sur le moteur de tarification journalier.
- Les permissions et politiques RLS de paiements, remboursements et transferts sont alignées avec ces rôles.

## Rapprochement des sorties validées — 23 novembre 2026

- Le KPI « Sorties validées » est calculé à partir des transactions de sortie dont le statut est valide dans le grand livre finance_transactions. Il inclut les frais réellement décaissés, les commissions et les paiements de dépenses ; il ne correspond donc pas uniquement au total des fiches de dépenses.
- Les commissions déjà payées et présentes dans le grand livre sont maintenant également rapprochées des fiches de dépenses associées.
- Une dépense de carburant de 2 000 F CFA demeure à vérifier : sa fiche est marquée payée alors que sa transaction liée est annulée et qu'aucun règlement associé n'existe dans le registre des paiements de dépenses. Elle n'a pas été modifiée automatiquement faute de preuve sur le paiement réel.

## Règle d'affichage des noms — 23 novembre 2026

- Dans les profils, fiches, messages, SMS, WhatsApp, notifications et autres affichages hors tableaux : dernier prénom en casse de titre, suivi du NOM entièrement en majuscules.
- Dans tous les tableaux : tous les prénoms et le nom complet, l'ensemble en majuscules.
- Les champs structurés nom/prénoms sont prioritaires ; les noms complets historiques sont conservés en repli pour ne pas perdre les personnes dont les champs structurés sont incomplets.

## Paiements, formulaires et affichage — 23 novembre 2026

- Dans la fiche financière client, la saisie du numéro Mobile Money conserve le zéro national après l'indicatif ivoirien.
- Avant l'ouverture de KKiaPay, l'adresse email du client est transmise lorsqu'elle existe ; sinon une adresse technique déterministe est fournie au widget, sans demander au client de la saisir.
- Les formulaires de dialogue et de confirmation sont centrés dans la zone de travail située à droite du menu latéral, et non au centre de toute la fenêtre.
- Le formulaire client regroupe le recto et le verso de la pièce, la photo du client et le contrat signé dans une seule section en grille 2 colonnes.
- Jacques KOUAKOU KOUAME (enregistrement fourni) est masqué uniquement dans la liste des conventions foncières ; sa fiche et ses parcelles ne sont pas supprimées ni modifiées.
- Les règlements partiels affichent séparément le montant remis au bénéficiaire et les frais de transaction, tout en conservant le montant total réellement sorti dans le grand livre.

## Rapprochement du paiement partiel de 30 000 F CFA

- Dépense : prime de stage d'octobre de KONAN AMENAN LARISSA.
- Montant de la dépense réglé : 30 000 F CFA.
- Frais de transaction : 300 F CFA.
- Sortie réellement inscrite au grand livre : 30 300 F CFA.
- La dépense reste partielle, sur un total de 50 000 F CFA ; le reliquat est de 20 000 F CFA.
- La transaction et le règlement sont déjà validés en base. L'affichage distingue désormais les 30 000 F CFA versés et les 300 F CFA de frais, sans créer de seconde sortie.

## Affectation des interventions techniques — 23 novembre 2026

- Vérification de l'historique : les 57 interventions techniques et l'unique rapport de visite technique existants sont déjà affectés à YAO KONAN JEAN-MARIE (profil technicien identifié).
- Aucun enregistrement n'a nécessité de modification.

## Mise à jour du rapprochement des sorties — 23 novembre 2026

- Le grand livre compte désormais 92 sorties validées, pour un total de 730 190 F CFA.
- Les frais de transaction inclus dans ces sorties totalisent 330 F CFA.
- L'écart de 3 000 F CFA par rapport au précédent contrôle (727 190 F CFA) correspond à une nouvelle sortie COMMUNICATION de 3 000 F CFA enregistrée et validée le 23 novembre à 13 h 58 UTC.
- Le règlement partiel de 30 000 F CFA et ses 300 F CFA de frais sont compris dans le total de 730 190 F CFA ; ils ne sont pas comptés deux fois.


## Partage foncier GOLY, carte et pilotage financier — 24 novembre 2026

### GOLY KOUADIO BASILE
- Propriétaire : `AC-P000006`, enregistrement `9f72e141-9b61-4b3b-abf5-8f9b1bc84ceb`.
- Superficie déclarée : 5 ha. Répartition vérifiée en base : 50 % AgriCapital (2,5 ha) et 50 % propriétaire (2,5 ha).
- Le dossier reste provisoire et en attente de validation. Aucune parcelle n'est encore créée ; les coordonnées GPS, limites, pièces foncières et nombre de lots restent à confirmer. Ne pas créer de parcelle ni de lots et ne pas inventer de localisation.
- Dans `src/pages/ProprietairesTerres.tsx`, une convention de mise en valeur agricole applique désormais la règle 50/50 sans possibilité de modifier le pourcentage. Le type historique « achat » conserve 100 % AgriCapital. Les contrôles, calculs et récapitulatifs utilisent la même règle.
- La superficie totale accepte les pas de 0,5 ha, conformément à la contrainte Supabase active ; le contrôle de répartition vérifie ensuite que chaque quote-part respecte elle aussi les pas de 0,5 ha.

### Carte interactive
- Les sites distants de 75 m ou moins sont regroupés visuellement pour éviter le chevauchement des icônes. Le détail du repère groupé affiche chaque plantation, sa superficie/localité et ses coordonnées GPS exactes.
- Le repère groupé reste ancré sur un GPS enregistré ; aucun décalage artificiel n'est appliqué.
- La lecture GPS d'une plantation utilise aussi les coordonnées de sa fiche client en repli lorsque les champs GPS de la plantation sont vides.

### Pilotage financier
- Les indicateurs du tableau de bord sont affichés sur trois colonnes sur mobile, quatre sur largeur intermédiaire et sept sur grand écran.

### Contrôles et déploiement
- Aucune migration Supabase n'est requise pour GOLY : les valeurs 5 ha / 50-50 / 2,5 ha + 2,5 ha sont déjà conformes et n'ont pas été modifiées.
- Les coordonnées GPS relues en base sont : Jacques KOUAKOU KOUAME `6.994115, -6.440071` ; YAO KONAN EMMANUEL (2 ha) `6.994392, -6.440456` ; ZAGBLE BOLOU JEAN-JACQUES `6.994030, -6.440640`. Le regroupement cartographique permet de les distinguer dans le détail sans modifier leurs coordonnées.
- Commit applicatif : `3c51d44f513caae874d51ab40223c175fa07df06`.
- Déploiement Vercel de production : `dpl_HLXL4MX4EFwpxKtERy5AZs2i7j13`, état `READY`, alias `https://app.agricapital.ci` ; déploiement rattaché au commit applicatif ci-dessus.
- Build Vite terminé sans erreur (3 975 modules transformés). Les avertissements relevés concernent la taille d'un bundle et 9 vulnérabilités modérées déjà signalées par npm audit ; ils n'ont pas bloqué le déploiement.
- Contrôle des erreurs d'exécution après déploiement : aucune erreur runtime relevée sur la fenêtre contrôlée.


## Harmonisation des recherches et assainissement du build — 24 novembre 2026

- Règle d'interface : un seul champ de recherche multi-critères visible par page, y compris dans les onglets de Paramètres. Lorsque la page possède déjà une recherche métier, la recherche automatique du composant Table est désactivée pour éviter le doublon.
- Portefeuilles : une seule recherche commune couvre les portefeuilles, les versements et les commissions du détail ; les champs répétés dans les cartes et la fenêtre de détail sont supprimés.
- Build : migration de la configuration Vite vers les API ESM, retrait du minifier esbuild déprécié, mise à niveau de `@vitejs/plugin-react-swc` vers 4.3.3, autorisations npm limitées aux scripts nécessaires (`@swc/core`, `esbuild`) et refus explicite du script postinstall informatif de `core-js`.
- Build : chargement différé des pages et des onglets de Paramètres pour réduire le bundle initial ; suppression des imports dynamiques inefficaces identifiés dans les journaux Vercel.
- Installation Vercel : passage à `npm ci` et retrait de la variable obsolète `npm_config_cache_dir` avant l'installation.
- État : corrections en cours sur la branche `fix/unified-search-build-cleanup`. Les contrôles TypeScript, tests, lint, audit npm, build et déploiement de production restent à exécuter avant clôture.


## Audit de sécurité complémentaire et correctifs — 24 novembre 2026

### Correctifs appliqués directement sur Supabase CRM
- Migration appliquée : `20261124071737_restore_internal_user_view_rls_and_scope_finance_helper_exec`.
- Vue `public.v_internal_users` : restauration de `security_invoker = true`. Les politiques RLS de `profiles` s'appliquent de nouveau aux requêtes sur l'annuaire interne ; la lecture reste autorisée aux utilisateurs authentifiés selon les permissions existantes, et refusée à `anon`.
- Fonctions `public.finance_can_manage_payroll()` et `public.finance_can_manage_salary_profiles()` : retrait de l'exécution héritée de `PUBLIC` et de `anon`, maintien de l'exécution pour `authenticated`.
- Vérification SQL après migration : `security_invoker=true` ; `authenticated` peut lire la vue ; `anon` ne peut pas lire la vue ; `anon` ne peut exécuter aucune des deux fonctions ; `authenticated` conserve leur exécution.
- Conseiller Supabase après correction : l'alerte `security_definer_view` a disparu ; les deux fonctions financières ne figurent plus dans les fonctions SECURITY DEFINER accessibles à `anon`. Il reste une fonction anonyme `workspace_redeem_external_meeting_invite(text)`, conservée volontairement pour le parcours d'invitation externe par jeton ; elle doit rester soumise à une revue dédiée du flux d'invitation.

### Alertes restant à auditer — ne pas appliquer de révocation globale
- 121 fonctions SECURITY DEFINER restent exécutables par `authenticated`. Leur accès est nécessaire pour plusieurs RPC métier ; chaque fonction doit être relue individuellement (contrôle d'identité, permissions, périmètre de ligne, validation des paramètres) avant de modifier ses droits.
- Six tables ont RLS activé sans policy : paramètres d'intégration AcreMap, OTP/sessions du portail de prestations et tables internes de notifications. Elles semblent volontairement fermées au rôle client ; vérifier les chemins d'accès service-role/Edge Functions avant toute ouverture.
- La protection des mots de passe compromis Supabase Auth est désactivée ; son activation relève de la configuration Auth du projet, non d'une migration SQL.
- Performance : quatre clés étrangères sans index couvrant ; 283 index signalés comme inutilisés (ne pas les supprimer sur ce seul signal) ; de nombreuses policies permissives multiples, notamment avec la policy globale PDG. Toute consolidation doit préserver les périmètres RBAC et être testée par rôle.
- Aucune donnée métier client n'a été modifiée par cette migration.

### Déploiement et vérifications
- Les contrôles runtime Vercel sur les sept derniers jours n'ont retourné aucune erreur groupée. Les logs détaillés sur 24 h ne sont pas disponibles avec la rétention du plan actuel.
- Le dernier déploiement Vercel de production confirmé est rattaché au commit `fd49f592ebd9b112f1852716e451a6b2cccf75ba`. Les corrections fusionnées ensuite dans `main` (commit `a3f68df8f416e9bb9b0d7e42cb6de4df6b3c4d94`) ne sont pas encore publiées.
- La PR `#70` prépare une publication quotidienne groupée. Elle suspend les déploiements Git automatiques sur toutes les branches ; ne pas la fusionner avant la création du Deploy Hook Vercel sur `main` et l'enregistrement du secret GitHub `VERCEL_DEPLOY_HOOK_URL`. Les aperçus Vercel des PR seront également suspendus ; les contrôles GitHub Actions restent actifs.
- Le workflow groupé confirme l'acceptation du hook, mais le statut final `Ready` doit être contrôlé dans Vercel. En cas d'échec de build, relancer manuellement le workflow avec l'option `force`.


### Optimisation des clés étrangères — 24 novembre 2026
- Migration appliquée : `20261124071950_index_remaining_crm_foreign_keys`.
- Ajout d'index sur `equipes.district_id`, `plantations.localisation_reference_plantation_id`, `user_permission_overrides.granted_by` et `user_permission_overrides.permission_code`.
- Vérification SQL : les quatre index existent sur les colonnes attendues.
- Le conseiller Performance ne signale plus de clé étrangère sans index couvrant.
- Les avertissements restants portent sur 287 index signalés comme inutilisés et 430 cas de policies permissives multiples. Aucun index n'a été supprimé : les statistiques d'utilisation seules ne justifient pas une suppression sans analyse des requêtes, contraintes, périodes d'activité et plans d'exécution.


## Pilotage technique — indicateurs opérationnels — 27 novembre 2026

- Le bloc « Pilotage technique » du tableau de bord est enrichi avec des indicateurs calculés depuis les tables métier, dans le périmètre autorisé : surfaces réellement plantées / surfaces enregistrées, plants mis en terre / plants prévus, taux de réussite renseigné et couverture de sa saisie, interventions réalisées et en retard, rapports de visite et suivis dépassés, visites à effectuer, couverture GPS, tickets ouverts et prioritaires, et interventions de préparation à vérifier par rapport à la famille d’offre.
- Les interventions, rapports et tickets sont filtrés sur les plantations et clients du périmètre visible ; les abonnements Realtime actualisent le tableau de bord après modification.
- Vérification de la base au 27/11/2026, sur le périmètre externe utilisé par le tableau de bord : 12 plantations ; 13,5 ha de surface de référence et 13,5 ha déclarés plantés ; 1 932 plants prévus ; 1 631 déclarés mis en terre (84 %, soit 301 à planifier ou justifier) ; 57 interventions terminées sur 57 ; 5 plantations sans coordonnées GPS complètes ; 4 taux de réussite renseignés sur 12 (moyenne de 100 % sur les 4 seules fiches renseignées) ; 1 rapport avec prochaine intervention dépassée ; 0 visite échue sur les fiches plantations ; 0 ticket technique ouvert. La table complète contient 14 plantations, mais 12 seulement entrent dans le périmètre externe retenu par le tableau de bord.
- Lecture des indicateurs : la surface déclarée plantée atteint 100 % de la surface de référence, mais le volume de plants mis en terre atteint 84 % du prévisionnel. Ces deux ratios ne mesurent pas la même chose ; les 301 plants d’écart doivent être planifiés ou justifiés. Le taux de réussite moyen de 100 % n’est pas représentatif de tout le parc puisqu’il ne repose que sur 4 fiches sur 12. Les 5 fiches sans GPS, le suivi dépassé, les 8 fiches sans taux de réussite et les 3 interventions de défrichage sur PalmTerroir à vérifier constituent les priorités opérationnelles. Les données historiques ne sont pas supprimées automatiquement.
- Fichier applicatif : `src/pages/Dashboard.tsx`. Aucun changement de données métier ni migration Supabase CRM n'est requis pour cette évolution.
- État de livraison : commit et déploiement à renseigner après vérification du build et de la production.
