import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function normalizeSearchText(value?: unknown): string {
  return String(value ?? "").normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").toLocaleLowerCase("fr-FR").trim();
}

export function matchesAccentInsensitive(value: unknown, query: unknown): boolean {
  const needle = normalizeSearchText(query);
  return !needle || normalizeSearchText(value).includes(needle);
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const displayCaseName = (value: string) => {
  const lower = value.toLocaleLowerCase("fr-FR");
  return lower.replace(/(^|[\s’'-])\p{L}/gu, match => match.toLocaleUpperCase("fr-FR"));
};

/** Nom court pour les communications : dernier prénom usuel puis nom de famille.
 * Convention CRM : NOM en premier, puis les prénoms. Exemple : KONAN AMENAN LARISSA → Larissa KONAN.
 */
export function formatUserShortName(fullName?: string | null): string {
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "Utilisateur";
  if (parts.length === 1) return displayCaseName(parts[0]);
  return displayCaseName(parts[parts.length - 1]) + " " + parts[0].toLocaleUpperCase("fr-FR");
}

/** Bandeau de bienvenue: dernier prénom puis NOM en majuscules (ex: KONAN ADJOUA LARRISSA → Larrissa KONAN). */
export function formatWelcomeName(fullName?: string | null): string {
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "Utilisateur";
  if (parts.length === 1) return parts[0].toLocaleUpperCase("fr-FR");
  return displayCaseName(parts[parts.length - 1]) + " " + parts[0].toLocaleUpperCase("fr-FR");
}

/** Nom utilisé dans les communications et les affichages courts. */
export function formatUserProfileName(fullName?: string | null): string {
  return formatUserShortName(fullName);
}
