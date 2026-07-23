
-- ============ Tax types ============
DO $$ BEGIN
  CREATE TYPE public.tax_type AS ENUM ('standard','zero_rated','exempt','out_of_scope','reverse_charge');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.numbering_reset AS ENUM ('never','yearly','monthly');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ 1. Account Determinations ============
CREATE TABLE IF NOT EXISTS public.account_determinations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE,
  doc_kind TEXT,
  key TEXT NOT NULL,
  account_code TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS account_determinations_uk
  ON public.account_determinations (org_id, COALESCE(branch_id,'00000000-0000-0000-0000-000000000000'::uuid), COALESCE(doc_kind,''), key);
CREATE INDEX IF NOT EXISTS account_determinations_org_idx ON public.account_determinations(org_id, key);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_determinations TO authenticated;
GRANT ALL ON public.account_determinations TO service_role;
ALTER TABLE public.account_determinations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read determinations" ON public.account_determinations FOR SELECT TO authenticated USING (public.is_org_member(org_id, auth.uid()));
CREATE POLICY "admins manage determinations" ON public.account_determinations FOR ALL TO authenticated
  USING (public.has_org_role(org_id, auth.uid(),'owner') OR public.has_org_role(org_id, auth.uid(),'admin') OR public.has_org_role(org_id, auth.uid(),'accountant'))
  WITH CHECK (public.has_org_role(org_id, auth.uid(),'owner') OR public.has_org_role(org_id, auth.uid(),'admin') OR public.has_org_role(org_id, auth.uid(),'accountant'));
CREATE TRIGGER trg_touch_account_determinations BEFORE UPDATE ON public.account_determinations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Resolver: prefers most specific (branch + doc_kind) > (doc_kind) > (branch) > (org)
CREATE OR REPLACE FUNCTION public.resolve_account(_org UUID, _branch UUID, _doc_kind TEXT, _key TEXT)
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT account_code FROM public.account_determinations
  WHERE org_id = _org AND key = _key AND is_active = true
    AND (branch_id IS NULL OR branch_id = _branch)
    AND (doc_kind IS NULL OR doc_kind = _doc_kind)
  ORDER BY
    (CASE WHEN branch_id IS NOT NULL AND doc_kind IS NOT NULL THEN 0
          WHEN doc_kind IS NOT NULL THEN 1
          WHEN branch_id IS NOT NULL THEN 2
          ELSE 3 END)
  LIMIT 1;
$$;

-- ============ 2. Tax Codes ============
CREATE TABLE IF NOT EXISTS public.tax_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  description TEXT NOT NULL,
  description_en TEXT,
  rate NUMERIC(6,3) NOT NULL DEFAULT 0,
  tax_type public.tax_type NOT NULL,
  is_recoverable BOOLEAN NOT NULL DEFAULT true,
  is_payable BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,
  -- Account determination keys used by the posting engine for this code
  payable_key TEXT NOT NULL DEFAULT 'vat_payable',
  recoverable_key TEXT NOT NULL DEFAULT 'vat_recoverable',
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tax_codes TO authenticated;
GRANT ALL ON public.tax_codes TO service_role;
ALTER TABLE public.tax_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read tax_codes" ON public.tax_codes FOR SELECT TO authenticated USING (public.is_org_member(org_id, auth.uid()));
CREATE POLICY "admins manage tax_codes" ON public.tax_codes FOR ALL TO authenticated
  USING (public.has_org_role(org_id, auth.uid(),'owner') OR public.has_org_role(org_id, auth.uid(),'admin') OR public.has_org_role(org_id, auth.uid(),'accountant'))
  WITH CHECK (public.has_org_role(org_id, auth.uid(),'owner') OR public.has_org_role(org_id, auth.uid(),'admin') OR public.has_org_role(org_id, auth.uid(),'accountant'));
CREATE TRIGGER trg_touch_tax_codes BEFORE UPDATE ON public.tax_codes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Validation: throw on missing / expired / inactive tax code
CREATE OR REPLACE FUNCTION public.validate_tax_code(_org UUID, _code TEXT, _date DATE)
RETURNS public.tax_codes
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE r public.tax_codes%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.tax_codes WHERE org_id=_org AND code=_code;
  IF r.id IS NULL THEN RAISE EXCEPTION 'tax_code_not_found: %', _code; END IF;
  IF NOT r.is_active THEN RAISE EXCEPTION 'tax_code_inactive: %', _code; END IF;
  IF r.effective_from > _date THEN RAISE EXCEPTION 'tax_code_not_yet_effective: %', _code; END IF;
  IF r.effective_to IS NOT NULL AND r.effective_to < _date THEN RAISE EXCEPTION 'tax_code_expired: %', _code; END IF;
  RETURN r;
END; $$;

-- ============ 3. Numbering Sequences ============
CREATE TABLE IF NOT EXISTS public.numbering_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE,
  fiscal_year_id UUID REFERENCES public.fiscal_years(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL,
  prefix TEXT NOT NULL DEFAULT '',
  suffix TEXT NOT NULL DEFAULT '',
  padding INT NOT NULL DEFAULT 5,
  next_number BIGINT NOT NULL DEFAULT 1,
  reset_policy public.numbering_reset NOT NULL DEFAULT 'yearly',
  last_reset_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS numbering_sequences_uk
  ON public.numbering_sequences (org_id, COALESCE(branch_id,'00000000-0000-0000-0000-000000000000'::uuid), COALESCE(fiscal_year_id,'00000000-0000-0000-0000-000000000000'::uuid), doc_type);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.numbering_sequences TO authenticated;
GRANT ALL ON public.numbering_sequences TO service_role;
ALTER TABLE public.numbering_sequences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read numbering" ON public.numbering_sequences FOR SELECT TO authenticated USING (public.is_org_member(org_id, auth.uid()));
CREATE POLICY "admins manage numbering" ON public.numbering_sequences FOR ALL TO authenticated
  USING (public.has_org_role(org_id, auth.uid(),'owner') OR public.has_org_role(org_id, auth.uid(),'admin') OR public.has_org_role(org_id, auth.uid(),'accountant'))
  WITH CHECK (public.has_org_role(org_id, auth.uid(),'owner') OR public.has_org_role(org_id, auth.uid(),'admin') OR public.has_org_role(org_id, auth.uid(),'accountant'));
CREATE TRIGGER trg_touch_numbering BEFORE UPDATE ON public.numbering_sequences
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Atomic sequence advance; returns the formatted number.
CREATE OR REPLACE FUNCTION public.next_document_number(_org UUID, _branch UUID, _fy UUID, _doc_type TEXT)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE r public.numbering_sequences%ROWTYPE; v BIGINT;
BEGIN
  SELECT * INTO r FROM public.numbering_sequences
    WHERE org_id = _org
      AND doc_type = _doc_type
      AND (branch_id IS NOT DISTINCT FROM _branch)
      AND (fiscal_year_id IS NOT DISTINCT FROM _fy)
    FOR UPDATE;
  IF r.id IS NULL THEN
    -- Auto-provision default
    INSERT INTO public.numbering_sequences(org_id, branch_id, fiscal_year_id, doc_type, prefix, padding, next_number)
    VALUES (_org, _branch, _fy, _doc_type, upper(_doc_type) || '-', 5, 1)
    RETURNING * INTO r;
  END IF;
  v := r.next_number;
  UPDATE public.numbering_sequences SET next_number = next_number + 1 WHERE id = r.id;
  RETURN r.prefix || lpad(v::text, r.padding, '0') || r.suffix;
END; $$;

-- ============ 4. Per-line tax fields ============
ALTER TABLE public.document_lines
  ADD COLUMN IF NOT EXISTS tax_code_id UUID REFERENCES public.tax_codes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS taxable_amount NUMERIC(14,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(14,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_tax_inclusive BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_reverse_charge BOOLEAN NOT NULL DEFAULT false;

-- ============ 5. ZATCA phase-2 prep (columns only, not activated) ============
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS zatca_uuid UUID,
  ADD COLUMN IF NOT EXISTS invoice_hash TEXT,
  ADD COLUMN IF NOT EXISTS previous_invoice_hash TEXT,
  ADD COLUMN IF NOT EXISTS cryptographic_stamp TEXT,
  ADD COLUMN IF NOT EXISTS xml_payload TEXT,
  ADD COLUMN IF NOT EXISTS zatca_clearance_status TEXT,
  ADD COLUMN IF NOT EXISTS zatca_reported_at TIMESTAMPTZ;
