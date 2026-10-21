/**
 * Generic offline-first write helpers.
 * When online: performs the Supabase mutation directly and updates local cache.
 * When offline: generates a temporary UUID (for inserts), updates local cache,
 * and queues the mutation to be replayed on reconnection.
 */
import { supabase } from '@/integrations/supabase/client';
import {
  STORES, addToSyncQueue, persistQueuedMutation, putItem, deleteItem, getItem, getAllItems,
} from '@/lib/offlineDb';

const TABLE_TO_STORE: Record<string, string> = {
  clients: STORES.CLIENTS,
  plantations: STORES.PLANTATIONS,
  paiements: STORES.PAIEMENTS,
  leads: STORES.LEADS,
  prospects: STORES.PROSPECTS,
  lead_relances: STORES.LEAD_RELANCES,
  proprietaires_terres: STORES.PROPRIETAIRES_TERRES,
  parcelles: STORES.PARCELLES,
  cartes_personnel: STORES.CARTES_PERSONNEL,
  rapports_visites_techniques: STORES.RAPPORTS_VISITES,
  rapports_visites_medias: STORES.RAPPORTS_MEDIAS,
  interventions_techniques: STORES.INTERVENTIONS_TECHNIQUES,
  tickets_techniques: STORES.TICKETS_TECHNIQUES,
  acquisitions: STORES.ACQUISITIONS,
  conventions_foncieres: STORES.CONVENTIONS_FONCIERES,
  lots_hectares: STORES.LOTS_HECTARES,
  portail_messages: STORES.PORTAIL_MESSAGES,
  documents_acquisition: STORES.DOCUMENTS_ACQUISITION,
  documents_convention: STORES.DOCUMENTS_CONVENTION,
  client_cotitulaires_mandataires: STORES.CLIENT_COTITULAIRES_MANDATAIRES,
  commissions: STORES.COMMISSIONS,
  finance_transactions: STORES.FINANCE_TRANSACTIONS,
  finance_expenses: STORES.FINANCE_EXPENSES,
  finance_associates: STORES.FINANCE_ASSOCIATES,
  finance_salary_profiles: STORES.FINANCE_SALARY_PROFILES,
  finance_payroll_runs: STORES.FINANCE_PAYROLL_RUNS,
  finance_payroll_items: STORES.FINANCE_PAYROLL_ITEMS,
  portefeuilles: STORES.PORTEFEUILLES,
  portefeuille_versements: STORES.PORTEFEUILLE_VERSEMENTS,
  portefeuille_versement_lignes: STORES.PORTEFEUILLE_VERSEMENT_LIGNES,
  beneficiaire_attributions: STORES.BENEFICIAIRE_ATTRIBUTIONS,
  acquisitions_brouillon: STORES.ACQUISITIONS_BROUILLON,
  offre_formulaire_etapes: STORES.OFFRE_FORM_ETAPES,
  offre_formulaire_documents: STORES.OFFRE_FORM_DOCUMENTS,
  offre_formulaire_contrats: STORES.OFFRE_FORM_CONTRATS,
  offres: STORES.OFFRES,
  profiles: STORES.PROFILES,
  user_roles: STORES.USER_ROLES,
  role_permissions: STORES.ROLE_PERMISSIONS,
  departements_entreprise: STORES.DEPARTEMENTS_ENTREPRISE,
};

function isNetworkError(error: any): boolean {
  const message = String(error?.message || error || '').toLowerCase();
  return !navigator.onLine || /failed to fetch|network|fetch failed|connection|timeout|offline|load failed/.test(message);
}

function genUuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return (crypto as any).randomUUID();
  return 'off-' + Date.now() + '-' + Math.random().toString(16).slice(2);
}

export async function offlineInsert(table: string, values: any): Promise<{ data: any | null; error: any | null; offline: boolean }> {
  const store = TABLE_TO_STORE[table];
  if (navigator.onLine) {
    const { data, error } = await (supabase as any).from(table).insert(values).select().maybeSingle();
    if (!error && data && store) {
      try { await putItem(store, data); } catch (cacheError) { console.error("[OfflineWrite] Server saved, local cache refresh failed", cacheError); }
    }
    if (!error && !data) return { data: null, error: new Error("Le serveur n’a retourné aucun enregistrement après l’insertion."), offline: false };
    if (!error || !isNetworkError(error)) return { data, error, offline: false };
    // Le réseau était disponible au moment du test mais la requête a échoué :
    // basculer en file locale plutôt que perdre la saisie terrain.
    if (store) {
      const tempId = values?.id || genUuid();
      const record = { ...values, id: tempId, _offline: true, _pending: 'insert', created_at: values?.created_at || new Date().toISOString(), updated_at: new Date().toISOString() };
      await persistQueuedMutation({
        table, operation: 'insert', record_id: tempId, data: { ...values, id: tempId },
        timestamp: Date.now(), storeName: store, record,
      });
      return { data: record, error: null, offline: true };
    }
    return { data: null, error, offline: false };
  }
  // Offline path
  const tempId = values?.id || genUuid();
  const record = {
    ...values,
    id: tempId,
    _offline: true,
    _pending: 'insert',
    created_at: values?.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  // Refuser une confirmation hors ligne si aucune file locale ne peut garantir
  // la reprise ultérieure de la mutation.
  if (!store) return { data: null, error: new Error(`Le formulaire ${table} n’est pas encore compatible avec l’enregistrement hors ligne sécurisé.`), offline: true };
  // Enregistrer dossier et synchronisation dans une seule transaction durable.
  const serverPayload = { ...values, id: tempId };
  await persistQueuedMutation({
    table, operation: 'insert', record_id: tempId, data: serverPayload,
    timestamp: Date.now(), storeName: store, record,
  });
  return { data: record, error: null, offline: true };
}

/**
 * Idempotent write for multi-step submissions. Replaying the same UUID must
 * update the existing row instead of creating a duplicate after a timeout.
 */
export async function offlineUpsert(table: string, values: any): Promise<{ data: any | null; error: any | null; offline: boolean }> {
  const store = TABLE_TO_STORE[table];
  const id = values?.id || genUuid();
  const record = { ...values, id };
  if (navigator.onLine) {
    const { data, error } = await (supabase as any).from(table).upsert(record, { onConflict: 'id' }).select().maybeSingle();
    if (!error && data && store) {
      try { await putItem(store, data); } catch (cacheError) { console.error("[OfflineWrite] Upsert succeeded, local cache refresh failed", cacheError); }
    }
    if (!error && !data) return { data: null, error: new Error("Le serveur n’a retourné aucun enregistrement après l’enregistrement."), offline: false };
    if (!error || !isNetworkError(error)) return { data, error, offline: false };
  }
  if (!store) return { data: null, error: new Error(`Le formulaire ${table} n’est pas compatible avec l’enregistrement hors ligne sécurisé.`), offline: !navigator.onLine };
  const queuedRecord = { ...record, _offline: true, _pending: 'insert', created_at: record.created_at || new Date().toISOString(), updated_at: new Date().toISOString() };
  await persistQueuedMutation({
    table, operation: 'insert', record_id: id, data: record,
    timestamp: Date.now(), storeName: store, record: queuedRecord,
  });
  return { data: queuedRecord, error: null, offline: true };
}

export async function offlineUpdate(table: string, id: string, values: any): Promise<{ error: any | null; offline: boolean }> {
  const store = TABLE_TO_STORE[table];
  // A record created offline may be edited before its INSERT reaches the server.
  // Merge into the pending INSERT so the later edits cannot be silently lost.
  const queued = await getAllItems(STORES.SYNC_QUEUE) as any[];
  const pendingInsert = queued.find((op) =>
    op.table === table && op.operation === "insert" && op.record_id === id &&
    ["pending", "error", "syncing"].includes(op.status)
  );
  if (pendingInsert) {
    const existing = store ? await getItem(store, id) : null;
    const mergedData = { ...(pendingInsert.data || {}), ...values, id };
    await persistQueuedMutation({
      table, operation: "insert", record_id: id, data: mergedData,
      timestamp: Math.min(Number(pendingInsert.timestamp) || Date.now(), Date.now()),
      storeName: store, queueId: pendingInsert.id,
      record: store ? { ...(existing || { id }), ...values, _offline: true, _pending: "insert", updated_at: new Date().toISOString() } : undefined,
    });
    return { error: null, offline: true };
  }

  if (navigator.onLine) {
    const { data, error } = await (supabase as any).from(table).update(values).eq('id', id).select('id').maybeSingle();
    if (!error && !data) return {
      error: new Error("Aucun enregistrement n’a été modifié. Vérifiez que le dossier existe et que vos droits permettent sa modification."),
      offline: false,
    };
    if (!error && store) {
      try {
        const existing = await getItem(store, id);
        await putItem(store, { ...(existing || { id }), ...values, updated_at: new Date().toISOString() });
      } catch (cacheError) { console.error("[OfflineWrite] Server updated, local cache refresh failed", cacheError); }
    }
    if (!error || !isNetworkError(error)) return { error, offline: false };
  }
  if (!store) return { error: new Error(`Le formulaire ${table} n’est pas compatible avec la modification hors ligne sécurisée.`), offline: true };
  const existing = await getItem(store, id);
  await persistQueuedMutation({
    table, operation: 'update', record_id: id, data: values, timestamp: Date.now(),
    storeName: store,
    record: { ...(existing || { id }), ...values, _offline: true, _pending: 'update', updated_at: new Date().toISOString() },
  });
  return { error: null, offline: true };
}

export async function offlineDelete(table: string, id: string): Promise<{ error: any | null; offline: boolean }> {
  const store = TABLE_TO_STORE[table];
  if (navigator.onLine) {
    const { error } = await (supabase as any).from(table).delete().eq('id', id);
    if (!error && store) { try { await deleteItem(store, id); } catch { /* best effort local cache */ } }
    if (!error || !isNetworkError(error)) return { error, offline: false };
  }
  await persistQueuedMutation({
    table, operation: 'delete', record_id: id, data: {}, timestamp: Date.now(), storeName: store,
  });
  return { error: null, offline: true };
}
