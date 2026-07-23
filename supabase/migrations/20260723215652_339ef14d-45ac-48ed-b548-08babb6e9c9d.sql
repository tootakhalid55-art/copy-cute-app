
-- ============================================================
-- Phase C2A — Fixed Assets: Foundation & Registry
-- ============================================================

-- Enums
DO $$ BEGIN
  CREATE TYPE public.fa_depreciation_method AS ENUM (
    'straight_line','declining_balance','double_declining','units_of_production','manual','none'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.fa_status AS ENUM (
    'draft','cip','active','held_for_sale','disposed','retired','written_off'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.fa_revaluation_model AS ENUM ('cost','revaluation');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ------------------------------------------------------------
-- 1) fixed_asset_categories (tree)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fixed_asset_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES public.fixed_asset_categories(id) ON DELETE SET NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  name_en TEXT,
  default_useful_life_months INTEGER,
  default_method public.fa_depreciation_method DEFAULT 'straight_line',
  default_salvage_pct NUMERIC(6,3) DEFAULT 0,
  revaluation_model public.fa_revaluation_model NOT NULL DEFAULT 'cost',
  is_active BOOLEAN NOT NULL DEFAULT true,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fixed_asset_categories TO authenticated;
GRANT ALL ON public.fixed_asset_categories TO service_role;
ALTER TABLE public.fixed_asset_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fac_read" ON public.fixed_asset_categories FOR SELECT TO authenticated USING (public.is_org_member(org_id, auth.uid()));
CREATE POLICY "fac_write" ON public.fixed_asset_categories FOR ALL TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), 'owner') OR public.has_org_role(org_id, auth.uid(), 'admin') OR public.has_org_role(org_id, auth.uid(), 'accountant'))
  WITH CHECK (public.has_org_role(org_id, auth.uid(), 'owner') OR public.has_org_role(org_id, auth.uid(), 'admin') OR public.has_org_role(org_id, auth.uid(), 'accountant'));
CREATE TRIGGER trg_fac_touch BEFORE UPDATE ON public.fixed_asset_categories FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ------------------------------------------------------------
-- 2) fixed_asset_groups (administrative grouping)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fixed_asset_groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  name_en TEXT,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fixed_asset_groups TO authenticated;
GRANT ALL ON public.fixed_asset_groups TO service_role;
ALTER TABLE public.fixed_asset_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fag_read" ON public.fixed_asset_groups FOR SELECT TO authenticated USING (public.is_org_member(org_id, auth.uid()));
CREATE POLICY "fag_write" ON public.fixed_asset_groups FOR ALL TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), 'owner') OR public.has_org_role(org_id, auth.uid(), 'admin') OR public.has_org_role(org_id, auth.uid(), 'accountant'))
  WITH CHECK (public.has_org_role(org_id, auth.uid(), 'owner') OR public.has_org_role(org_id, auth.uid(), 'admin') OR public.has_org_role(org_id, auth.uid(), 'accountant'));
CREATE TRIGGER trg_fag_touch BEFORE UPDATE ON public.fixed_asset_groups FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ------------------------------------------------------------
-- 3) fixed_asset_templates
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fixed_asset_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.fixed_asset_categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  name_en TEXT,
  defaults JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fixed_asset_templates TO authenticated;
GRANT ALL ON public.fixed_asset_templates TO service_role;
ALTER TABLE public.fixed_asset_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fat_read" ON public.fixed_asset_templates FOR SELECT TO authenticated USING (public.is_org_member(org_id, auth.uid()));
CREATE POLICY "fat_write" ON public.fixed_asset_templates FOR ALL TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), 'owner') OR public.has_org_role(org_id, auth.uid(), 'admin') OR public.has_org_role(org_id, auth.uid(), 'accountant'))
  WITH CHECK (public.has_org_role(org_id, auth.uid(), 'owner') OR public.has_org_role(org_id, auth.uid(), 'admin') OR public.has_org_role(org_id, auth.uid(), 'accountant'));
CREATE TRIGGER trg_fat_touch BEFORE UPDATE ON public.fixed_asset_templates FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ------------------------------------------------------------
-- 4) fixed_assets (main register)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fixed_assets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  name_en TEXT,
  description TEXT,

  -- classification
  category_id UUID REFERENCES public.fixed_asset_categories(id) ON DELETE SET NULL,
  group_id UUID REFERENCES public.fixed_asset_groups(id) ON DELETE SET NULL,
  parent_asset_id UUID REFERENCES public.fixed_assets(id) ON DELETE SET NULL,
  is_component BOOLEAN NOT NULL DEFAULT false,

  -- identifiers
  barcode TEXT,
  qr_payload TEXT,
  rfid_tag TEXT,
  serial_number TEXT,
  manufacturer TEXT,
  model TEXT,

  -- warranty
  warranty_from DATE,
  warranty_to DATE,

  -- purchase link
  supplier_party_id UUID REFERENCES public.parties(id) ON DELETE SET NULL,
  purchase_order_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
  bill_document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
  bill_line_id UUID REFERENCES public.document_lines(id) ON DELETE SET NULL,
  ap_intake_document_id UUID REFERENCES public.ap_intake_documents(id) ON DELETE SET NULL,

  -- organizational
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  department TEXT,
  cost_center_id UUID REFERENCES public.cost_centers(id) ON DELETE SET NULL,
  project TEXT,
  custodian_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  custodian_name TEXT,
  location_text TEXT,
  gps_lat NUMERIC(10,6),
  gps_lng NUMERIC(10,6),

  -- accounting
  acquisition_cost NUMERIC(18,4) NOT NULL DEFAULT 0,
  residual_value NUMERIC(18,4) NOT NULL DEFAULT 0,
  useful_life_months INTEGER,
  method public.fa_depreciation_method NOT NULL DEFAULT 'straight_line',
  acquisition_date DATE,
  in_service_date DATE,
  currency TEXT NOT NULL DEFAULT 'SAR',

  -- state
  status public.fa_status NOT NULL DEFAULT 'draft',
  is_cip BOOLEAN NOT NULL DEFAULT false,

  -- rolling figures (maintained by C2B engine; kept here so registry can display)
  accumulated_depreciation NUMERIC(18,4) NOT NULL DEFAULT 0,
  last_depreciation_date DATE,

  -- flexible
  custom JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),

  UNIQUE (org_id, code)
);
CREATE INDEX IF NOT EXISTS idx_fa_org_status ON public.fixed_assets(org_id, status);
CREATE INDEX IF NOT EXISTS idx_fa_org_category ON public.fixed_assets(org_id, category_id);
CREATE INDEX IF NOT EXISTS idx_fa_org_bill ON public.fixed_assets(org_id, bill_document_id);
CREATE INDEX IF NOT EXISTS idx_fa_org_supplier ON public.fixed_assets(org_id, supplier_party_id);
CREATE INDEX IF NOT EXISTS idx_fa_serial ON public.fixed_assets(org_id, serial_number) WHERE serial_number IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fixed_assets TO authenticated;
GRANT ALL ON public.fixed_assets TO service_role;
ALTER TABLE public.fixed_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fa_read" ON public.fixed_assets FOR SELECT TO authenticated USING (public.is_org_member(org_id, auth.uid()));
CREATE POLICY "fa_write" ON public.fixed_assets FOR ALL TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), 'owner') OR public.has_org_role(org_id, auth.uid(), 'admin') OR public.has_org_role(org_id, auth.uid(), 'accountant'))
  WITH CHECK (public.has_org_role(org_id, auth.uid(), 'owner') OR public.has_org_role(org_id, auth.uid(), 'admin') OR public.has_org_role(org_id, auth.uid(), 'accountant'));
CREATE TRIGGER trg_fa_touch BEFORE UPDATE ON public.fixed_assets FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ------------------------------------------------------------
-- 5) fixed_asset_components
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fixed_asset_components (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  parent_asset_id UUID NOT NULL REFERENCES public.fixed_assets(id) ON DELETE CASCADE,
  component_asset_id UUID NOT NULL REFERENCES public.fixed_assets(id) ON DELETE CASCADE,
  cost_share_pct NUMERIC(7,4),
  cost_share_amount NUMERIC(18,4),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (parent_asset_id, component_asset_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fixed_asset_components TO authenticated;
GRANT ALL ON public.fixed_asset_components TO service_role;
ALTER TABLE public.fixed_asset_components ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fac_comp_read" ON public.fixed_asset_components FOR SELECT TO authenticated USING (public.is_org_member(org_id, auth.uid()));
CREATE POLICY "fac_comp_write" ON public.fixed_asset_components FOR ALL TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), 'owner') OR public.has_org_role(org_id, auth.uid(), 'admin') OR public.has_org_role(org_id, auth.uid(), 'accountant'))
  WITH CHECK (public.has_org_role(org_id, auth.uid(), 'owner') OR public.has_org_role(org_id, auth.uid(), 'admin') OR public.has_org_role(org_id, auth.uid(), 'accountant'));
CREATE TRIGGER trg_facomp_touch BEFORE UPDATE ON public.fixed_asset_components FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ------------------------------------------------------------
-- 6) org-level fixed asset settings (capitalization threshold + defaults)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fixed_asset_settings (
  org_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  capitalization_threshold NUMERIC(18,4) NOT NULL DEFAULT 5000,
  default_currency TEXT NOT NULL DEFAULT 'SAR',
  default_convention TEXT NOT NULL DEFAULT 'full_month', -- full_month | mid_month | daily
  default_method public.fa_depreciation_method NOT NULL DEFAULT 'straight_line',
  default_useful_life_months INTEGER NOT NULL DEFAULT 60,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fixed_asset_settings TO authenticated;
GRANT ALL ON public.fixed_asset_settings TO service_role;
ALTER TABLE public.fixed_asset_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fas_read" ON public.fixed_asset_settings FOR SELECT TO authenticated USING (public.is_org_member(org_id, auth.uid()));
CREATE POLICY "fas_write" ON public.fixed_asset_settings FOR ALL TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), 'owner') OR public.has_org_role(org_id, auth.uid(), 'admin'))
  WITH CHECK (public.has_org_role(org_id, auth.uid(), 'owner') OR public.has_org_role(org_id, auth.uid(), 'admin'));
CREATE TRIGGER trg_fas_touch BEFORE UPDATE ON public.fixed_asset_settings FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ------------------------------------------------------------
-- 7) Extend Chart of Accounts with fixed asset accounts (idempotent seed helper)
-- ------------------------------------------------------------
-- Seed additional GL accounts globally for every org that already has base CoA
INSERT INTO public.chart_of_accounts (org_id, code, name, name_en, type, category, is_header, is_active)
SELECT o.id, v.code, v.name, v.name_en, v.type::public.account_type, v.category, false, true
FROM public.organizations o
CROSS JOIN (VALUES
  ('1502','مجمع إهلاك الأصول الثابتة','Accumulated Depreciation','asset','fixed_asset'),
  ('1503','أصول تحت الإنشاء (CIP)','Construction in Progress','asset','fixed_asset'),
  ('6701','مصروف الإهلاك','Depreciation Expense','expense',NULL),
  ('6702','مصروف اضمحلال الأصول','Impairment Expense','expense',NULL),
  ('7201','أرباح بيع أصول ثابتة','Gain on Disposal of Assets','other_income',NULL),
  ('8201','خسائر بيع أصول ثابتة','Loss on Disposal of Assets','other_expense',NULL),
  ('3401','فائض إعادة تقييم الأصول','Revaluation Surplus','equity',NULL)
) AS v(code,name,name_en,type,category)
WHERE EXISTS (SELECT 1 FROM public.chart_of_accounts c WHERE c.org_id=o.id)
  AND NOT EXISTS (SELECT 1 FROM public.chart_of_accounts c WHERE c.org_id=o.id AND c.code=v.code);

-- ------------------------------------------------------------
-- 8) Seed default account determinations for fixed assets
-- ------------------------------------------------------------
INSERT INTO public.account_determinations (org_id, key, account_code, is_active)
SELECT o.id, v.key, v.code, true
FROM public.organizations o
CROSS JOIN (VALUES
  ('fa.cost','1501'),
  ('fa.accumulated_depreciation','1502'),
  ('fa.cip','1503'),
  ('fa.depreciation_expense','6701'),
  ('fa.impairment_expense','6702'),
  ('fa.disposal_gain','7201'),
  ('fa.disposal_loss','8201'),
  ('fa.revaluation_surplus','3401')
) AS v(key,code)
WHERE EXISTS (SELECT 1 FROM public.chart_of_accounts c WHERE c.org_id=o.id AND c.code=v.code)
  AND NOT EXISTS (SELECT 1 FROM public.account_determinations d WHERE d.org_id=o.id AND d.key=v.key AND d.branch_id IS NULL AND d.doc_kind IS NULL);

-- ------------------------------------------------------------
-- 9) Auto-seed settings row on org creation (idempotent for existing orgs)
-- ------------------------------------------------------------
INSERT INTO public.fixed_asset_settings (org_id)
SELECT id FROM public.organizations
ON CONFLICT (org_id) DO NOTHING;

-- ------------------------------------------------------------
-- 10) capitalize_from_bill RPC
--    Creates a fixed_asset row from an AP bill (draft/cip) — no GL posting yet.
--    Depreciation posting comes in C2B.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.capitalize_asset_from_bill(
  _org UUID,
  _bill UUID,
  _payload JSONB
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_bill RECORD;
  v_asset_id UUID;
  v_code TEXT;
  v_fy UUID;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT (public.has_org_role(_org, v_uid,'owner')
       OR public.has_org_role(_org, v_uid,'admin')
       OR public.has_org_role(_org, v_uid,'accountant')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO v_bill FROM public.documents WHERE id=_bill AND org_id=_org;
  IF v_bill.id IS NULL THEN RAISE EXCEPTION 'bill_not_found'; END IF;

  SELECT id INTO v_fy FROM public.fiscal_years
    WHERE org_id=_org AND COALESCE((_payload->>'acquisition_date')::date, v_bill.issue_date) BETWEEN start_date AND end_date
    LIMIT 1;

  v_code := public.next_document_number(_org, v_bill.branch_id, v_fy, 'fixed_asset');

  INSERT INTO public.fixed_assets (
    org_id, code, name, name_en, description,
    category_id, group_id, parent_asset_id, is_component,
    barcode, qr_payload, rfid_tag, serial_number, manufacturer, model,
    warranty_from, warranty_to,
    supplier_party_id, purchase_order_id, bill_document_id, bill_line_id, ap_intake_document_id,
    branch_id, department, cost_center_id, project, custodian_user_id, custodian_name,
    location_text, gps_lat, gps_lng,
    acquisition_cost, residual_value, useful_life_months, method,
    acquisition_date, in_service_date, currency,
    status, is_cip, custom, notes, created_by
  ) VALUES (
    _org, v_code,
    COALESCE(_payload->>'name', 'Asset ' || v_code),
    _payload->>'name_en',
    _payload->>'description',
    NULLIF(_payload->>'category_id','')::uuid,
    NULLIF(_payload->>'group_id','')::uuid,
    NULLIF(_payload->>'parent_asset_id','')::uuid,
    COALESCE((_payload->>'is_component')::boolean,false),
    _payload->>'barcode', _payload->>'qr_payload', _payload->>'rfid_tag',
    _payload->>'serial_number', _payload->>'manufacturer', _payload->>'model',
    NULLIF(_payload->>'warranty_from','')::date,
    NULLIF(_payload->>'warranty_to','')::date,
    v_bill.party_id, NULLIF(_payload->>'purchase_order_id','')::uuid, _bill,
    NULLIF(_payload->>'bill_line_id','')::uuid,
    NULLIF(_payload->>'ap_intake_document_id','')::uuid,
    v_bill.branch_id, _payload->>'department',
    NULLIF(_payload->>'cost_center_id','')::uuid,
    _payload->>'project',
    NULLIF(_payload->>'custodian_user_id','')::uuid,
    _payload->>'custodian_name',
    _payload->>'location_text',
    NULLIF(_payload->>'gps_lat','')::numeric,
    NULLIF(_payload->>'gps_lng','')::numeric,
    COALESCE((_payload->>'acquisition_cost')::numeric, v_bill.grand_total),
    COALESCE((_payload->>'residual_value')::numeric, 0),
    COALESCE((_payload->>'useful_life_months')::integer, 60),
    COALESCE((_payload->>'method')::public.fa_depreciation_method, 'straight_line'::public.fa_depreciation_method),
    COALESCE((_payload->>'acquisition_date')::date, v_bill.issue_date),
    NULLIF(_payload->>'in_service_date','')::date,
    COALESCE(_payload->>'currency', v_bill.currency, 'SAR'),
    CASE WHEN COALESCE((_payload->>'is_cip')::boolean,false) THEN 'cip'::public.fa_status
         WHEN (_payload->>'in_service_date') IS NOT NULL THEN 'active'::public.fa_status
         ELSE 'draft'::public.fa_status END,
    COALESCE((_payload->>'is_cip')::boolean,false),
    COALESCE(_payload->'custom','{}'::jsonb),
    _payload->>'notes',
    v_uid
  ) RETURNING id INTO v_asset_id;

  INSERT INTO public.financial_audit_log(org_id,event_kind,source_document_id,actor_id,after_state)
    VALUES (_org, 'manual_journal_posted', _bill, v_uid,
      jsonb_build_object('event','asset_capitalized','asset_id',v_asset_id,'code',v_code));

  RETURN v_asset_id;
END $$;

-- ------------------------------------------------------------
-- 11) Convenience view: asset overview for the register
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.fixed_assets_overview
WITH (security_invoker = true)
AS
SELECT
  a.id,
  a.org_id,
  a.code,
  a.name,
  a.name_en,
  a.status,
  a.is_cip,
  a.category_id,
  c.name AS category_name,
  a.group_id,
  g.name AS group_name,
  a.acquisition_cost,
  a.residual_value,
  a.accumulated_depreciation,
  GREATEST(a.acquisition_cost - a.accumulated_depreciation, 0) AS net_book_value,
  a.useful_life_months,
  a.method,
  a.acquisition_date,
  a.in_service_date,
  a.branch_id,
  a.cost_center_id,
  a.supplier_party_id,
  p.name AS supplier_name,
  a.bill_document_id,
  a.serial_number,
  a.currency,
  a.custodian_user_id,
  a.custodian_name,
  a.location_text,
  a.warranty_to,
  a.created_at,
  a.updated_at
FROM public.fixed_assets a
LEFT JOIN public.fixed_asset_categories c ON c.id = a.category_id
LEFT JOIN public.fixed_asset_groups g ON g.id = a.group_id
LEFT JOIN public.parties p ON p.id = a.supplier_party_id;

GRANT SELECT ON public.fixed_assets_overview TO authenticated;
