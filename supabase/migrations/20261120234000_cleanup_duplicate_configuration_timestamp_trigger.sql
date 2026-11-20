begin;
-- The dedicated configurations_systeme trigger already owns updated_at.
-- Remove the duplicate generic trigger to keep one deterministic timestamp writer.
drop trigger if exists trg_config_updated_at on public.configurations_systeme;
commit;