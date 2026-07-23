
-- =========================================================
-- BATCH 2B: Unified Document Architecture Foundation
-- =========================================================

-- 1) EXTEND ENUMS ------------------------------------------------
ALTER TYPE public.doc_kind ADD VALUE IF NOT EXISTS 'sales_order';
ALTER TYPE public.doc_kind ADD VALUE IF NOT EXISTS 'goods_receipt';

ALTER TYPE public.doc_status ADD VALUE IF NOT EXISTS 'pending_approval';
ALTER TYPE public.doc_status ADD VALUE IF NOT EXISTS 'approved';
ALTER TYPE public.doc_status ADD VALUE IF NOT EXISTS 'posted';

-- 2) BRANCHES ----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code TEXT,
  name TEXT NOT NULL,
  name_en TEXT,
  address JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.branches TO authenticated;
GRANT ALL ON public.branches TO service_role;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "branches_select" ON public.branches FOR SELECT TO authenticated
  USING (public.is_org_member(org_id, auth.uid()));
CREATE POLICY "branches_write" ON public.branches FOR ALL TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), 'owner') OR public.has_org_role(org_id, auth.uid(), 'admin'))
  WITH CHECK (public.has_org_role(org_id, auth.uid(), 'owner') OR public.has_org_role(org_id, auth.uid(), 'admin'));
CREATE INDEX IF NOT EXISTS branches_org_idx ON public.branches(org_id);
CREATE TRIGGER branches_touch BEFORE UPDATE ON public.branches
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 3) FISCAL YEARS -----------------------------------------------
CREATE TABLE IF NOT EXISTS public.fiscal_years (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_closed BOOLEAN NOT NULL DEFAULT false,
  is_current BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fiscal_years TO authenticated;
GRANT ALL ON public.fiscal_years TO service_role;
ALTER TABLE public.fiscal_years ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fy_select" ON public.fiscal_years FOR SELECT TO authenticated
  USING (public.is_org_member(org_id, auth.uid()));
CREATE POLICY "fy_write" ON public.fiscal_years FOR ALL TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), 'owner') OR public.has_org_role(org_id, auth.uid(), 'admin'))
  WITH CHECK (public.has_org_role(org_id, auth.uid(), 'owner') OR public.has_org_role(org_id, auth.uid(), 'admin'));
CREATE INDEX IF NOT EXISTS fy_org_idx ON public.fiscal_years(org_id);
CREATE TRIGGER fy_touch BEFORE UPDATE ON public.fiscal_years
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 4) EXTEND DOCUMENTS -------------------------------------------
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fiscal_year_id UUID REFERENCES public.fiscal_years(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(18,6) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS posted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS search_text TEXT;

CREATE INDEX IF NOT EXISTS documents_org_kind_idx ON public.documents(org_id, kind);
CREATE INDEX IF NOT EXISTS documents_org_status_idx ON public.documents(org_id, status);
CREATE INDEX IF NOT EXISTS documents_party_idx ON public.documents(party_id);
CREATE INDEX IF NOT EXISTS documents_issue_date_idx ON public.documents(issue_date);
CREATE INDEX IF NOT EXISTS documents_search_gin
  ON public.documents USING gin (to_tsvector('simple', coalesce(search_text,'')));

-- 5) TAGS + DOCUMENT_TAGS ----------------------------------------
CREATE TABLE IF NOT EXISTS public.tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tags TO authenticated;
GRANT ALL ON public.tags TO service_role;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tags_select" ON public.tags FOR SELECT TO authenticated
  USING (public.is_org_member(org_id, auth.uid()));
CREATE POLICY "tags_write" ON public.tags FOR ALL TO authenticated
  USING (public.is_org_member(org_id, auth.uid()))
  WITH CHECK (public.is_org_member(org_id, auth.uid()));

CREATE TABLE IF NOT EXISTS public.document_tags (
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (document_id, tag_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_tags TO authenticated;
GRANT ALL ON public.document_tags TO service_role;
ALTER TABLE public.document_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "doctags_select" ON public.document_tags FOR SELECT TO authenticated
  USING (public.is_org_member(org_id, auth.uid()));
CREATE POLICY "doctags_write" ON public.document_tags FOR ALL TO authenticated
  USING (public.is_org_member(org_id, auth.uid()))
  WITH CHECK (public.is_org_member(org_id, auth.uid()));

-- 6) DOCUMENT RELATIONS ------------------------------------------
CREATE TABLE IF NOT EXISTS public.document_relations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  from_document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  to_document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL, -- 'converted_to','references','payment_for','return_of', etc.
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  UNIQUE (from_document_id, to_document_id, relation_type)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_relations TO authenticated;
GRANT ALL ON public.document_relations TO service_role;
ALTER TABLE public.document_relations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "docrel_select" ON public.document_relations FOR SELECT TO authenticated
  USING (public.is_org_member(org_id, auth.uid()));
CREATE POLICY "docrel_write" ON public.document_relations FOR ALL TO authenticated
  USING (public.is_org_member(org_id, auth.uid()))
  WITH CHECK (public.is_org_member(org_id, auth.uid()));
CREATE INDEX IF NOT EXISTS docrel_from_idx ON public.document_relations(from_document_id);
CREATE INDEX IF NOT EXISTS docrel_to_idx ON public.document_relations(to_document_id);

-- 7) DOCUMENT VERSIONS -------------------------------------------
CREATE TABLE IF NOT EXISTS public.document_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  snapshot JSONB NOT NULL, -- full doc + lines snapshot
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  UNIQUE (document_id, version)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_versions TO authenticated;
GRANT ALL ON public.document_versions TO service_role;
ALTER TABLE public.document_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "docver_select" ON public.document_versions FOR SELECT TO authenticated
  USING (public.is_org_member(org_id, auth.uid()));
CREATE POLICY "docver_write" ON public.document_versions FOR ALL TO authenticated
  USING (public.is_org_member(org_id, auth.uid()))
  WITH CHECK (public.is_org_member(org_id, auth.uid()));
CREATE INDEX IF NOT EXISTS docver_doc_idx ON public.document_versions(document_id);

-- 8) EXTEND ATTACHMENTS + VERSIONS -------------------------------
ALTER TABLE public.attachments
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_current BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS checksum TEXT,
  ADD COLUMN IF NOT EXISTS thumb_path TEXT,
  ADD COLUMN IF NOT EXISTS medium_path TEXT,
  ADD COLUMN IF NOT EXISTS width INTEGER,
  ADD COLUMN IF NOT EXISTS height INTEGER,
  ADD COLUMN IF NOT EXISTS page_count INTEGER,
  ADD COLUMN IF NOT EXISTS ocr_status TEXT,           -- null|pending|processing|done|failed
  ADD COLUMN IF NOT EXISTS ocr_provider TEXT,
  ADD COLUMN IF NOT EXISTS extracted_json JSONB,
  ADD COLUMN IF NOT EXISTS confidence NUMERIC(5,4),
  ADD COLUMN IF NOT EXISTS searchable_text TEXT;

CREATE INDEX IF NOT EXISTS attachments_entity_idx ON public.attachments(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS attachments_search_gin
  ON public.attachments USING gin (to_tsvector('simple', coalesce(searchable_text,'')));

CREATE TABLE IF NOT EXISTS public.attachment_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attachment_id UUID NOT NULL REFERENCES public.attachments(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  storage_path TEXT NOT NULL,
  bucket TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT,
  checksum TEXT,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (attachment_id, version)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attachment_versions TO authenticated;
GRANT ALL ON public.attachment_versions TO service_role;
ALTER TABLE public.attachment_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "attver_select" ON public.attachment_versions FOR SELECT TO authenticated
  USING (public.is_org_member(org_id, auth.uid()));
CREATE POLICY "attver_write" ON public.attachment_versions FOR ALL TO authenticated
  USING (public.is_org_member(org_id, auth.uid()))
  WITH CHECK (public.is_org_member(org_id, auth.uid()));

-- 9) APPROVAL WORKFLOW ENGINE ------------------------------------
CREATE TABLE IF NOT EXISTS public.approval_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  entity_type TEXT NOT NULL DEFAULT 'document',
  doc_kind public.doc_kind,          -- null = applies to any kind
  min_amount NUMERIC(18,4),
  max_amount NUMERIC(18,4),
  is_active BOOLEAN NOT NULL DEFAULT true,
  auto_post_on_final BOOLEAN NOT NULL DEFAULT false,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.approval_workflows TO authenticated;
GRANT ALL ON public.approval_workflows TO service_role;
ALTER TABLE public.approval_workflows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wf_select" ON public.approval_workflows FOR SELECT TO authenticated
  USING (public.is_org_member(org_id, auth.uid()));
CREATE POLICY "wf_write" ON public.approval_workflows FOR ALL TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), 'owner') OR public.has_org_role(org_id, auth.uid(), 'admin'))
  WITH CHECK (public.has_org_role(org_id, auth.uid(), 'owner') OR public.has_org_role(org_id, auth.uid(), 'admin'));
CREATE TRIGGER wf_touch BEFORE UPDATE ON public.approval_workflows
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.approval_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES public.approval_workflows(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL,
  name TEXT NOT NULL,
  approver_role public.app_role,
  approver_user_id UUID REFERENCES auth.users(id),
  required BOOLEAN NOT NULL DEFAULT true,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workflow_id, step_order)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.approval_steps TO authenticated;
GRANT ALL ON public.approval_steps TO service_role;
ALTER TABLE public.approval_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wfstep_select" ON public.approval_steps FOR SELECT TO authenticated
  USING (public.is_org_member(org_id, auth.uid()));
CREATE POLICY "wfstep_write" ON public.approval_steps FOR ALL TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), 'owner') OR public.has_org_role(org_id, auth.uid(), 'admin'))
  WITH CHECK (public.has_org_role(org_id, auth.uid(), 'owner') OR public.has_org_role(org_id, auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workflow_id UUID REFERENCES public.approval_workflows(id) ON DELETE SET NULL,
  entity_type TEXT NOT NULL DEFAULT 'document',
  entity_id UUID NOT NULL,
  document_id UUID REFERENCES public.documents(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending', -- pending|approved|rejected|cancelled
  current_step INTEGER NOT NULL DEFAULT 1,
  requested_by UUID REFERENCES auth.users(id),
  completed_at TIMESTAMPTZ,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.approval_requests TO authenticated;
GRANT ALL ON public.approval_requests TO service_role;
ALTER TABLE public.approval_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wfreq_select" ON public.approval_requests FOR SELECT TO authenticated
  USING (public.is_org_member(org_id, auth.uid()));
CREATE POLICY "wfreq_write" ON public.approval_requests FOR ALL TO authenticated
  USING (public.is_org_member(org_id, auth.uid()))
  WITH CHECK (public.is_org_member(org_id, auth.uid()));
CREATE INDEX IF NOT EXISTS wfreq_doc_idx ON public.approval_requests(document_id);
CREATE INDEX IF NOT EXISTS wfreq_org_status_idx ON public.approval_requests(org_id, status);
CREATE TRIGGER wfreq_touch BEFORE UPDATE ON public.approval_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.approval_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.approval_requests(id) ON DELETE CASCADE,
  step_id UUID REFERENCES public.approval_steps(id) ON DELETE SET NULL,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL,
  action TEXT NOT NULL, -- approve|reject|comment|delegate|reassign
  actor_id UUID REFERENCES auth.users(id),
  comment TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.approval_actions TO authenticated;
GRANT ALL ON public.approval_actions TO service_role;
ALTER TABLE public.approval_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wfact_select" ON public.approval_actions FOR SELECT TO authenticated
  USING (public.is_org_member(org_id, auth.uid()));
CREATE POLICY "wfact_write" ON public.approval_actions FOR ALL TO authenticated
  USING (public.is_org_member(org_id, auth.uid()))
  WITH CHECK (public.is_org_member(org_id, auth.uid()));

-- 10) SEARCH-TEXT MAINTENANCE TRIGGER ---------------------------
CREATE OR REPLACE FUNCTION public.documents_refresh_search()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.search_text := lower(concat_ws(' ',
    NEW.doc_number,
    NEW.po_number,
    NEW.project,
    NEW.notes,
    COALESCE(NEW.party_snapshot->>'name',''),
    COALESCE(NEW.party_snapshot->>'name_en',''),
    COALESCE(NEW.party_snapshot->>'vat_number',''),
    NEW.grand_total::text
  ));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS documents_search_trg ON public.documents;
CREATE TRIGGER documents_search_trg
  BEFORE INSERT OR UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.documents_refresh_search();

-- Backfill search_text for existing rows
UPDATE public.documents SET updated_at = updated_at;
