
CREATE TABLE public.ai_copilot_decisions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  intake_id UUID REFERENCES public.ap_intake_documents(id) ON DELETE CASCADE,
  document_id UUID REFERENCES public.documents(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  question TEXT,
  answer TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'ar',
  model TEXT,
  confidence NUMERIC,
  recommendation TEXT,
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_copilot_org_created ON public.ai_copilot_decisions(org_id, created_at DESC);
CREATE INDEX idx_ai_copilot_intake ON public.ai_copilot_decisions(intake_id) WHERE intake_id IS NOT NULL;
CREATE INDEX idx_ai_copilot_doc ON public.ai_copilot_decisions(document_id) WHERE document_id IS NOT NULL;
CREATE INDEX idx_ai_copilot_kind ON public.ai_copilot_decisions(org_id, kind, created_at DESC);

GRANT SELECT, INSERT ON public.ai_copilot_decisions TO authenticated;
GRANT ALL ON public.ai_copilot_decisions TO service_role;

ALTER TABLE public.ai_copilot_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read copilot decisions"
  ON public.ai_copilot_decisions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.org_members m WHERE m.org_id = ai_copilot_decisions.org_id AND m.user_id = auth.uid()));

CREATE POLICY "org members write copilot decisions"
  ON public.ai_copilot_decisions FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.org_members m WHERE m.org_id = ai_copilot_decisions.org_id AND m.user_id = auth.uid()));
