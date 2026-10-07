/**
 * Résolution de conflits pour les écritures hors ligne.
 * Stratégie : merge par champ avec arbitrage "last-write-wins" sur updated_at.
 * - Si l'enregistrement serveur a été modifié APRÈS l'opération locale,
 *   seuls les champs non touchés côté serveur sont appliqués (merge par champ).
 * - Sinon, l'opération locale est appliquée telle quelle.
 */
import { supabase } from '@/integrations/supabase/client';

export interface ConflictResult {
  payload: Record<string, any>;
  conflicted: boolean;
  skipped: boolean;
  serverUpdatedAt?: string | null;
}

export async function resolveUpdateConflict(
  table: string,
  recordId: string,
  localData: Record<string, any>,
  localTimestamp: number,
): Promise<ConflictResult> {
  let server: any = null;
  try {
    const { data } = await (supabase as any).from(table).select('*').eq('id', recordId).maybeSingle();
    server = data;
  } catch {
    return { payload: localData, conflicted: false, skipped: false };
  }

  // L'enregistrement n'existe plus côté serveur → on ignore l'update
  if (!server) return { payload: localData, conflicted: true, skipped: true };

  const serverUpdatedAt = server.updated_at ? new Date(server.updated_at).getTime() : 0;
  const payload: Record<string, any> = {};

  for (const [key, value] of Object.entries(localData)) {
    if (key.startsWith('_') || key === 'id' || key === 'created_at') continue;
    payload[key] = value;
  }

  if (serverUpdatedAt <= localTimestamp) {
    // Modification locale plus récente → last-write-wins local
    return { payload, conflicted: false, skipped: false, serverUpdatedAt: server.updated_at };
  }

  // Le serveur est plus récent : merge par champ, on ne remplace que
  // les champs dont la valeur locale diffère ET que le serveur n'a pas déjà renseignés autrement.
  const merged: Record<string, any> = {};
  for (const [key, value] of Object.entries(payload)) {
    const serverValue = server[key];
    if (serverValue === null || serverValue === undefined || serverValue === '') {
      merged[key] = value; // champ vide côté serveur → la valeur terrain gagne
    } else if (JSON.stringify(serverValue) === JSON.stringify(value)) {
      // identique, rien à faire
    }
    // sinon : le serveur (plus récent) est conservé
  }

  return {
    payload: merged,
    conflicted: true,
    skipped: Object.keys(merged).length === 0,
    serverUpdatedAt: server.updated_at,
  };
}