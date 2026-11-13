CREATE INDEX IF NOT EXISTS idx_finance_payout_audit_events_actor_id
  ON public.finance_payout_audit_events (actor_id);

CREATE INDEX IF NOT EXISTS idx_finance_payout_batches_approved_by
  ON public.finance_payout_batches (approved_by);

CREATE INDEX IF NOT EXISTS idx_finance_payout_batches_created_by
  ON public.finance_payout_batches (created_by);

CREATE INDEX IF NOT EXISTS idx_finance_payout_beneficiaries_created_by
  ON public.finance_payout_beneficiaries (created_by);

CREATE INDEX IF NOT EXISTS idx_finance_payout_sms_templates_updated_by
  ON public.finance_payout_sms_templates (updated_by);

CREATE INDEX IF NOT EXISTS idx_finance_payouts_approved_by
  ON public.finance_payouts (approved_by);

CREATE INDEX IF NOT EXISTS idx_finance_payouts_created_by
  ON public.finance_payouts (created_by);
