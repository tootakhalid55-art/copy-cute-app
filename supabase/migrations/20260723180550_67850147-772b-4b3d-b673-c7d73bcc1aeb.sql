
-- Approval thresholds
CREATE TABLE IF NOT EXISTS public.ap_approval_thresholds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  min_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  max_amount NUMERIC(18,2),
  party_id UUID REFERENCES public.parties(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE,
  required_levels INT NOT NULL DEFAULT 1,
  auto_post BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  priority INT NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ap_approval_thresholds TO authenticated;
GRANT ALL ON public.ap_approval_thresholds TO service_role;
ALTER TABLE public.ap_approval_thresholds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members read thresholds" ON public.ap_approval_thresholds
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.org_members om WHERE om.org_id = ap_approval_thresholds.org_id AND om.user_id = auth.uid()));
CREATE POLICY "org members write thresholds" ON public.ap_approval_thresholds
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.org_members om WHERE om.org_id = ap_approval_thresholds.org_id AND om.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.org_members om WHERE om.org_id = ap_approval_thresholds.org_id AND om.user_id = auth.uid()));
CREATE INDEX IF NOT EXISTS idx_ap_thresholds_lookup ON public.ap_approval_thresholds(org_id, active, priority);

-- Supplier layout hints learned from corrections
CREATE TABLE IF NOT EXISTS public.ap_supplier_layouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  party_id UUID NOT NULL REFERENCES public.parties(id) ON DELETE CASCADE,
  hints JSONB NOT NULL DEFAULT '{}'::jsonb,
  sample_count INT NOT NULL DEFAULT 0,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, party_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ap_supplier_layouts TO authenticated;
GRANT ALL ON public.ap_supplier_layouts TO service_role;
ALTER TABLE public.ap_supplier_layouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members access layouts" ON public.ap_supplier_layouts
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.org_members om WHERE om.org_id = ap_supplier_layouts.org_id AND om.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.org_members om WHERE om.org_id = ap_supplier_layouts.org_id AND om.user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.tg_touch_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_ap_thresholds_updated ON public.ap_approval_thresholds;
CREATE TRIGGER trg_ap_thresholds_updated BEFORE UPDATE ON public.ap_approval_thresholds
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

DROP TRIGGER IF EXISTS trg_ap_layouts_updated ON public.ap_supplier_layouts;
CREATE TRIGGER trg_ap_layouts_updated BEFORE UPDATE ON public.ap_supplier_layouts
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();
