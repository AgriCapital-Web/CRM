/** Métadonnées UI des permissions connues. Les droits réellement attribués viennent exclusivement de public.role_permissions. */

import { ROLES, OFFICIAL_ROLE_CODES } from "@/lib/roles";

export interface PermissionDef {
  code: string;
  module: string;
  action: string;
  libelle: string;
}

const build = (module: string, moduleLabel: string, actions: [string, string][]): PermissionDef[] =>
  actions.map(([action, libelle]) => ({ code: `${module}.${action}`, module: moduleLabel, action, libelle }));

const CRUD: [string, string][] = [
  ["view", "Consulter"], ["create", "Créer"], ["update", "Modifier"], ["archive", "Archiver"], ["delete", "Supprimer"], ["restore", "Réactiver"],
];

export const PERMISSION_CATALOG: PermissionDef[] = [
  ...build("dashboard", "Tableau de bord", [["view", "Consulter le tableau de bord"]]),
  ...build("utilisateurs", "Utilisateurs", [...CRUD, ["reset_password", "Réinitialiser le mot de passe"], ["manage_roles", "Modifier les rôles d'un utilisateur"]]),
  ...build("roles", "Rôles", [...CRUD, ["manage_permissions", "Gérer les permissions"]]),
  ...build("offres", "Offres", [...CRUD, ["manage_prices", "Gérer les prix et le Paiement Initial"], ["manage_promotions", "Gérer les promotions"]]),
  ...build("promotions", "Promotions", [...CRUD, ["activate", "Activer / désactiver"], ["view_history", "Consulter l'historique"]]),
  ...build("leads", "Leads", [["view", "Consulter"], ["create", "Créer"], ["update", "Modifier"], ["assign", "Affecter"], ["archive", "Archiver"], ["delete", "Supprimer"]]),
  ...build("clients", "Clients", [["view", "Consulter"], ["view_money", "Consulter la monnaie client"], ["create", "Créer"], ["update", "Modifier"], ["archive", "Archiver"], ["delete", "Supprimer"]]),
  ...build("plantations", "Plantations", [["view", "Consulter"], ["create", "Créer"], ["update", "Modifier"], ["archive", "Archiver"], ["delete", "Supprimer"]]),
  ...build("parcelles", "Parcelles", [["view", "Consulter"], ["create", "Créer"], ["update", "Modifier"], ["archive", "Archiver"], ["delete", "Supprimer"]]),
  ...build("proprietaires", "Propriétaires partenaires", [["view", "Consulter"], ["create", "Créer"], ["update", "Modifier"], ["archive", "Archiver"], ["delete", "Supprimer"]]),
  ...build("paiements", "Paiements", [["view", "Consulter"], ["create", "Créer"], ["record", "Enregistrer"], ["execute", "Effectuer"], ["update", "Modifier"], ["cancel", "Annuler"], ["validate", "Valider"]]),
  ...build("documents", "Documents", [["view", "Consulter"], ["upload", "Téléverser"], ["validate", "Valider"]]),
  ...build("rapports", "Rapports", [["view_technique", "Voir les rapports techniques"], ["view_financier", "Voir les rapports financiers"], ["export", "Exporter les données"]]),
  ...build("commissions", "Commissions", [["view", "Consulter"], ["validate", "Valider"], ["manage_payouts", "Paramétrer et effectuer les versements"]]),
  ...build("beneficiaires", "Bénéficiaires", [["view", "Consulter"], ["create", "Créer un bénéficiaire"], ["update", "Modifier"]]),
  ...build("portefeuilles", "Portefeuilles", [["view", "Consulter"], ["manage_payouts", "Gérer les versements"]]),
  ...build("messagerie", "Messagerie du portail", [["view", "Consulter les messages"], ["send", "Envoyer des messages"], ["delete", "Supprimer des messages"]]),
  ...build("tickets", "Support", [["view", "Consulter"], ["create", "Créer"], ["update", "Traiter"]]),
  ...build("parametres", "Paramètres", [["view", "Accéder aux paramètres"], ["manage_geo", "Gérer le référentiel géographique"], ["manage_teams", "Gérer les équipes"], ["manage_users", "Gérer les utilisateurs"], ["manage_system", "Gérer la configuration système"], ["view_audit", "Consulter les journaux d'audit"]]),
  ...build("finance", "Finance & Comptabilité", [["view", "Consulter"], ["manage", "Gérer"], ["expenses", "Gérer les dépenses"], ["payroll", "Gérer les salaires et la paie"], ["associates", "Gérer les mouvements des associés"], ["reports", "Consulter les rapports financiers"]]),
];

export const PERMISSION_CODES = PERMISSION_CATALOG.map((p) => p.code);
export const PERMISSIONS_BY_MODULE = PERMISSION_CATALOG.reduce<Record<string, PermissionDef[]>>((acc, p) => { (acc[p.module] ||= []).push(p); return acc; }, {});
const all = () => [...PERMISSION_CODES];
const only = (...prefixes: string[]) => PERMISSION_CODES.filter((c) => prefixes.some((p) => (p.endsWith(".") ? c.startsWith(p) : c === p)));


// Les permissions effectives sont exclusivement celles stockées dans public.role_permissions.
// Ce fichier ne contient que le catalogue UI des codes autorisés.
