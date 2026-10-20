# Suite bureautique d’AgriCapital 360 (Nextcloud + ONLYOFFICE)

Cette configuration prépare un serveur persistant séparé du CRM Vercel. Elle ne déploie pas elle-même les conteneurs sur le VPS : il faut exécuter les commandes sur le serveur qui hébergera les fichiers et les bases de données.

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
7. Dans Vercel, ajouter `VITE_OFFICE_SUITE_URL=https://docs.agricapital.ci` à l’environnement de production et redéployer le CRM.

Caddy gère automatiquement les certificats TLS lorsque le DNS et les ports sont corrects. La clé JWT ONLYOFFICE doit être identique côté Document Server et côté application Nextcloud.

## Important sur l’intégration CRM

L’espace de travail d’AgriCapital 360 dispose déjà de ses documents internes, partages, commentaires, versions et notifications. Ce serveur fournit la suite bureautique collaborative pour les fichiers bureautiques. Le lien de portail peut ouvrir Nextcloud, mais la synchronisation bidirectionnelle des documents du CRM avec les fichiers ONLYOFFICE/Nextcloud (création d’un document dans le CRM puis édition directe du même fichier dans ONLYOFFICE) nécessite une liaison API/WebDAV sécurisée supplémentaire et les identifiants de service correspondants. Ne présentez pas cette liaison comme active tant qu’un test de bout en bout n’a pas été réussi.

## Exploitation et sécurité

- Ne pas exposer directement MariaDB, Redis ou les ports internes d’ONLYOFFICE.
- Sauvegarder les volumes `mariadb_data`, `nextcloud_data`, `onlyoffice_data` et les fichiers de configuration.
- Conserver les secrets hors du dépôt; renouveler les mots de passe et la clé JWT selon la politique de sécurité.
- Tester la restauration d’une sauvegarde avant l’usage en production.
- Vérifier les exigences de licence et les limites de ressources de la suite bureautique avant l’ouverture à tous les collaborateurs.
