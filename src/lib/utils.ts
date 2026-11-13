import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function normalizeSearchText(value?: unknown): string {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr-FR").trim();
}

export function matchesAccentInsensitive(value: unknown, query: unknown): boolean {
  const needle = normalizeSearchText(query);
  return !needle || normalizeSearchText(value).includes(needle);
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const displayCaseName = (value: string) => {
  const lower = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr-FR");
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


/** Nom de communication pour les répertoires mixtes : les leads/prospects stockent PRENOMS NOM,
 * les profils internes/clients stockent généralement NOM puis prénoms. */
export function formatRecipientName(fullName?: string | null, sourceType?: string | null): string {
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts.length ? displayCaseName(parts[0]) : "Contact";
  if (sourceType === "lead" || sourceType === "prospect") {
    const surname = parts[parts.length - 1].normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleUpperCase("fr-FR");
    const givenName = displayCaseName(parts[parts.length - 2]);
    return givenName + " " + surname;
  }
  return displayCaseName(parts[parts.length - 1]) + " " + parts[0].normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleUpperCase("fr-FR");
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


type NormalizableTextField = HTMLInputElement | HTMLTextAreaElement;
type CrmTextNormalizationMode = "none" | "uppercase" | "sentence";

const stripTextAccents = (value: string): string =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const getTextFieldContext = (field: NormalizableTextField): string => {
  const labels = field.labels ? Array.from(field.labels).map(label => label.textContent || "").join(" ") : "";
  return stripTextAccents([
    field.name,
    field.id,
    field.getAttribute("aria-label"),
    field.getAttribute("placeholder"),
    field.getAttribute("data-field"),
    labels,
  ].filter(Boolean).join(" ").replace(/([a-z])([A-Z])/g, "$1 $2")).toLocaleLowerCase("fr-FR");
};

const getCrmTextNormalizationMode = (field: NormalizableTextField): CrmTextNormalizationMode => {
  const context = getTextFieldContext(field);
  const type = field instanceof HTMLInputElement ? field.type.toLowerCase() : "textarea";

  if (field instanceof HTMLInputElement && [
    "email", "password", "tel", "number", "url", "search", "date", "datetime-local",
    "month", "week", "time", "color", "file", "range", "checkbox", "radio", "hidden",
  ].includes(type)) return "none";

  if (/(^|[^a-z])(email|e-mail|telephone|phone|whatsapp|password|otp|pin|code|identifiant|username|login|url|lien|slug|token|matricule|reference|iban|compte bancaire|numero de compte)([^a-z]|$)/i.test(context)) {
    return "none";
  }

  if (/(^|[^a-z])(nom|prenom|noms|prenoms|name|first name|last name|firstname|lastname|given name|family name|surname|sur name|full name|nom complet|nom de famille|raison sociale|entreprise|societe)([^a-z]|$)/i.test(context)) {
    return "uppercase";
  }

  if (/(^|[^a-z])(localite|village|residence|lieu|localisation|locality|location|ville|commune|quartier|pays|region|departement|province|zone|adresse|address|site)([^a-z]|$)/i.test(context)) {
    return "uppercase";
  }

  return "sentence";
};

const normalizeCrmTextValue = (value: string, mode: CrmTextNormalizationMode): string => {
  if (mode === "none") return value;
  const text = stripTextAccents(value);
  if (mode === "uppercase") return text.toLocaleUpperCase("fr-FR");
  return text.replace(/\p{L}/u, letter => letter.toLocaleUpperCase("fr-FR"));
};

/** Normalise une valeur de champ selon sa nature (identité, localité ou texte courant). */
export function normalizeCrmTextField(field: NormalizableTextField): string {
  return normalizeCrmTextValue(field.value, getCrmTextNormalizationMode(field));
}

/** Installe une normalisation à la capture pour couvrir les formulaires de toutes les pages. */
export function installGlobalTextNormalization(): void {
  if (typeof document === "undefined" || document.documentElement.dataset.crmTextNormalization === "active") return;
  document.documentElement.dataset.crmTextNormalization = "active";

  const normalizeEventTarget = (event: Event) => {
    if (event.type === "input" && (event as InputEvent).isComposing) return;
    const field = event.target;
    if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) return;

    const mode = getCrmTextNormalizationMode(field);
    if (mode === "none") return;

    const before = field.value;
    const after = normalizeCrmTextValue(before, mode);
    if (before === after) return;

    const start = field.selectionStart;
    const end = field.selectionEnd;
    const nextStart = start === null ? null : normalizeCrmTextValue(before.slice(0, start), mode).length;
    const nextEnd = end === null ? null : normalizeCrmTextValue(before.slice(0, end), mode).length;

    const valueSetter = Object.getOwnPropertyDescriptor(
      field instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype,
      "value",
    )?.set;
    if (valueSetter) valueSetter.call(field, after);
    else field.value = after;
    if (nextStart !== null && nextEnd !== null) {
      try { field.setSelectionRange(Math.min(nextStart, after.length), Math.min(nextEnd, after.length)); }
      catch { /* Certains champs ne prennent pas en charge la sélection du curseur. */ }
    }
  };

  document.addEventListener("input", normalizeEventTarget, true);
  document.addEventListener("change", normalizeEventTarget, true);
  document.addEventListener("compositionend", normalizeEventTarget, true);
  document.addEventListener("blur", normalizeEventTarget, true);
}
