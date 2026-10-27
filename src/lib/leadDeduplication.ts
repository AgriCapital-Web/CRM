import { supabase } from "@/integrations/supabase/client";

export const normalizeContactPhone = (value: unknown) => {
  let digits = String(value ?? "").trim().replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("225") && digits.length === 13) digits = digits.slice(3);
  return digits;
};

export const normalizeContactName = (value: unknown) =>
  String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");

export const normalizeContactEmail = (value: unknown) =>
  String(value ?? "").trim().toLocaleLowerCase("en-US");

export const hasSameCrmContact = (candidate: Record<string, any>, existing: Record<string, any>) => {
  const phones = (row: Record<string, any>) => [
    row.telephone, row.telephone_secondaire, row.whatsapp,
  ].map(normalizeContactPhone).filter((phone) => phone.length >= 8);
  const emails = (row: Record<string, any>) => [normalizeContactEmail(row.email)].filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
  const name = (row: Record<string, any>) => normalizeContactName(
    row.denomination_sociale || row.nom_complet ||
    [row.prenoms, row.nom].filter(Boolean).join(" ") || row.nom_famille
  );
  const candidateName = name(candidate);
  const existingName = name(existing);
  // Une coordonnée partagée (téléphone familial, adresse d’organisation)
  // ne suffit jamais à déclarer deux dossiers identiques si les noms diffèrent.
  if (candidateName && existingName && candidateName !== existingName) return false;
  const candidatePhones = new Set(phones(candidate));
  const candidateEmails = new Set(emails(candidate));
  const sameContact = phones(existing).some((phone) => candidatePhones.has(phone)) ||
    emails(existing).some((email) => candidateEmails.has(email));
  return sameContact && (!candidateName || !existingName || candidateName === existingName);
};

/** Checks the authoritative online CRM tables; DB triggers are the final guard against concurrent writes. */
export async function findExistingCrmContact(
  candidate: Record<string, any>,
  excludeId?: string,
  targetTable?: "leads" | "prospects" | "clients" | "proprietaires_terres",
) {
  // La déduplication interdit un doublon dans le même module, mais autorise
  // le rattachement transversal (lead direct -> prospect/client/propriétaire).
  const tables = targetTable ? [targetTable] : ["leads", "prospects", "clients", "proprietaires_terres"] as const;
  for (const table of tables) {
    let offset = 0;
    const pageSize = 1000;
    while (true) {
      const { data, error } = await (supabase as any).from(table)
        .select("id,nom,prenoms,nom_complet,nom_famille,telephone,telephone_secondaire,whatsapp,email")
        .range(offset, offset + pageSize - 1);
      if (error) throw error;
      const match = (data || []).find((row: any) =>
        String(row.id) !== String(excludeId || "") && hasSameCrmContact(candidate, row));
      if (match) return { table, record: match };
      if (!data || data.length < pageSize) break;
      offset += pageSize;
    }
  }
  return null;
}
