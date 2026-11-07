-- Reduce idle polling while preserving background reminders and push delivery.
-- Both jobs now run every five minutes; the maximum added dispatch delay is five minutes.
SELECT cron.alter_job(9, '*/5 * * * *', NULL, NULL, NULL, NULL);
SELECT cron.alter_job(10, '*/5 * * * *', NULL, NULL, NULL, NULL);
