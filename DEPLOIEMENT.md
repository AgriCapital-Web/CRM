# Déploiement du CRM AgriCapital

## Production

- Application : https://app.agricapital.ci
- Dépôt : https://github.com/AgriCapital-Web/CRM
- Branche de production : `main`
- Hébergement frontend : Vercel
- Base de données, authentification, stockage et fonctions serveur : Supabase

## Déployer

Le projet est relié à Vercel. Un déploiement de production est déclenché par les changements validés sur `main`, selon la configuration du projet.

Pour une vérification locale :

```bash
npm ci
npm run typecheck
npm run lint
npm run build
```

Le résultat de compilation est créé dans `dist/`. Ne téléversez pas manuellement le dépôt source sur un hébergement FTP.

## Configuration

- Les variables d'environnement sont configurées dans les paramètres Vercel et Supabase selon leur usage.
- Ne commitez jamais de fichier `.env`, clé API, jeton, mot de passe ou secret.
- Les variables `VITE_*` sont incorporées au bundle frontend : elles ne doivent contenir que des valeurs conçues pour être publiques, jamais de clé service-role ou de secret.
- Les migrations SQL versionnées dans `supabase/migrations/` documentent les évolutions du schéma. Vérifiez l'état de la base et les dépendances avant toute migration destructive.

## Vérifications après déploiement

1. Vérifier que le déploiement est `Ready` dans Vercel.
2. Ouvrir https://app.agricapital.ci et tester l'authentification.
3. Vérifier les accès autorisés et refusés selon les rôles.
4. Tester les lectures et écritures en base, les téléversements et les fonctions serveur concernés.
5. Examiner les journaux de build et d'exécution en cas d'échec.

## Sécurité

Aucun identifiant ni mot de passe administrateur ne doit être conservé dans la documentation. Créez et gérez les comptes via le processus sécurisé prévu par l'application et Supabase Auth.