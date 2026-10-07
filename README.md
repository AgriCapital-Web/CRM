# AgriCapital App

Application professionnelle de gestion agricole d'AgriCapital SARL.

**Développeur / responsable technique : Inocent KOFFI**

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

## Production

```bash
npm run build
npm run typecheck
npm run lint
```

Le projet est conçu pour fonctionner en mode offline-first : les écritures compatibles sont mises en file localement et synchronisées au retour du réseau.
