# Audit et correction complète du CRM

Fait : le bandeau de bienvenue affiche maintenant « dernier prénom + NOM » (ex. Larrissa KONAN).

Le reste se fait par lots, dans l'ordre ci-dessous, avec une vérification réelle (connexion en tant qu'utilisateur du rôle concerné) après chaque lot.

## Lot 1 — Enregistrements bloqués (priorité absolue)
- Reproduire l'échec d'enregistrement pour : leads, clients, propriétaires, équipes, profil.
- Pour chaque table : vérifier droits d'accès, règles par rôle/périmètre, déclencheurs bloquants (ex. blocage « démo », contrôles téléphone, chaîne géographique) et corriger la cause exacte.
- Buckets de stockage : vérifier existence + règles d'upload/lecture, corriger.

## Lot 2 — Rôles et permissions
- PDG (innocentkoffi1@gmail.com) : accès total à toutes les tables et pages, sans exception.
- Multi-rôles : les droits s'additionnent.
- Chaque rôle : voir / créer / modifier / supprimer selon sa matrice et son périmètre.
- Menus, boutons et pages masqués quand l'utilisateur n'a pas le droit.
- Cycle d'installation vide pour le service client (et autres) : ouvrir la lecture selon le périmètre.

## Lot 3 — Formulaires
- Nom et prénoms : majuscules automatiques dans tous les formulaires.
- Email, mot de passe, nom d'utilisateur et autres champs : saisie libre.
- Toutes les listes déroulantes alimentées par la base (plus aucune valeur codée en dur).

## Lot 4 — Géographie et Diaspora
- Supprimer tous les champs « Diaspora » et oui/non des formulaires.
- Ajouter « Diaspora » comme district sans enfants, activable/désactivable dans Paramètres > Géographie.
- Toutes les listes géographiques n'affichent que les éléments actifs, en cascade.

## Lot 5 — Carte, portail, messagerie, paiements
- Carte : point rouge pour les clients ayant des coordonnées GPS (cas Ferdinand).
- Messagerie liée au portail (même base, rien de nouveau créé) : afficher l'historique, recevoir les messages en direct.
- Supprimer tous les messages et données de démonstration.
- Paiements : mise à jour automatique et instantanée.

## Lot 6 — Nettoyage
- Retirer le code et les éléments obsolètes ou mal configurés.

## Détails techniques
- Diagnostic par requêtes sur politiques RLS, triggers et grants de chaque table, puis migrations ciblées.
- Tests de non-régression pour la matrice des rôles.
