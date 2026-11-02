-- Backfill des journaux de livraison dont le téléphone manquait alors que le contact possède un numéro.
-- Ne remplace jamais un numéro déjà enregistré.
UPDATE public.notification_deliveries d
SET recipient_phone = COALESCE(
  NULLIF(trim(CASE WHEN d.canal = 'whatsapp' THEN c.whatsapp ELSE c.telephone END), ''),
  NULLIF(trim(c.telephone_secondaire), ''),
  NULLIF(trim(c.whatsapp), '')
)
FROM public.clients c
WHERE d.source_id = c.id
  AND d.source_type IN ('client','proprietaire_foncier','beneficiaire_particulier','proprietaire_foncier+beneficiaire_particulier')
  AND NULLIF(trim(d.recipient_phone), '') IS NULL
  AND COALESCE(NULLIF(trim(c.whatsapp), ''), NULLIF(trim(c.telephone), ''), NULLIF(trim(c.telephone_secondaire), '')) IS NOT NULL;

UPDATE public.notification_deliveries d
SET recipient_phone = COALESCE(
  NULLIF(trim(CASE WHEN d.canal = 'whatsapp' THEN l.whatsapp ELSE l.telephone END), ''),
  NULLIF(trim(l.telephone_secondaire), ''),
  NULLIF(trim(l.whatsapp), '')
)
FROM public.leads l
WHERE d.source_id = l.id
  AND d.source_type IN ('lead','prospect')
  AND NULLIF(trim(d.recipient_phone), '') IS NULL
  AND COALESCE(NULLIF(trim(l.whatsapp), ''), NULLIF(trim(l.telephone), ''), NULLIF(trim(l.telephone_secondaire), '')) IS NOT NULL;

UPDATE public.notification_deliveries d
SET recipient_phone = COALESCE(
  NULLIF(trim(CASE WHEN d.canal = 'whatsapp' THEN p.whatsapp ELSE p.telephone END), ''),
  NULLIF(trim(p.telephone_secondaire_whatsapp_numero), ''),
  NULLIF(trim(p.telephone_secondaire), ''),
  NULLIF(trim(p.whatsapp), '')
)
FROM public.profiles p
WHERE d.source_id = p.id
  AND d.source_type = 'equipe'
  AND NULLIF(trim(d.recipient_phone), '') IS NULL
  AND COALESCE(NULLIF(trim(p.whatsapp), ''), NULLIF(trim(p.telephone), ''), NULLIF(trim(p.telephone_secondaire_whatsapp_numero), ''), NULLIF(trim(p.telephone_secondaire), '')) IS NOT NULL;
