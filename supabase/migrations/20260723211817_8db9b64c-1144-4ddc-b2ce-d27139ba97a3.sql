
-- Phase C1.3: Copilot Action Proposals
DO $$ BEGIN
  CREATE TYPE public.copilot_action_status AS ENUM
    ('pending','confirmed','executed','rejected','failed','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.copilot_action_proposals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.ai_copilot_conversations(id) ON DELETE SET NULL,
  decision_id UUID REFERENCES public.ai_copilot_decisions(id) ON DELETE SET NULL,
  proposed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  confirmed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action_kind TEXT NOT NULL,           -- draft_journal | collection_reminder | supplier_payment | followup_task | bank_reconciliation | bulk_payments | collection_plan | cash_forecast
  module TEXT,                          -- AR | AP | GL | CASH | ...
  language TEXT NOT NULL DEFAULT 'ar',
  title TEXT NOT NULL,
  summary TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  preview JSONB NOT NULL DEFAULT '{}'::jsonb,
  status public.copilot_action_status NOT NULL DEFAULT 'pending',
  requires_approval BOOLEAN NOT NULL DEFAULT true,
  risk_level TEXT NOT NULL DEFAULT 'low', -- low|medium|high
  user_note TEXT,
  error TEXT,
  result_entity_type TEXT,
  result_entity_id UUID,
  executed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_copilot_actions_org_status
  ON public.copilot_action_proposals(org_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_copilot_actions_conv
  ON public.copilot_action_proposals(conversation_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.copilot_action_proposals TO authenticated;
GRANT ALL ON public.copilot_action_proposals TO service_role;

ALTER TABLE public.copilot_action_proposals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org members read copilot actions" ON public.copilot_action_proposals;
CREATE POLICY "org members read copilot actions"
  ON public.copilot_action_proposals FOR SELECT
  TO authenticated
  USING (public.is_org_member(org_id, auth.uid()));

DROP POLICY IF EXISTS "org members propose copilot actions" ON public.copilot_action_proposals;
CREATE POLICY "org members propose copilot actions"
  ON public.copilot_action_proposals FOR INSERT
  TO authenticated
  WITH CHECK (public.is_org_member(org_id, auth.uid()));

DROP POLICY IF EXISTS "accountants update copilot actions" ON public.copilot_action_proposals;
CREATE POLICY "accountants update copilot actions"
  ON public.copilot_action_proposals FOR UPDATE
  TO authenticated
  USING (
    public.has_org_role(org_id, auth.uid(), 'owner')
    OR public.has_org_role(org_id, auth.uid(), 'admin')
    OR public.has_org_role(org_id, auth.uid(), 'accountant')
  )
  WITH CHECK (
    public.has_org_role(org_id, auth.uid(), 'owner')
    OR public.has_org_role(org_id, auth.uid(), 'admin')
    OR public.has_org_role(org_id, auth.uid(), 'accountant')
  );

DROP TRIGGER IF EXISTS trg_copilot_actions_touch ON public.copilot_action_proposals;
CREATE TRIGGER trg_copilot_actions_touch
  BEFORE UPDATE ON public.copilot_action_proposals
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Simple followup task table (used by proposeFollowUpTask)
CREATE TABLE IF NOT EXISTS public.copilot_followup_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assignee UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  proposal_id UUID REFERENCES public.copilot_action_proposals(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  due_date DATE,
  priority TEXT NOT NULL DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'open', -- open|in_progress|done|cancelled
  related_kind TEXT,
  related_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_followups_org_status
  ON public.copilot_followup_tasks(org_id, status, due_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.copilot_followup_tasks TO authenticated;
GRANT ALL ON public.copilot_followup_tasks TO service_role;

ALTER TABLE public.copilot_followup_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org members read followups" ON public.copilot_followup_tasks;
CREATE POLICY "org members read followups"
  ON public.copilot_followup_tasks FOR SELECT
  TO authenticated
  USING (public.is_org_member(org_id, auth.uid()));

DROP POLICY IF EXISTS "org members write followups" ON public.copilot_followup_tasks;
CREATE POLICY "org members write followups"
  ON public.copilot_followup_tasks FOR ALL
  TO authenticated
  USING (public.is_org_member(org_id, auth.uid()))
  WITH CHECK (public.is_org_member(org_id, auth.uid()));

DROP TRIGGER IF EXISTS trg_followups_touch ON public.copilot_followup_tasks;
CREATE TRIGGER trg_followups_touch
  BEFORE UPDATE ON public.copilot_followup_tasks
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
