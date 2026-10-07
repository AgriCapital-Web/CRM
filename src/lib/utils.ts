import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const displayCaseName = (value: string) => {
  const lower = value.toLocaleLowerCase("fr-FR");
  return lower.replace(/(^|[\s’'-])\p{L}/gu, match => match.toLocaleUpperCase("fr-FR"));
};

/** Nom d'affichage court des utilisateurs CRM.
 * Convention DB: le premier élément est le nom de famille;
 * l'affichage métier présente d'abord le(s) prénom(s), puis le nom.
 * Exemple: KOFFI INOCENT → Inocent Koffi.
 */
export function formatUserShortName(fullName?: string | null): string {
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "Utilisateur";
  if (parts.length === 1) return displayCaseName(parts[0]);
  return parts.slice(1).map(displayCaseName).join(" ") + " " + displayCaseName(parts[0]);
}

/** Affichage détaillé du profil: tous les prénoms, puis le nom de famille. */
export function formatUserProfileName(fullName?: string | null): string {
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "Utilisateur";
  if (parts.length === 1) return displayCaseName(parts[0]);
  return parts.slice(1).map(displayCaseName).join(" ") + ", " + displayCaseName(parts[0]);
}