ALTER TABLE public.platform_admin_audit_log DROP CONSTRAINT IF EXISTS platform_admin_audit_log_action_check;
ALTER TABLE public.platform_admin_audit_log ADD CONSTRAINT platform_admin_audit_log_action_check CHECK (action = ANY (ARRAY[
  'grant_super_admin',
  'revoke_super_admin',
  'platform_admin_access',
  'impersonation_context_load',
  'impersonation_start',
  'impersonation_end',
  'impersonation_context_switch_org'
]));