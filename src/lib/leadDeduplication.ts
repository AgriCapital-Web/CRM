import { supabase } from "@/integrations/supabase/client";

export const normalizeContactPhone = (value: unknown) => {
  let digits = String(value ?? "").trim().replace(/\\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("225") && digits.length === 13) digits = digits.slice(3);
  return digits;
};

export const normalizeContactName = (value: unknown) =>
  String(value ?? "").normalize("NFD").replace(/[\\u0300-\\u036f]/g, "")
    .toLocaleLowerCase("fr").replace(/[^a-z0-9]+/g, " ").trim().replace(/\\s+/g, " ");

export const normalizeContactEmail = (value: unknown) =>
  String(value ?? "").trim().toLocaleLowerCase("en-US");

export const hasSameCrmContact = (candidate: Record<string, any>, existing: Record<string, any>) => {
  const phones = (row: Record<string, any>) => [
    row.telephone, row.telephone_secondaire, row.whatsapp,
  ].map(normalizeContactPhone).filter((phone) => phone.length >= 8);
  const emails = (row: Record<string, any>) => [normalizeContactEmail(row.email)].filter((email) => email.includes("@"));
  const candidatePhones = new Set(phones(candidate));
  const candidateEmails = new Set(emails(candidate));
  if (phones(existing).some((phone) => candidatePhones.has(phone))) return true;
  if (emails(existing).some((email) => candidateEmails.has(email))) return true;
  const fullName = (row: Record<string, any>) => normalizeContactName([row.prenoms, row.nom].filter(Boolean).join(" "));
  const name = fullName(candidate);
  return Boolean(name && name === fullName(existing) &&
    (candidatePhones.size > 0 || candidateEmails.size > 0) &&
    (phones(existing).length > 0 || emails(existing).length > 0) &&
    (phones(existing).some((phone) => candidatePhones.has(phone)) ||
      emails(existing).some((email) => candidateEmails.has(email)));
};

/** Checks the authoritative online CRM tables before an insert. Database triggers provide the concurrency-safe final guard. */
export async function findExistingCrmContact(candidate: Record<string, any>, excludeId?: string) {
  for (const table of ["leads", "prospects"] as const) {
    const { data, error } = await (supabase as any).from(table)
      .select("id,nom,prenoms,telephone,telephone_secondaire,whatsapp,email");
    if (error) throw error;
    const match = (data || []).find((row: any) =>
      String(row.id) !== String(excludeId || "") && hasSameCrmContact(candidate, row));
    if (match) return { table, record: match };
  }
  return null;
}
