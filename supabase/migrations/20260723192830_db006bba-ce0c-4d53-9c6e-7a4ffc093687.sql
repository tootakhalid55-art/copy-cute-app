
-- Phase C1.2: ERP-wide Finance Copilot — conversations + enhanced decisions

CREATE TABLE IF NOT EXISTS public.ai_copilot_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  title TEXT NOT NULL DEFAULT 'محادثة جديدة',
  language TEXT NOT NULL DEFAULT 'ar',
  module TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_copilot_conversations TO authenticated;
GRANT ALL ON public.ai_copilot_conversations TO service_role;

ALTER TABLE public.ai_copilot_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read conversations" ON public.ai_copilot_conversations
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.org_members m
                 WHERE m.org_id = ai_copilot_conversations.org_id AND m.user_id = auth.uid()));

CREATE POLICY "org members write conversations" ON public.ai_copilot_conversations
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.org_members m
                 WHERE m.org_id = ai_copilot_conversations.org_id AND m.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.org_members m
                      WHERE m.org_id = ai_copilot_conversations.org_id AND m.user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_copilot_conv_org_time
  ON public.ai_copilot_conversations(org_id, last_message_at DESC);

-- Extend decisions table with conversation + explainability fields
ALTER TABLE public.ai_copilot_decisions
  ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES public.ai_copilot_conversations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS citations JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS follow_ups JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS explainability JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS module TEXT;

CREATE INDEX IF NOT EXISTS idx_copilot_decisions_conv
  ON public.ai_copilot_decisions(conversation_id, created_at);
