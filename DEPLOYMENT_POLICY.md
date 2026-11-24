# Politique de déploiement du CRM AgriCapital

## Objectif

Regrouper les fusions effectuées dans `main` afin de ne produire qu'un seul déploiement de production par jour, au lieu de lancer un déploiement à chaque fusion.

## Fonctionnement attendu

1. Chaque modification est développée sur une branche dédiée.
2. Chaque branche passe par une Pull Request vers `main`.
3. Les contrôles GitHub Actions doivent réussir avant la fusion.
4. Les fusions dans `main` ne déclenchent plus de déploiement Vercel de production.
5. Les déploiements Preview des branches et Pull Requests restent autorisés.
6. Chaque jour à 18 h (heure d'Abidjan), GitHub Actions vérifie si `main` a changé depuis le dernier déploiement réussi.
7. S'il y a eu une ou plusieurs fusions, le workflow appelle le Deploy Hook Vercel configuré sur `main`. Vercel construit le dernier état de la branche : toutes les fusions sont regroupées dans un seul déploiement.
8. S'il n'y a eu aucune nouvelle fusion, aucun déploiement n'est lancé.
9. Le workflow peut aussi être lancé manuellement depuis l'onglet Actions de GitHub. L'option `force` permet de forcer un déploiement même sans nouveau commit.

## Configuration à effectuer une seule fois

### 1. Créer le Deploy Hook Vercel

Dans le projet Vercel **crm** :

1. Ouvrir **Settings → Git**.
2. Dans **Deploy Hooks**, créer un hook nommé `production-daily-main`.
3. Sélectionner la branche `main`.
4. Copier l'URL générée. Cette URL est un secret : ne pas la publier dans le dépôt, les issues ou les messages.

### 2. Enregistrer le secret GitHub

Dans le dépôt GitHub **AgriCapital-Web/CRM** :

1. Ouvrir **Settings → Secrets and variables → Actions**.
2. Ajouter un secret nommé exactement `VERCEL_DEPLOY_HOOK_URL`.
3. Coller l'URL du Deploy Hook Vercel comme valeur.

### 3. Activer la politique

La propriété `git.deploymentEnabled.main = false` dans `vercel.json` désactive les déploiements automatiques déclenchés par les pushes sur `main`. Les autres branches conservent leurs déploiements Preview.

Le Deploy Hook reste le canal de déclenchement des déploiements de production. Ne pas désactiver l'intégration Git du projet : elle reste nécessaire aux Deploy Hooks et aux Preview.

## Règles de travail à respecter

- Ne jamais lancer un déploiement Vercel à chaque commit ou à chaque fusion.
- Fusionner les Pull Requests validées dans `main`; la mise en production intervient au prochain passage quotidien.
- Pour une urgence, utiliser **Actions → Déploiement de production groupé → Run workflow**, puis activer `force` si nécessaire.
- Ne jamais placer l'URL du Deploy Hook dans un fichier versionné.
- Ne pas utiliser l'« Ignored Build Step » pour simuler ce regroupement : Vercel indique que les déploiements annulés par cette fonction comptent tout de même dans les quotas de déploiement.

## Fréquence et effet attendu

- Automatique : **1 déploiement de production par jour au maximum**, uniquement si `main` a changé.
- Heure prévue : **18 h, heure d'Abidjan**.
- Plusieurs fusions pendant la journée : **1 seul déploiement**, contenant le dernier état de `main`.
- Aucune fusion depuis le dernier déploiement : **0 déploiement**.
- Déploiement urgent manuel : possible à tout moment, en plus du passage quotidien.
