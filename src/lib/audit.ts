import { supabase } from "@/integrations/supabase/client";

export type AuditStatut = "succes" | "echec";

export interface AuditEntry {
  action: string;
  entite: string;
  entite_id?: string | null;
  cible_user_id?: string | null;
  cible_libelle?: string | null;
  ancienne_valeur?: unknown;
  nouvelle_valeur?: unknown;
  statut?: AuditStatut;
  details?: string | null;
}

/**
 * Journalise une action administrative sensible.
 * Écrit dans `admin_audit_logs` (créée par la migration) et retombe sur
 * `historique_activites` tant que la migration n'est pas exécutée.
 */
export async function logAdminAction(entry: AuditEntry): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  const acteur = userData?.user?.id ?? null;

  const payload = {
    acteur_user_id: acteur,
    cible_user_id: entry.cible_user_id ?? null,
    cible_libelle: entry.cible_libelle ?? null,
    action: entry.action,
    entite: entry.entite,
    entite_id: entry.entite_id ?? null,
    ancienne_valeur: entry.ancienne_valeur ?? null,
    nouvelle_valeur: entry.nouvelle_valeur ?? null,
    statut: entry.statut ?? "succes",
    details: entry.details ?? null,
    user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 300) : null,
  };

  const { error } = await (supabase as any).from("admin_audit_logs").insert(payload);
  if (!error) return;

  await (supabase as any).from("historique_activites").insert({
    user_id: acteur,
    table_name: entry.entite,
    record_id: entry.entite_id ?? null,
    action: entry.action,
    details: entry.details ?? `${entry.action} — ${entry.cible_libelle ?? entry.entite_id ?? ""}`,
    ancien_valeurs: entry.ancienne_valeur ?? null,
    nouvelles_valeurs: entry.nouvelle_valeur ?? null,
  });
}
