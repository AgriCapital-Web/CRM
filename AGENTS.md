- RLS policies, storage policies and SECURITY INVOKER functions must call role helpers from the `private` schema (private.is_staff, private.has_role, …); public.* role helpers are not executable by signed-in users, and one failing permissive policy blocks the whole query.
- SELECT policies must also match the row's own `created_by`/owner columns directly, because scope helpers that re-read the table cannot see a row being inserted (INSERT … RETURNING would fail).


# Règles UI obligatoires — AgriCapital CRM

Ces règles s'appliquent à toutes les pages existantes, aux refontes et à toute nouvelle page.

## Saisie et formulaires
- Ne jamais intégrer un formulaire de création ou de modification directement dans le flux d'une page métier.
- Ouvrir la saisie dans une fenêtre modale ou un panneau latéral dédié, avec un titre court, les champs, les actions Enregistrer/Annuler et les validations nécessaires.
- Les pages d'authentification, les parcours métier explicitement conçus comme assistants multi-étapes et les pages publiques dédiées constituent les seules exceptions justifiées.
- Ne pas ajouter de texte d'aide, de paragraphe explicatif ou de note technique dans l'interface. Garder uniquement les titres, libellés, valeurs, statuts, erreurs utiles et confirmations d'action.
- Ne jamais afficher de secrets, clés privées, jetons, détails de webhook ou instructions techniques internes dans l'interface.

## Tableaux de données
- Utiliser exclusivement le composant partagé `@/components/ui/table` pour les tableaux métier.
- Le composant partagé fournit par défaut la recherche insensible aux accents, l'export CSV et la pagination responsive. Ne désactiver ces fonctions que pour un tableau qui n'est pas une liste de données.
- Ajouter des filtres métier et un tri lorsque les colonnes et les volumes de données le justifient. Les filtres doivent agir sur les données, pas seulement sur l'affichage.
- Conserver des en-têtes clairs, des colonnes lisibles, des statuts sous forme de badges et des actions de ligne cohérentes.
- Prévoir les états chargement, vide, erreur et aucun résultat de recherche sans paragraphes explicatifs.
- Sur mobile, conserver l'accès aux colonnes et actions sans déformer le tableau.

## Cohérence des pages
- Réutiliser les composants communs, les tokens, les modales, les badges et les contrôles existants.
- Une action métier doit être visible et accessible selon les permissions ; ne jamais simuler une opération réussie.
- Les notifications et modèles de messages se configurent dans Paramètres → Notifications, pas dans les modules opérationnels.
- Avant de livrer une nouvelle page, vérifier son rendu mobile, ses permissions, ses états de chargement/erreur/vide, la recherche et l'export des tableaux.
- Parcelles et plantations sont alimentées par les workflows automatiques : le PDG peut les consulter, mais aucune action manuelle de création, modification, suppression, changement de statut ou transfert ne doit lui être proposée. Les automatisations et RPC métier autorisés restent responsables de leur évolution.


# Mémoire persistante AgriCapital CRM — obligatoire

Avant toute nouvelle tâche, lire intégralement `docs/CRM_OPERATING_ROADMAP.md`. Ce document est la mémoire durable des décisions métier, des dossiers, des migrations, des vérifications et des éléments en attente. Ne pas demander à l'utilisateur de répéter les informations qui y figurent.

- Vérifier les données réelles et l'état de production avant chaque intervention ; la feuille de route ne remplace pas les contrôles live.
- Exécuter les tâches de bout en bout : migration Supabase, code si nécessaire, commit GitHub, déploiement Vercel production et vérification.
- Après chaque tâche terminée, mettre à jour `docs/CRM_OPERATING_ROADMAP.md` dans le même commit. Noter la migration, le SHA, les contrôles DB, le déploiement et les points restant à faire.
- Ne jamais déclarer un travail terminé tant que les données ne sont pas vérifiées et que le déploiement requis n'est pas `READY`.
- Conserver les consignes antérieures encore valides. Une consigne récente ne remplace que le point auquel elle s'oppose.
- Ne jamais inventer de convention foncière, date de signature, référence, paiement, mode de paiement ou document juridique. Les champs inconnus restent nuls.
- Distinguer le propriétaire foncier, son profil `beneficiaire_particulier` et les clients commerciaux PalmInvest associés à ses parcelles.
- Pour les parcelles partagées PalmInvest, respecter la séparation 1 ha client + 1 ha propriétaire bénéficiaire, sans offre ni dette pour le propriétaire bénéficiaire.
- Ne jamais contourner RLS, les autorisations ou les triggers par falsification de session.
- L'utilisateur attend l'exécution, pas des comptes rendus répétitifs. Répondre brièvement et ne signaler que les éléments réellement encore en attente.
