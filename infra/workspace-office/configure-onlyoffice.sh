#!/usr/bin/env sh
set -eu

if [ ! -f .env ]; then
  echo "Fichier .env absent. Copiez .env.example vers .env et renseignez tous les secrets." >&2
  exit 1
fi

set -a
. ./.env
set +a

: "${NEXTCLOUD_DOMAIN:?}"
: "${ONLYOFFICE_DOMAIN:?}"
: "${ONLYOFFICE_JWT_SECRET:?}"

docker compose exec -T -u www-data nextcloud php occ app:install onlyoffice || true
docker compose exec -T -u www-data nextcloud php occ app:enable onlyoffice
docker compose exec -T -u www-data nextcloud php occ config:app:set onlyoffice DocumentServerUrl --value="https://${ONLYOFFICE_DOMAIN}/"
docker compose exec -T -u www-data nextcloud php occ config:app:set onlyoffice DocumentServerInternalUrl --value="http://onlyoffice/"
docker compose exec -T -u www-data nextcloud php occ config:app:set onlyoffice StorageUrl --value="http://nextcloud/"
docker compose exec -T -u www-data nextcloud php occ config:app:set onlyoffice jwt_secret --value="${ONLYOFFICE_JWT_SECRET}"

echo "ONLYOFFICE est configuré dans Nextcloud."
echo "Vérifiez les deux domaines, TLS, les sauvegardes et la création d’un document test."
