/** Constantes de compatibilité pour les codes de rôles connus. Le catalogue runtime officiel vient de public.app_roles. */

export const ROLES = {
  PDG: 'pdg',
  DG: 'dg',
  RESPONSABLE_OPERATIONS: 'responsable_operations',
  RESPONSABLE_COMMERCIAL: 'responsable_commercial',
  COMPTABLE: 'comptable',
  COMMERCIAL: 'commercial',
  SERVICE_CLIENT: 'service_client',
  ASSISTANT_ADMIN: 'assistant_administratif',
  CHEF_EQUIPE_COMMERCIAL: 'chef_equipe_commercial',
  CHEF_EQUIPE_TECHNIQUE: 'chef_equipe_technique',
  TECHNICIEN: 'technicien',
  CHEF_EQUIPE_SERVICE_CLIENT: 'chef_equipe_service_client',
  ASSOCIE_ACTIONNAIRE: 'associe_actionnaire',
} as const;

export type AppRole = typeof ROLES[keyof typeof ROLES];

export interface RoleDefinition {
  code: string;
  nom: string;
  court: string;
  description: string;
  niveau: number;
  niveauLabel: string;
  couleur: string;
}

export const OFFICIAL_ROLES: RoleDefinition[] = [
  { code: ROLES.PDG, nom: 'PDG', court: 'PDG', description: 'Accès global à la plateforme au titre de la Direction Générale / gouvernance exécutive', niveau: 1, niveauLabel: 'Direction Générale', couleur: 'bg-primary/10 text-primary' },
  { code: ROLES.DG, nom: 'DG', court: 'DG', description: 'Accès global à la plateforme, distinct du PDG, avec les accès exécutifs nécessaires à la Direction Générale', niveau: 1, niveauLabel: 'Direction Générale', couleur: 'bg-primary/10 text-primary' },
  { code: ROLES.RESPONSABLE_OPERATIONS, nom: 'Responsable des Opérations', court: 'ROps', description: 'Pilotage des opérations, offres et paramétrage métier', niveau: 2, niveauLabel: 'Direction', couleur: 'bg-primary/10 text-primary' },
  { code: ROLES.RESPONSABLE_COMMERCIAL, nom: 'Responsable Commercial', court: 'RCom', description: "Pilotage commercial et gestion d'une zone", niveau: 3, niveauLabel: 'Management', couleur: 'bg-accent/20 text-accent-foreground' },
  { code: ROLES.COMPTABLE, nom: 'Comptable', court: 'Compta', description: 'Gestion financière, paiements et comptabilité', niveau: 3, niveauLabel: 'Management', couleur: 'bg-accent/20 text-accent-foreground' },
  { code: ROLES.CHEF_EQUIPE_COMMERCIAL, nom: "Chef d'Equipe Commercial", court: 'CEC', description: "Encadrement d'une équipe commerciale terrain", niveau: 4, niveauLabel: 'Encadrement', couleur: 'bg-secondary text-secondary-foreground' },
  { code: ROLES.CHEF_EQUIPE_TECHNIQUE, nom: "Chef d'Equipe Technique", court: 'CET', description: "Encadrement d'une équipe technique terrain", niveau: 4, niveauLabel: 'Encadrement', couleur: 'bg-secondary text-secondary-foreground' },
  { code: ROLES.TECHNICIEN, nom: 'Technicien', court: 'Tech', description: 'Visites, rapports et interventions techniques terrain', niveau: 5, niveauLabel: 'Opérationnel', couleur: 'bg-muted text-muted-foreground' },
  { code: ROLES.CHEF_EQUIPE_SERVICE_CLIENT, nom: "Chef d'Equipe Service Client", court: 'CESC', description: "Encadrement de l'équipe service client", niveau: 4, niveauLabel: 'Encadrement', couleur: 'bg-secondary text-secondary-foreground' },
  { code: ROLES.COMMERCIAL, nom: 'Commercial', court: 'Comm', description: 'Prospection, leads et clients', niveau: 5, niveauLabel: 'Opérationnel', couleur: 'bg-muted text-muted-foreground' },
  { code: ROLES.SERVICE_CLIENT, nom: 'Service Client', court: 'SC', description: 'Support, tickets et assistance client', niveau: 5, niveauLabel: 'Opérationnel', couleur: 'bg-muted text-muted-foreground' },
  { code: ROLES.ASSISTANT_ADMIN, nom: 'Assistant(e) Administratif(ve)', court: 'AA', description: 'Appui administratif et gestion documentaire', niveau: 5, niveauLabel: 'Opérationnel', couleur: 'bg-muted text-muted-foreground' },
  { code: ROLES.ASSOCIE_ACTIONNAIRE, nom: 'Associé / Actionnaire', court: 'A/A', description: 'Lecture seule des indicateurs, ventes, clients, plantations et finances autorisées', niveau: 2, niveauLabel: 'Gouvernance', couleur: 'bg-emerald-500/10 text-emerald-700' },
];

export const OFFICIAL_ROLE_CODES: string[] = OFFICIAL_ROLES.map((r) => r.code);

/** Normalisation de format uniquement. Le catalogue officiel des rôles vient de la base (app_roles). */
export function normalizeRole(role?: string | null): string {
  return role?.trim() || '';
}

export function normalizeRoles(roles: string[] = []): string[] {
  return Array.from(new Set(roles.map(normalizeRole).filter(Boolean)));
}

export const ROLE_LABELS: Record<string, string> = Object.fromEntries(
  OFFICIAL_ROLES.map((r) => [r.code, r.nom]),
);

export const ROLE_SHORT_LABELS: Record<string, string> = Object.fromEntries(
  OFFICIAL_ROLES.map((r) => [r.code, r.court]),
);

export const ROLE_COLORS: Record<string, string> = Object.fromEntries(
  OFFICIAL_ROLES.map((r) => [r.code, r.couleur]),
);

export function roleLabel(role?: string | null): string {
  const code = normalizeRole(role);
  return ROLE_LABELS[code] || (code ? code.replace(/_/g, ' ') : '—');
}

/** Rôles autorisés à recevoir l'affectation d'un lead / d'un client */
export const COMMERCIAL_ASSIGNABLE_ROLES: string[] = [
  ROLES.COMMERCIAL,
  ROLES.CHEF_EQUIPE_COMMERCIAL,
  ROLES.RESPONSABLE_COMMERCIAL,
];

/** Rôles disposant d'une couverture territoriale (équipe / district / région) */
export const TERRITORIAL_ROLES: string[] = [
  ROLES.COMMERCIAL,
  ROLES.CHEF_EQUIPE_COMMERCIAL,
  ROLES.CHEF_EQUIPE_TECHNIQUE,
  ROLES.TECHNICIEN,
  ROLES.RESPONSABLE_COMMERCIAL,
];

export const PERMISSIONS = {
  VIEW_DASHBOARD: "dashboard.view",
  VIEW_CLIENTS: "clients.view",
  VIEW_LEADS: "leads.view",
  VIEW_PLANTATIONS: "plantations.view",
  VIEW_PARCELLES: "parcelles.view",
  VIEW_PROPRIETAIRES: "proprietaires.view",
  VIEW_PAIEMENTS: "paiements.view",
  VIEW_COMMISSIONS: "commissions.view",
  VIEW_PORTEFEUILLES: "portefeuilles.view",
  MANAGE_PORTEFEUILLES: "portefeuilles.manage_payouts",
  VIEW_RAPPORTS_TECHNIQUES: "rapports.view_technique",
  VIEW_RAPPORTS_FINANCIERS: "rapports.view_financier",
  VIEW_CLIENT_MONEY: "clients.view_money",
  VIEW_TICKETS: "tickets.view",
  VIEW_PARAMETRES: "parametres.view",
  VIEW_EQUIPES: "parametres.manage_teams",
  MANAGE_USERS: "utilisateurs.view",
  MANAGE_TEAMS: "parametres.manage_teams",
  MANAGE_OFFERS: "offres.view",
  MANAGE_GEO: "parametres.manage_geo",
  MANAGE_ROLES: "roles.manage_permissions",
  MANAGE_SYSTEM: "parametres.manage_system",
  VIEW_AUDIT: "parametres.view_audit",
  VALIDATE_PAYMENTS: "paiements.validate",
  CREATE_ACQUISITION: "clients.create",
  CREATE_BENEFICIAIRE: "beneficiaires.create",
  MANAGE_REMUNERATION: "finance.manage",
  DELETE_DATA: "clients.delete",
} as const;
