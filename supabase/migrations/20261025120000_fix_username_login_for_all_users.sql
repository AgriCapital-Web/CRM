-- Ensure every active CRM account can sign in with its username.
-- Resolve the authoritative Auth email first; profiles.email is sometimes NULL
-- for generated client accounts and may be stale for other accounts.
CREATE OR REPLACE FUNCTION public.resolve_username_email(_username text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_key text;
  v_email text;
  v_count integer;
  v_row public.rate_limits%ROWTYPE;
BEGIN
  IF _username IS NULL
     OR length(trim(_username)) < 2
     OR length(trim(_username)) > 64
     OR trim(_username) ~ '[[:cntrl:]]' THEN
    RETURN NULL;
  END IF;

  v_key := 'resolve_username:' || lower(trim(_username));

  SELECT * INTO v_row
    FROM public.rate_limits
   WHERE identifier = v_key AND action = 'resolve_username'
   LIMIT 1;

  IF v_row.id IS NULL THEN
    INSERT INTO public.rate_limits (identifier, action, attempts, first_attempt_at)
    VALUES (v_key, 'resolve_username', 1, now());
  ELSE
    IF v_row.blocked_until IS NOT NULL AND v_row.blocked_until > now() THEN
      RETURN NULL;
    END IF;
    IF v_row.first_attempt_at < now() - interval '1 hour' THEN
      UPDATE public.rate_limits
         SET attempts = 1, first_attempt_at = now(), blocked_until = NULL
       WHERE id = v_row.id;
    ELSE
      UPDATE public.rate_limits
         SET attempts = v_row.attempts + 1,
             blocked_until = CASE
               WHEN v_row.attempts + 1 > 10 THEN now() + interval '1 hour'
               ELSE NULL
             END
       WHERE id = v_row.id;
      IF v_row.attempts + 1 > 10 THEN
        RETURN NULL;
      END IF;
    END IF;
  END IF;

  SELECT count(*), max(COALESCE(NULLIF(btrim(u.email), ''), NULLIF(btrim(p.email), '')))
    INTO v_count, v_email
    FROM public.profiles p
    LEFT JOIN auth.users u
      ON u.id = p.user_id OR (p.user_id IS NULL AND u.id = p.id)
   WHERE lower(btrim(p.username)) = lower(trim(_username))
     AND COALESCE(p.actif, true) = true;

  IF v_count <> 1 THEN
    RETURN NULL;
  END IF;

  RETURN v_email;
END;
$function$;

REVOKE ALL ON FUNCTION public.resolve_username_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_username_email(text) TO service_role;
