
-- Extend ap_intake_documents
ALTER TABLE public.ap_intake_documents
  ADD COLUMN IF NOT EXISTS validation JSONB,
  ADD COLUMN IF NOT EXISTS po_document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS grn_document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS attachment_id UUID,
  ADD COLUMN IF NOT EXISTS page_count INT,
  ADD COLUMN IF NOT EXISTS processing_time_ms INT,
  ADD COLUMN IF NOT EXISTS ocr_language TEXT;

CREATE INDEX IF NOT EXISTS idx_ap_intake_org_status_created
  ON public.ap_intake_documents(org_id, status, created_at DESC);

-- Queue
CREATE TABLE IF NOT EXISTS public.ap_intake_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  intake_id UUID NOT NULL REFERENCES public.ap_intake_documents(id) ON DELETE CASCADE,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'queued', -- queued | processing | done | failed | dead
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 5,
  next_run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error TEXT,
  locked_at TIMESTAMPTZ,
  locked_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ap_intake_queue TO authenticated;
GRANT ALL ON public.ap_intake_queue TO service_role;
ALTER TABLE public.ap_intake_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "queue org members read" ON public.ap_intake_queue
  FOR SELECT USING (public.is_org_member(org_id, auth.uid()));
CREATE POLICY "queue org members write" ON public.ap_intake_queue
  FOR ALL USING (public.is_org_member(org_id, auth.uid()))
  WITH CHECK (public.is_org_member(org_id, auth.uid()));

CREATE INDEX IF NOT EXISTS idx_ap_queue_pull
  ON public.ap_intake_queue(status, next_run_at)
  WHERE status IN ('queued','failed');
CREATE INDEX IF NOT EXISTS idx_ap_queue_org ON public.ap_intake_queue(org_id, status);

CREATE TRIGGER trg_ap_queue_touch BEFORE UPDATE ON public.ap_intake_queue
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Approvals
CREATE TABLE IF NOT EXISTS public.ap_intake_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  intake_id UUID NOT NULL REFERENCES public.ap_intake_documents(id) ON DELETE CASCADE,
  level INT NOT NULL DEFAULT 1,
  decision TEXT NOT NULL, -- pending | approved | rejected | commented
  comment TEXT,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ap_intake_approvals TO authenticated;
GRANT ALL ON public.ap_intake_approvals TO service_role;
ALTER TABLE public.ap_intake_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "approvals org read" ON public.ap_intake_approvals
  FOR SELECT USING (public.is_org_member(org_id, auth.uid()));
CREATE POLICY "approvals org write" ON public.ap_intake_approvals
  FOR INSERT WITH CHECK (public.is_org_member(org_id, auth.uid()));

CREATE INDEX IF NOT EXISTS idx_ap_approvals_intake ON public.ap_intake_approvals(intake_id, created_at DESC);

-- Corrections (learning engine)
CREATE TABLE IF NOT EXISTS public.ap_intake_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  intake_id UUID NOT NULL REFERENCES public.ap_intake_documents(id) ON DELETE CASCADE,
  party_id UUID REFERENCES public.parties(id) ON DELETE SET NULL,
  field_path TEXT NOT NULL,     -- e.g. "supplierName", "lines[0].price"
  extracted_value JSONB,
  corrected_value JSONB,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ap_intake_corrections TO authenticated;
GRANT ALL ON public.ap_intake_corrections TO service_role;
ALTER TABLE public.ap_intake_corrections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "corrections org read" ON public.ap_intake_corrections
  FOR SELECT USING (public.is_org_member(org_id, auth.uid()));
CREATE POLICY "corrections org write" ON public.ap_intake_corrections
  FOR INSERT WITH CHECK (public.is_org_member(org_id, auth.uid()));

CREATE INDEX IF NOT EXISTS idx_ap_corr_party ON public.ap_intake_corrections(org_id, party_id, field_path);

-- Atomic queue picker for the background processor
CREATE OR REPLACE FUNCTION public.ap_intake_queue_pick(_limit INT DEFAULT 1)
RETURNS SETOF public.ap_intake_queue
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT id FROM public.ap_intake_queue
    WHERE status IN ('queued','failed')
      AND next_run_at <= now()
      AND attempts < max_attempts
    ORDER BY next_run_at
    FOR UPDATE SKIP LOCKED
    LIMIT _limit
  )
  UPDATE public.ap_intake_queue q
     SET status = 'processing',
         attempts = attempts + 1,
         locked_at = now()
    FROM picked p
   WHERE q.id = p.id
   RETURNING q.*;
END $$;

-- Aggregate metrics view for the dashboard
CREATE OR REPLACE VIEW public.ap_intake_metrics
WITH (security_invoker = true) AS
SELECT
  d.org_id,
  COUNT(*)::int                                                  AS total,
  COUNT(*) FILTER (WHERE d.status = 'review')::int               AS review_queue,
  COUNT(*) FILTER (WHERE d.status = 'auto_drafted')::int         AS auto_drafted,
  COUNT(*) FILTER (WHERE d.status = 'duplicate')::int            AS duplicates,
  COUNT(*) FILTER (WHERE d.status = 'failed')::int               AS failed,
  COUNT(*) FILTER (WHERE d.status = 'posted')::int               AS posted,
  ROUND(AVG(d.confidence) FILTER (WHERE d.confidence IS NOT NULL)::numeric, 3) AS avg_confidence,
  ROUND(AVG(d.processing_time_ms) FILTER (WHERE d.processing_time_ms IS NOT NULL)::numeric, 0) AS avg_processing_ms
FROM public.ap_intake_documents d
GROUP BY d.org_id;

GRANT SELECT ON public.ap_intake_metrics TO authenticated;
