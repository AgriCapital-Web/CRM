/**
 * Centralise les erreurs API/base de données en messages actionnables.
 * Les détails techniques restent journalisés pour le diagnostic.
 */

const CODE_MESSAGES: Record<string, string> = {
  '23505': 'Cet enregistrement existe déjà.',
  '23503': 'Une information liée est introuvable. Vérifiez les éléments sélectionnés.',
  '23502': 'Un champ obligatoire est manquant.',
  '23514': 'Les données saisies ne respectent pas une règle de validation.',
  '22P02': 'Le format de l’une des valeurs saisies est invalide.',
  '42501': "Vous n'avez pas les droits nécessaires pour cette action.",
  'PGRST301': "Votre session n’est plus valide. Reconnectez-vous puis réessayez.",
  'PGRST200': 'Une relation entre les données est momentanément indisponible. Actualisez la page puis réessayez.',
  'PGRST202': 'Cette opération n’est pas encore disponible. Actualisez la page puis réessayez.',
  'PGRST204': 'Un champ envoyé par ce formulaire n’est pas reconnu par le serveur. Actualisez la page ; si le problème persiste, signalez-le à l’administrateur.',
  'PGRST205': 'Cette fonctionnalité n’est pas disponible côté serveur. Actualisez la page ; si le problème persiste, signalez-le à l’administrateur.',
  '42703': 'Un champ attendu par cette opération est indisponible. Actualisez la page puis réessayez.',
  '42P01': 'Cette fonctionnalité est momentanément indisponible. Signalez-le à l’administrateur.',
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

  const err = error as { code?: string; message?: string; details?: string; hint?: string; status?: number };
  console.error('[AgriCapital][operation-error]', error);

  if (err.code === '23514') {
    const detail = String(err.details || err.hint || '');
    const constraint = detail.match(/constraint ["']([^"']+)["']/i)?.[1]
      || detail.match(/violates check constraint ["']([^"']+)["']/i)?.[1];
    if (constraint) {
      const readable = constraint.replace(/^(leads?|clients?)_?/i, '').replace(/_check$/i, '').replace(/_/g, ' ').trim();
      if (readable) return `Valeur refusée par la règle « ${readable} ». Vérifiez les champs saisis.`;
    }
    return CODE_MESSAGES['23514'];
  }

  if (err.code && CODE_MESSAGES[err.code]) return CODE_MESSAGES[err.code];

  const message = typeof err.message === 'string' ? err.message : '';

  if (/t[eé]l[eé]phone invalide|whatsapp invalide/i.test(message)) {
    return "Numéro invalide. Saisissez un numéro ivoirien complet à 10 chiffres, commençant par 0, ou un numéro international valide.";
  }
  if (/trop de demandes/i.test(message)) {
    return "Trop de demandes ont été enregistrées récemment. Veuillez patienter avant de réessayer.";
  }
  if (/formule.*(inactive|invalide|n'existe pas)|offre.*(inactive|invalide|n'existe pas)/i.test(message)) {
    return "L'offre ou la formule sélectionnée n'est plus disponible. Actualisez la liste puis choisissez une option active.";
  }
  if (SAFE_PASSTHROUGH.some((m) => message.includes(m))) {
    return message === 'Invalid login credentials' ? 'Identifiants incorrects' : message;
  }
  if (/row-level security|permission denied/i.test(message)) {
    return "Vous n'avez pas les droits nécessaires pour cette action.";
  }
  if (/duplicate key|already exists/i.test(message)) return 'Cet enregistrement existe déjà.';
  if (/network|fetch|timeout/i.test(message)) return 'Problème de connexion réseau. Vérifiez votre connexion puis réessayez.';
  if (/schema cache|could not find the .* column|column .* does not exist/i.test(message)) {
    return CODE_MESSAGES['PGRST204'];
  }
  if (/relation .* does not exist|could not find the table/i.test(message)) {
    return CODE_MESSAGES['PGRST205'];
  }
  if (/violates .* constraint|invalid input syntax|invalid enum/i.test(message)) {
    return 'Une valeur envoyée par le formulaire est invalide. Vérifiez les choix et les champs obligatoires.';
  }

  return fallback;
}
