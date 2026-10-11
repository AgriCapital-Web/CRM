# Audit technique AgriCapital CRM — 11 octobre 2026

## Périmètre et limites

Audit à partir du dépôt `AgriCapital-Web/CRM` sur `main`, du projet Supabase `rfzfsmpsuempafhkqhra`, des Edge Functions déployées et du projet Vercel `crm`. Les constats ci-dessous distinguent les vérifications de code et de configuration des tests navigateur qui restent à exécuter. Aucun test E2E réel sur mobile/desktop n'a été possible depuis cette inspection, et le build du dernier commit frontend n'était pas encore disponible au moment du relevé.

## Corrections appliquées

1. **Matrice des permissions et navigation** — `src/hooks/usePermissions.tsx`, commit `ff7be1e4ff24cc1e733dcb2095dbd7e0cc1c4bed`. Le hook relisait `role_permissions` à chaque montage de route. La matrice est maintenant mise en cache via React Query (stale 5 min, GC 30 min) et le chargement en arrière-plan ne bloque pas une page déjà rendue.
2. **Événements d'authentification** — `src/hooks/useAuth.tsx`, commit `abd71933c56cb001206c6102bde385b0c520abc2`. Les rafraîchissements ordinaires de token n'hydratent pas le profil et les rôles. Un événement `USER_UPDATED` force toutefois la réhydratation même pour le même identifiant utilisateur.
3. **Soumission des formulaires** — `src/App.tsx`, commit `96f78e41ca8e64fe68833ec69995a33b0876b4aa`. Suppression du listener global en capture qui empêchait par défaut les soumissions natives de formulaires. Le garde de navigation SPA sur les liens internes est conservé.
4. **Endpoint d'automatisation de notifications** — Edge Function `notification-cron`, version 6. Avant correction, cette fonction était appelée sans authentification et utilisait la clé service-role pour traiter les files de notifications et de provisionnement de comptes. Elle exige maintenant `x-agricapital-automation-secret`, vérifié contre le secret Vault `notification_cron_secret` (ou `NOTIFICATION_CRON_SECRET`). Le job `agricapital-notification-automation` envoie désormais ce secret depuis Vault, sans l'inscrire en clair dans le dépôt. Le job cron a réussi après le changement (exécution observée à 01:45 UTC le 11/10/2026).

## Constatations confirmées

### Frontend / navigateur

- Le chargement de la matrice de permissions était répété à chaque montage d'une route protégée : cause crédible de transitions blanches/attente lors de la navigation.
- Le fournisseur d'authentification est global. Le listener Supabase peut recevoir `TOKEN_REFRESHED`; il ne doit pas faire basculer l'application dans un état de chargement à chaque renouvellement.
- Le garde SPA interceptait aussi tous les événements `submit` globaux et empêchait la soumission native, sans rapport direct avec React Router.
- Le service worker `public/sw.js` utilise un cache versionné, met en cache `index.html` en navigation et appelle `skipWaiting/clients.claim`. Aucun appel explicite à `location.reload()` n'a été trouvé dans son code examiné. Son comportement doit néanmoins être vérifié dans un vrai navigateur après déploiement, avec cache froid/chaud et mise à jour.
- `src/lib/offlineHttp.ts` installe une file de mutations hors ligne et un contrôle périodique chaque minute. Les chemins de reprise, l'idempotence des mutations et la séparation des données en cache par utilisateur méritent des tests E2E ciblés ; ils n'ont pas été validés intégralement ici.
- Le projet expose `npm run typecheck`, `npm run lint` et `npm run build`, mais ces commandes n'ont pas été exécutées dans un environnement local pendant cet audit.

### Backend / Edge Functions

- 43 Edge Functions actives ont été recensées. Plusieurs ont `verify_jwt=false` mais implémentent une authentification métier spécifique (signature de webhook, session de portail, secret interne ou contrôle de rôle) ; cette configuration n'est pas à elle seule la preuve d'une vulnérabilité.
- **`notification-cron` était une exposition confirmée de privilèges élevés** : endpoint sans vérification de l'appelant, puis opérations privilégiées via service-role. Corrigé par secret interne et job cron mis à jour.
- Il reste à tester systématiquement chaque fonction publique : appels anonymes, jetons invalides, mauvais rôle, rejouabilité, limitation de débit, CORS, erreurs et secrets. Ne pas activer `verify_jwt` en masse : les webhooks et les flux portail utilisent des protocoles d'authentification différents.

### Base de données / sécurité

État observé en lecture seule :

- 88 tables dans `public`, 206 politiques RLS, 181 fonctions dans `public`.
- Aucune table de `public` sans RLS activé n'a été retournée par la vérification du catalogue.
- L'advisor Supabase signale **27 fonctions SECURITY DEFINER exécutables par `authenticated`**. Il faut les examiner une par une : certaines fonctions sont des helpers appelés par les politiques RLS et leur retrait aveugle de privilèges peut casser l'application. Chaque fonction exposée doit avoir une justification, des contrôles d'identité/périmètre et des droits d'exécution minimaux.
- La protection Supabase contre les mots de passe compromis est signalée comme désactivée.
- L'advisor performance signale **29 groupes de politiques permissives multiples** et **86 index non utilisés**. Les politiques doivent être fusionnées uniquement après comparaison exacte de leur logique (sinon risque d'élargir/réduire les accès). Les index inutilisés ne doivent pas être supprimés sur ce seul signal : l'historique d'usage et les plans de requête doivent d'abord être vérifiés.
- Des politiques publiques ciblées existent pour les formulaires prospects/demandes de compte et les référentiels géographiques actifs ; elles doivent rester limitées aux colonnes et opérations nécessaires.

### Observabilité / déploiement

- Vercel n'a remonté aucune erreur runtime groupée sur la fenêtre de 7 jours consultée. Cela ne prouve pas l'absence de bugs côté navigateur.
- Le déploiement READY le plus récent au relevé correspond au commit `abd71933`. Aucun déploiement n'était listé pour le commit frontend `96f78e41` au moment de la vérification. Le dernier état combiné GitHub/Vercel signalait `build-rate-limit`.
- La correction du formulaire est sur `main`, mais son déploiement et son comportement réel doivent encore être vérifiés.
- La requête de logs Supabase a échoué avec une erreur backend pendant l'audit ; aucun constat d'absence d'erreurs DB/Edge n'est donc tiré de cette requête.

## Plan de validation restant

1. Laisser Vercel construire le commit `96f78e41` dès que la limite est levée, puis confirmer le SHA exact du déploiement actif.
2. Exécuter typecheck, lint et build ; corriger les erreurs avant toute autre suppression.
3. Tester la navigation sur Chrome desktop et Android/iOS : clics menu, retour/avance, liens directs, session active, expiration/refresh token, perte/reprise réseau, cache service worker, formulaires et sélection de fichiers.
4. Parcourir les modules métier avec des comptes de rôles différents et vérifier les permissions côté base, pas seulement l'interface.
5. Examiner les 27 fonctions SECURITY DEFINER et les 37 Edge Functions sans vérification JWT par lots, en partant des fonctions qui manipulent comptes, paiements, notifications et données du portail.
6. Optimiser les politiques et index après mesure. Aucune donnée métier ni table n'a été supprimée pendant cet audit.

## Règle de suppression

Aucun module, table, index ou fonction métier ne doit être supprimé sur le seul critère de son ancienneté ou d'un usage statistique nul. Avant suppression : rechercher les références dans le frontend, Edge Functions, triggers, politiques RLS, tâches cron et migrations ; vérifier les données et préparer un rollback.
