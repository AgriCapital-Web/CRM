/**
 * Maps raw database / API errors to safe, generic user-facing messages.
 * Full error details stay in the console (dev tools) / server logs only.
 */

const CODE_MESSAGES: Record<string, string> = {
  '23505': 'Cet enregistrement existe déjà.',
  '23503': 'Référence invalide : un élément lié est introuvable.',
  '23502': 'Un champ obligatoire est manquant.',
  '23514': 'Les données saisies ne respectent pas les règles de validation.',
  '22P02': 'Format de donnée invalide.',
  '42501': "Vous n'avez pas les droits nécessaires pour cette action.",
  'PGRST301': "Vous n'avez pas les droits nécessaires pour cette action.",
};

const SAFE_PASSTHROUGH = [
  'Invalid login credentials',
  'Email not confirmed',
  'User already registered',
];

export function getSafeErrorMessage(
  error: unknown,
  fallback = "Une erreur s'est produite. Veuillez réessayer.",
): string {
  if (!error) return fallback;

  const err = error as { code?: string; message?: string; status?: number };

  // Never leak DB internals — log them instead
  console.error('[error]', error);

  if (err.code && CODE_MESSAGES[err.code]) return CODE_MESSAGES[err.code];

  const message = typeof err.message === 'string' ? err.message : '';

  if (SAFE_PASSTHROUGH.some((m) => message.includes(m))) {
    return message === 'Invalid login credentials' ? 'Identifiants incorrects' : message;
  }

  if (/row-level security|permission denied/i.test(message)) {
    return "Vous n'avez pas les droits nécessaires pour cette action.";
  }
  if (/duplicate key|already exists/i.test(message)) {
    return 'Cet enregistrement existe déjà.';
  }
  if (/network|fetch|timeout/i.test(message)) {
    return 'Problème de connexion réseau. Veuillez réessayer.';
  }

  return fallback;
}
