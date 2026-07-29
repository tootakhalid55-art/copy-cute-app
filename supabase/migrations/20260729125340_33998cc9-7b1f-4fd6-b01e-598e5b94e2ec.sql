CREATE TABLE IF NOT EXISTS public.platform_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  active boolean NOT NULL DEFAULT true,
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.platform_admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  target_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('grant_super_admin', 'revoke_super_admin')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_admin_audit_log ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.platform_admins FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.platform_admin_audit_log FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.platform_admins TO service_role;
GRANT ALL ON public.platform_admin_audit_log TO service_role;

CREATE OR REPLACE FUNCTION public.is_platform_admin(_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = _user_id AND active = true);
$$;

REVOKE ALL ON FUNCTION public.is_platform_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_platform_admin(uuid) TO authenticated, service_role;

-- Bootstrap Super Admin from known owner emails
INSERT INTO public.platform_admins (user_id, granted_by)
SELECT id, id FROM auth.users
WHERE lower(email) IN ('info@canarmodern.com')
ON CONFLICT (user_id) DO UPDATE SET active = true;