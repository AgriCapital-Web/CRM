# Politique de déploiement du CRM AgriCapital

## Objectif

Regrouper les changements de toutes les branches et ne publier en production que le dernier état de `main`, une fois par jour au maximum.

## Fonctionnement

1. Chaque modification est développée sur une branche dédiée.
2. Chaque branche passe par une Pull Request vers `main`.
3. Les contrôles GitHub Actions doivent réussir avant la fusion.
4. Les déploiements Git automatiques Vercel sont désactivés sur toutes les branches.
5. Chaque jour à 18 h (heure d'Abidjan), GitHub Actions vérifie si `main` a changé depuis le dernier déclenchement accepté par Vercel.
6. S'il y a eu une ou plusieurs fusions, un seul Deploy Hook Vercel publie le dernier état de `main`.
7. S'il n'y a aucune nouvelle fusion, aucun déploiement n'est lancé.
8. Le workflow peut être lancé manuellement en cas d'urgence, avec l'option `force`.

## Configuration obligatoire avant fusion de cette politique

### 1. Créer le Deploy Hook Vercel

Dans le projet Vercel **crm** :

1. Ouvrir **Settings → Git → Deploy Hooks**.
2. Créer un hook nommé `production-daily-main`.
3. Sélectionner la branche `main`.
4. Copier l'URL générée. Cette URL est un secret : ne pas la publier.

### 2. Enregistrer le secret GitHub

Dans **AgriCapital-Web/CRM → Settings → Secrets and variables → Actions** :

1. Ajouter un secret nommé exactement `VERCEL_DEPLOY_HOOK_URL`.
2. Coller l'URL du Deploy Hook Vercel.

### 3. Effet de la configuration Vercel

La propriété `git.deploymentEnabled = false` dans `vercel.json` suspend les déploiements automatiques déclenchés par Git sur toutes les branches, y compris les Preview. L'intégration Git reste connectée et le Deploy Hook lié à `main` reste le mécanisme de publication.

Cette suspension est volontaire : elle évite que chaque commit de branche ou chaque mise à jour de Pull Request consomme un déploiement. Les contrôles GitHub Actions restent actifs.

## Règles d'exploitation

- Ne jamais lancer un déploiement Vercel à chaque commit ou fusion.
- Fusionner les PR validées dans `main`; la publication intervient au prochain passage quotidien.
- Pour une urgence, utiliser **Actions → Déploiement de production groupé → Run workflow**, puis activer `force`.
- Vérifier dans Vercel que le déploiement atteint **Ready** : le workflow vérifie l'acceptation du Deploy Hook, pas la réussite finale du build.
- Après un échec de build, relancer manuellement le workflow avec `force`.
- Ne jamais placer l'URL du Deploy Hook dans un fichier versionné.
- Ne pas utiliser l'« Ignored Build Step » pour simuler le regroupement : les déploiements ignorés peuvent tout de même consommer le quota.

## Fréquence attendue

- Automatique : **1 déploiement de production par jour au maximum**, uniquement si `main` a changé.
- Heure : **18 h, heure d'Abidjan**.
- Plusieurs fusions pendant la journée : **1 seul déploiement** avec le dernier état de `main`.
- Aucune fusion depuis le dernier déploiement : **0 déploiement**.
- Déploiement urgent manuel : possible à tout moment, en supplément.
