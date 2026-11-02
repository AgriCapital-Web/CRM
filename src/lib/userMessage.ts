import { getSafeErrorMessage } from "./safeError";

/**
 * Filtre global : tout texte affiché à l'utilisateur (notifications) est
 * débarrassé des détails techniques internes (SQL, RLS, codes, stack…).
 */
const TECHNICAL = /(row-level security|violates|constraint|PGRST\d+|relation ["'\w.]+ does not exist|column ["'\w.]+|schema cache|syntax error|duplicate key|null value in column|permission denied|JWT|TypeError|ReferenceError|SyntaxError|Failed to fetch|NetworkError|Edge Function|non-2xx|status code|\bSQL\b|function [\w.]+\(|undefined|\bnull\b|\[object Object\]|\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b|\bat [\w.<>]+ \(|stack|42501|23505|23503|23502|23514|22P02|42703|42P01|migration|\bRPC\b|\brpc\b|payload|token)/i;

export function isTechnicalText(text: string): boolean {
  return TECHNICAL.test(text);
}

export function toUserText(input: unknown): unknown {
  if (typeof input !== "string" || !input) return input;
  if (!isTechnicalText(input)) return input;
  const friendly = getSafeErrorMessage({ message: input }, "L'opération n'a pas pu aboutir. Réessayez ; si le problème continue, prévenez l'administrateur.");
  // Conserver un préfixe métier lisible (« Création impossible : … »)
  const sep = input.search(/\s[:—-]\s/);
  if (sep > 0 && sep < 70) {
    const prefix = input.slice(0, sep).trim();
    if (!isTechnicalText(prefix)) return `${prefix}. ${friendly}`;
  }
  return friendly;
}
