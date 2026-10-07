import { z } from 'zod';

export const MAX_AMOUNT = 1_000_000_000;

/** Schéma de validation d'un montant monétaire (FCFA, 2 décimales max, > 0). */
export const amountSchema = z
  .union([z.string(), z.number()])
  .transform((val) => (typeof val === 'number' ? String(val) : val.replace(/[\s\u00A0]/g, '')))
  .refine((val) => /^\d+([.,]\d{1,2})?$/.test(val), {
    message: 'Montant invalide (chiffres uniquement, 2 décimales maximum).',
  })
  .transform((val) => parseFloat(val.replace(',', '.')))
  .refine((val) => Number.isFinite(val) && val > 0 && val <= MAX_AMOUNT, {
    message: `Le montant doit être compris entre 1 et ${MAX_AMOUNT.toLocaleString('fr-FR')} FCFA.`,
  });

export interface AmountValidation {
  ok: boolean;
  value: number;
  error?: string;
}

/** Valide et normalise un montant saisi par l'utilisateur. */
export function parseAmount(input: unknown): AmountValidation {
  const result = amountSchema.safeParse(input as string | number);
  if (!result.success) {
    return { ok: false, value: NaN, error: result.error.issues[0]?.message ?? 'Montant invalide.' };
  }
  return { ok: true, value: Math.round(result.data * 100) / 100 };
}

