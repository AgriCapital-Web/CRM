# AgriCapital 360

**Signature officielle :** La plateforme métier intelligente d’AgriCapital.

AgriCapital 360 est la plateforme métier intégrée d’AgriCapital SARL. Elle réunit les opérations commerciales, les clients, le foncier et les plantations, les paiements, la finance, les équipes, les documents et les outils de pilotage dans un environnement sécurisé.

Le nom de produit remplace l’ancienne appellation d’interface « AC_Teams ». Les routes, schémas de base de données, identifiants de stockage, permissions et intégrations restent inchangés.

**Développeur / responsable technique :** Inocent KOFFI

## Stack

- Vite
- React + TypeScript
- Supabase
- shadcn/ui
- Tailwind CSS
- PWA / IndexedDB / synchronisation offline

## Développement

```bash
npm install
npm run dev
```

## Vérifications

```bash
npm run build
npm run typecheck
npm run lint
npm run test
```

Le projet est conçu pour fonctionner en mode offline-first : les écritures compatibles sont mises en file localement et synchronisées au retour du réseau.
