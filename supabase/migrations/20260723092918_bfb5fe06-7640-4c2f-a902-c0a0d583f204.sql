
-- Notifications table for event delivery (feature disabled but events accumulate)
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  document_id UUID REFERENCES public.documents(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  channel TEXT NOT NULL DEFAULT 'inapp',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_org_user ON public.notifications(org_id, user_id, created_at DESC);
CREATE INDEX idx_notifications_document ON public.notifications(document_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read notifications" ON public.notifications
  FOR SELECT TO authenticated
  USING (public.is_org_member(org_id, auth.uid()));

CREATE POLICY "org members insert notifications" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(org_id, auth.uid()));

CREATE POLICY "recipients update own notifications" ON public.notifications
  FOR UPDATE TO authenticated
  USING (public.is_org_member(org_id, auth.uid()) AND (user_id = auth.uid() OR user_id IS NULL))
  WITH CHECK (public.is_org_member(org_id, auth.uid()));

CREATE TRIGGER touch_notifications BEFORE UPDATE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- OCR jobs: placeholder queue for attachments (populated on upload, processed later)
CREATE TABLE public.ocr_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  attachment_id UUID NOT NULL REFERENCES public.attachments(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  provider TEXT,
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT,
  result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ocr_jobs_status ON public.ocr_jobs(org_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ocr_jobs TO authenticated;
GRANT ALL ON public.ocr_jobs TO service_role;
ALTER TABLE public.ocr_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members manage ocr jobs" ON public.ocr_jobs
  FOR ALL TO authenticated
  USING (public.is_org_member(org_id, auth.uid()))
  WITH CHECK (public.is_org_member(org_id, auth.uid()));

CREATE TRIGGER touch_ocr_jobs BEFORE UPDATE ON public.ocr_jobs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Migration reports for Batch 2B document import
CREATE TABLE public.migration_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope TEXT NOT NULL,
  imported INT NOT NULL DEFAULT 0,
  failed INT NOT NULL DEFAULT 0,
  skipped INT NOT NULL DEFAULT 0,
  duplicate INT NOT NULL DEFAULT 0,
  details JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.migration_reports TO authenticated;
GRANT ALL ON public.migration_reports TO service_role;
ALTER TABLE public.migration_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members manage migration reports" ON public.migration_reports
  FOR ALL TO authenticated
  USING (public.is_org_member(org_id, auth.uid()))
  WITH CHECK (public.is_org_member(org_id, auth.uid()));

-- Enforce status transitions on documents
CREATE OR REPLACE FUNCTION public.documents_validate_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  ok BOOLEAN := FALSE;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('draft','pending_approval') THEN
      RAISE EXCEPTION 'documents may only be created in draft or pending_approval, got %', NEW.status;
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- allowed transitions
  ok := (OLD.status = 'draft'            AND NEW.status IN ('pending_approval','approved','cancelled'))
     OR (OLD.status = 'pending_approval' AND NEW.status IN ('approved','draft','cancelled'))
     OR (OLD.status = 'approved'         AND NEW.status IN ('posted','cancelled'))
     OR (OLD.status = 'posted'           AND NEW.status IN ('cancelled'));

  IF NOT ok THEN
    RAISE EXCEPTION 'illegal document status transition: % -> %', OLD.status, NEW.status;
  END IF;

  IF NEW.status = 'approved' AND NEW.approved_at IS NULL THEN
    NEW.approved_at := now();
    NEW.approved_by := COALESCE(NEW.approved_by, auth.uid());
  END IF;
  IF NEW.status = 'posted' AND NEW.posted_at IS NULL THEN
    NEW.posted_at := now();
  END IF;
  IF NEW.status = 'cancelled' AND NEW.cancelled_at IS NULL THEN
    NEW.cancelled_at := now();
    NEW.cancelled_by := COALESCE(NEW.cancelled_by, auth.uid());
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS documents_status_guard ON public.documents;
CREATE TRIGGER documents_status_guard
  BEFORE INSERT OR UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.documents_validate_status();
