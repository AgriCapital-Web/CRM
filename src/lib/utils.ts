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


/** Nom de communication pour les répertoires mixtes : les leads/prospects stockent PRENOMS NOM,
 * les profils internes/clients stockent généralement NOM puis prénoms. */
export function formatRecipientName(fullName?: string | null, sourceType?: string | null): string {
  const parts = String(fullName || "").trim().split(/\\s+/).filter(Boolean);
  if (parts.length < 2) return parts.length ? displayCaseName(parts[0]) : "Contact";
  if (sourceType === "lead" || sourceType === "prospect") {
    const surname = parts[parts.length - 1].toLocaleUpperCase("fr-FR");
    const givenName = displayCaseName(parts[parts.length - 2]);
    return givenName + " " + surname;
  }
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


type NormalizableTextField = HTMLInputElement | HTMLTextAreaElement;

const stripTextAccents = (value: string): string =>
  value.normalize("NFD").replace(/[\\u0300-\\u036f]/g, "");

const getTextFieldContext = (field: NormalizableTextField): string => {
  const labels = field.labels ? Array.from(field.labels).map(label => label.textContent || "").join(" ") : "";
  return [
    field.name,
    field.id,
    field.getAttribute("aria-label"),
    field.getAttribute("placeholder"),
    field.getAttribute("data-field"),
    field.getAttribute("autocomplete"),
    labels,
  ].filter(Boolean).join(" ").replace(/([a-z])([A-Z])/g, "$1 $2").toLocaleLowerCase("fr-FR");
};

/**
 * Normalisation globale des champs texte du CRM :
 * - identité et localisations : MAJUSCULES sans accents ;
 * - autres textes : première lettre en majuscule, sans accents ;
 * - champs techniques : inchangés.
 */
export function normalizeCrmTextField(field: NormalizableTextField): string {
  const raw = field.value;
  const context = getTextFieldContext(field);
  const type = field instanceof HTMLInputElement ? field.type.toLowerCase() : "textarea";

  if (field instanceof HTMLInputElement && [
    "email", "password", "tel", "number", "url", "search", "date", "datetime-local",
    "month", "week", "time", "color", "file", "range", "checkbox", "radio", "hidden",
  ].includes(type)) return raw;

  if (/(^|[^a-z])(email|e-mail|telephone|téléphone|phone|whatsapp|password|mot de passe|otp|pin|code|identifiant|username|login|url|lien|slug|token|matricule|reference|référence|iban|compte bancaire|numero de compte|numéro de compte)([^a-z]|$)/i.test(context)) {
    return raw;
  }

  const text = stripTextAccents(raw);
  const identityField = /(^|[^a-z])(nom|prenom|prénom|noms|prenoms|prénoms|firstname|lastname|given name|family name|surname|full name|nom complet|nom de famille|raison sociale|entreprise|societe|société)([^a-z]|$)/i.test(context);
  const locationField = /(^|[^a-z])(localite|localité|village|residence|résidence|lieu|localisation|locality|location|ville|commune|quartier|pays|region|région|departement|département|province|zone|adresse|address|site)([^a-z]|$)/i.test(context);

  if (identityField || locationField) return text.toLocaleUpperCase("fr-FR");
  return text.replace(/\\p{L}/u, letter => letter.toLocaleUpperCase("fr-FR"));
}

/** Installe une normalisation à la capture pour couvrir les formulaires de toutes les pages. */
export function installGlobalTextNormalization(): void {
  if (typeof document === "undefined" || document.documentElement.dataset.crmTextNormalization === "active") return;
  document.documentElement.dataset.crmTextNormalization = "active";

  const normalizeEventTarget = (event: Event) => {
    if (event.type === "input" && (event as InputEvent).isComposing) return;
    const field = event.target;
    if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) return;
    const start = field.selectionStart;
    const end = field.selectionEnd;
    const before = field.value;
    const after = normalizeCrmTextField(field);
    if (before === after) return;

    const normalizedPrefixLength = start === null ? null : normalizeCrmTextField({
      ...({} as HTMLInputElement),
      value: before.slice(0, start),
      name: field.name,
      id: field.id,
      type: field instanceof HTMLInputElement ? field.type : "text",
      getAttribute: field.getAttribute.bind(field),
      labels: field.labels,
    } as NormalizableTextField).length;

    field.value = after;
    if (start !== null && end !== null) {
      const nextStart = Math.min(normalizedPrefixLength ?? start, after.length);
      const prefixEnd = normalizeCrmTextField(Object.assign(Object.create(Object.getPrototypeOf(field)), field, { value: before.slice(0, end) })).length;
      try { field.setSelectionRange(nextStart, Math.min(prefixEnd, after.length)); } catch { /* Certains champs n'exposent pas de curseur. */ }
    }
  };

  document.addEventListener("input", normalizeEventTarget, true);
  document.addEventListener("change", normalizeEventTarget, true);
  document.addEventListener("compositionend", normalizeEventTarget, true);
  document.addEventListener("blur", normalizeEventTarget, true);
}
