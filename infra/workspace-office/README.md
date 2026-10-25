# Suite bureautique d’AgriCapital 360 (Nextcloud + ONLYOFFICE)

Cette configuration prépare un serveur persistant séparé de la plateforme AgriCapital 360 déployée sur Vercel. Elle ne déploie pas elle-même les conteneurs sur le VPS : il faut exécuter les commandes sur le serveur qui hébergera les fichiers et les bases de données.

## Prérequis

- Un VPS Linux administrable avec Docker Engine et le plugin Docker Compose.
- Deux sous-domaines pointant vers l’adresse IP publique du VPS : `docs.agricapital.ci` et `office.agricapital.ci` (ou les noms réellement retenus).
- Les ports TCP 80 et 443 ouverts; le port 22 ne doit pas être exposé à Internet sans contrôle.
- Un volume de stockage persistant et une politique de sauvegarde hors serveur.

## Installation

1. Copier ce dossier sur le VPS.
2. Copier `.env.example` en `.env`, puis remplacer tous les exemples par des secrets aléatoires différents. Ne jamais committer le fichier `.env`.
3. Vérifier les enregistrements DNS des deux sous-domaines.
4. Lancer `docker compose up -d` depuis ce dossier.
5. Attendre que Nextcloud et ONLYOFFICE soient prêts, puis exécuter `sh configure-onlyoffice.sh`.
6. Dans Nextcloud, créer un dossier d’équipe et tester la création, l’édition simultanée et l’enregistrement d’un document.
7. Dans Vercel, ajouter `VITE_OFFICE_SUITE_URL=https://docs.agricapital.ci` à l’environnement de production et redéployer AgriCapital 360.

Caddy gère automatiquement les certificats TLS lorsque le DNS et les ports sont corrects. La clé JWT ONLYOFFICE doit être identique côté Document Server et côté application Nextcloud.

## État d’intégration dans le CRM

- La route privée `/espace-bureautique` ouvre le portail documentaire configuré par `VITE_OFFICE_SUITE_URL`.
- Le module de planification budgétaire du CRM est accessible directement par `/planification-budgetaire`; il conserve les tables métier Supabase existantes et les migrations de planification déjà présentes.
- Le portail documentaire ne doit pas être présenté comme une synchronisation automatique des fichiers CRM tant que la liaison décrite ci-dessous n’a pas été mise en place et testée.

## Important sur l’intégration avec AgriCapital 360

L’espace de travail d’AgriCapital 360 dispose déjà de ses documents internes, partages, commentaires, versions et notifications. Ce serveur fournit la suite bureautique collaborative pour les fichiers bureautiques. Le lien de portail peut ouvrir Nextcloud, mais la synchronisation bidirectionnelle des documents d’AgriCapital 360 avec les fichiers ONLYOFFICE/Nextcloud (création d’un document dans AgriCapital 360 puis édition directe du même fichier dans ONLYOFFICE) nécessite une liaison API/WebDAV sécurisée supplémentaire et les identifiants de service correspondants. Ne présentez pas cette liaison comme active tant qu’un test de bout en bout n’a pas été réussi.

## Exploitation et sécurité

- Ne pas exposer directement MariaDB, Redis ou les ports internes d’ONLYOFFICE.
- Sauvegarder les volumes `mariadb_data`, `nextcloud_data`, `onlyoffice_data` et les fichiers de configuration.
- Conserver les secrets hors du dépôt; renouveler les mots de passe et la clé JWT selon la politique de sécurité.
- Tester la restauration d’une sauvegarde avant l’usage en production.
- Vérifier les exigences de licence et les limites de ressources de la suite bureautique avant l’ouverture à tous les collaborateurs.


## Vérifications avant mise en production

1. Vérifier que `https://docs.agricapital.ci` et `https://office.agricapital.ci` résolvent vers le VPS et que TLS est valide.
2. Déployer les conteneurs, configurer des secrets uniques dans le fichier `.env` du VPS et vérifier les volumes persistants.
3. Créer des comptes Nextcloud et des dossiers d’équipe, puis tester l’ouverture, la modification et la sauvegarde d’un DOCX, XLSX et PPTX.
4. Ajouter `VITE_OFFICE_SUITE_URL=https://docs.agricapital.ci` dans les variables d’environnement Vercel puis redéployer le CRM.
5. Exécuter `npm run typecheck`, `npm run test`, `npm run build` et `npm run lint`.
6. Ne pas considérer l’intégration comme complète tant que l’édition d’un fichier depuis une fiche CRM, son retour au stockage attendu et les règles d’accès n’ont pas passé un test de bout en bout.
