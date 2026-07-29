-- Bootstrap the first platform Super Admin for the provided trusted mailbox.
-- This migration is idempotent and will only promote the matching auth user if it exists.

DO $$
DECLARE
  v_user_id uuid;
BEGIN
  SELECT id
    INTO v_user_id
  FROM auth.users
  WHERE lower(email) = lower('INFO@CANARMODERN.COM')
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE NOTICE 'Skipping Super Admin bootstrap: auth user INFO@CANARMODERN.COM not found yet.';
    RETURN;
  END IF;

  INSERT INTO public.platform_admins (user_id, active, granted_by, granted_at, updated_at)
  VALUES (v_user_id, true, v_user_id, now(), now())
  ON CONFLICT (user_id)
  DO UPDATE SET
    active = true,
    granted_by = EXCLUDED.granted_by,
    granted_at = EXCLUDED.granted_at,
    updated_at = EXCLUDED.updated_at;

  INSERT INTO public.platform_admin_audit_log (actor_user_id, target_user_id, action, metadata)
  VALUES (
    v_user_id,
    v_user_id,
    'grant_super_admin',
    jsonb_build_object('email', 'INFO@CANARMODERN.COM', 'source', 'bootstrap_migration')
  );
END $$;
