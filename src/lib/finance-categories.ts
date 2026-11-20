/**
 * Familles de catégories de dépenses adaptées aux opérations agricoles.
 * Les anciennes valeurs sont conservées pour préserver la lecture de l'historique.
 */
export const FINANCE_EXPENSE_CATEGORY_GROUPS = [
  {
    label: "Achats et équipements agricoles",
    categories: [
      "ACHAT DE MATÉRIEL AGRICOLE",
      "MATÉRIEL AGRICOLE",
      "ÉQUIPEMENTS AGRICOLES",
      "OUTILLAGE AGRICOLE",
      "OUTILS ET PETIT MATÉRIEL",
      "ÉQUIPEMENTS DE TRAITEMENT",
      "MATÉRIEL DE RÉCOLTE",
      "IRRIGATION ET POMPAGE",
      "MACHINES ET ÉQUIPEMENTS DE TRANSFORMATION",
      "PIÈCES ET ACCESSOIRES",
      "MATÉRIEL",
      "ÉQUIPEMENTS",
      "ACHATS",
    ],
  },
  {
    label: "Engins, véhicules et mobilité",
    categories: [
      "ENGINS AGRICOLES",
      "VÉHICULES",
      "MOTOS",
      "TRANSPORT",
      "LOGISTIQUE",
      "CARBURANT",
      "ENTRETIEN ET RÉPARATION DES ENGINS",
      "DÉPLACEMENTS",
    ],
  },
  {
    label: "Intrants et production agricole",
    categories: [
      "ACHAT DE PLANTS",
      "INTRANTS AGRICOLES",
      "FOURNITURES AGRICOLES",
      "MATIÈRES PREMIÈRES",
      "FOURNITURES",
      "PRÊT DE PLANTS",
    ],
  },
  {
    label: "Travaux et prestations agricoles",
    categories: [
      "PRESTATIONS",
      "SERVICES",
      "MAIN-D’ŒUVRE",
      "DÉFRICHAGE",
      "TROUAISON",
      "NETTOYAGE",
      "RÉPARATIONS",
      "ENTRETIEN",
    ],
  },
  {
    label: "Personnel et fonctionnement",
    categories: [
      "SALAIRES",
      "CHARGES SOCIALES",
      "FRAIS DE MISSION",
      "HÉBERGEMENT",
      "RESTAURATION",
      "LOYER",
      "EAU",
      "ÉLECTRICITÉ",
      "INTERNET",
      "TÉLÉPHONE",
      "COMMUNICATION",
      "MARKETING",
      "FORMATION",
      "RECRUTEMENT",
      "HONORAIRES",
      "ASSURANCE",
      "SÉCURITÉ",
      "LOGICIELS",
      "ABONNEMENTS",
    ],
  },
  {
    label: "Frais financiers et divers",
    categories: [
      "FRAIS BANCAIRES",
      "BANQUE",
      "IMPÔTS ET TAXES",
      "DONS",
      "FOURNITURES DE BUREAU",
      "AUTRE",
    ],
  },
] as const;

export const FINANCE_EXPENSE_CATEGORIES = [
  ...new Set(FINANCE_EXPENSE_CATEGORY_GROUPS.flatMap((group) => [...group.categories])),
] as string[];
