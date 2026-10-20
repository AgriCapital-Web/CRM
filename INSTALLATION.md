# Installation et configuration — AgriCapital 360

## Prérequis

- Node.js 24.x
- npm 12.x
- Accès autorisé au dépôt GitHub, au projet Supabase et au projet Vercel pour les opérations concernées.

## Développement local

```bash
npm ci
npm run dev
```

Vérifications avant publication d’AgriCapital 360 :

```bash
npm run typecheck
npm run lint
npm run build
```

## Services connectés

- **Supabase** fournit la base PostgreSQL, l'authentification, le stockage et les Edge Functions.
- **Vercel** héberge le frontend de production à l'adresse https://app.agricapital.ci.
- Les migrations SQL conservées dans `supabase/migrations/` constituent l'historique versionné du schéma. Ne supprimez pas les migrations déjà appliquées pour « nettoyer » la base : cela casserait la reproductibilité de l'installation.
- Les variables d'environnement se configurent dans les espaces sécurisés Vercel/Supabase. Ne placez aucun secret dans Git ni dans le code frontend.

## Comptes et accès

Il n'existe pas d'identifiant ou de mot de passe administrateur universel à utiliser depuis cette documentation. Les comptes doivent être créés, approuvés et réinitialisés par les mécanismes d'authentification et d'administration déjà configurés.

## Notifications

Les canaux de notification dépendent de la configuration serveur et des secrets correspondants. Configurez-les dans Supabase/Vercel selon le service utilisé, puis testez les notifications depuis l'application. Ne collez jamais une clé API dans un fichier versionné.

## Déploiement

Le déploiement de production est géré par Vercel à partir de la branche `main`. Consultez `DEPLOIEMENT.md` pour les contrôles de production.

## Sécurité et données

- Ne supprimez pas les tables ou données métier sur la seule base d'un faible nombre de lignes.
- Conservez les contrôles RLS, les relations et les journaux d'audit.
- Toute suppression de données doit être précédée d'une vérification des références, dépendances et règles de conservation.