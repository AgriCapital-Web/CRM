/**
 * Server-authoritative writes for AgriCapital CRM.
 * IndexedDB may not be used as a source of truth or as a deferred business-write queue.
 * Unsaved form drafts may live in component memory; confirmed records must be persisted by Supabase.
 */
import { supabase } from '@/integrations/supabase/client';

function offlineError() {
  return new Error("Enregistrement impossible sans connexion au serveur. Rétablissez la connexion puis réessayez. Aucune donnée métier n’a été enregistrée localement.");
}

function isOnline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine;
}

function unavailable<T>(data: T | null = null) {
  return { data, error: offlineError(), offline: true };
}

export async function offlineInsert(table: string, values: any): Promise<{ data: any | null; error: any | null; offline: boolean }> {
  if (!isOnline()) return unavailable();
  const { data, error } = await (supabase as any).from(table).insert(values).select().maybeSingle();
  if (error) return { data: null, error, offline: false };
  if (!data) return { data: null, error: new Error("Le serveur n’a retourné aucun enregistrement après l’insertion."), offline: false };
  return { data, error: null, offline: false };
}

/** Upserts are confirmed only after the database returns the persisted record. */
export async function offlineUpsert(table: string, values: any): Promise<{ data: any | null; error: any | null; offline: boolean }> {
  if (!isOnline()) return unavailable();
  const { data, error } = await (supabase as any).from(table).upsert(values, { onConflict: 'id' }).select().maybeSingle();
  if (error) return { data: null, error, offline: false };
  if (!data) return { data: null, error: new Error("Le serveur n’a retourné aucun enregistrement après l’enregistrement."), offline: false };
  return { data, error: null, offline: false };
}

export async function offlineUpdate(table: string, id: string, values: any): Promise<{ error: any | null; offline: boolean }> {
  if (!isOnline()) return { error: offlineError(), offline: true };
  const { data, error } = await (supabase as any).from(table).update(values).eq('id', id).select('id').maybeSingle();
  if (error) return { error, offline: false };
  if (!data) return {
    error: new Error("Aucun enregistrement n’a été modifié. Vérifiez que le dossier existe et que vos droits permettent sa modification."),
    offline: false,
  };
  return { error: null, offline: false };
}

export async function offlineDelete(table: string, id: string): Promise<{ error: any | null; offline: boolean }> {
  if (!isOnline()) return { error: offlineError(), offline: true };
  const { data, error } = await (supabase as any).from(table).delete().eq('id', id).select('id').maybeSingle();
  if (error) return { error, offline: false };
  if (!data) return { error: new Error("Aucun enregistrement n’a été supprimé. Vérifiez son existence et vos droits."), offline: false };
  return { error: null, offline: false };
}
