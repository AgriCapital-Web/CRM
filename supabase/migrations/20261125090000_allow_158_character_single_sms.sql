ALTER TABLE public.notification_channel_policy
  DROP CONSTRAINT IF EXISTS notification_channel_policy_sms_max_characters_check;

ALTER TABLE public.notification_channel_policy
  ADD CONSTRAINT notification_channel_policy_sms_max_characters_check
  CHECK (sms_max_characters >= 1 AND sms_max_characters <= 158);
