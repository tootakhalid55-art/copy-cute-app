
-- ============================================================
-- Batch 2C.0 — Financial Core Foundation
-- ============================================================

-- Extend app_role with accountant if missing
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'accountant' AND enumtypid = 'public.app_role'::regtype) THEN
    ALTER TYPE public.app_role ADD VALUE 'accountant';
  END IF;
END $$;

-- Enums
DO $$ BEGIN CREATE TYPE public.account_type AS ENUM (
  'asset','liability','equity','revenue','cost_of_sales','expense','other_income','other_expense'
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE public.period_status AS ENUM ('open','closed','locked'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.journal_status AS ENUM ('draft','posted','reversed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.posting_event_type AS ENUM (
  'invoice_posted','payment_created','payment_applied','credit_note_posted',
  'debit_note_posted','inventory_posted','expense_posted','manual_journal'
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ------------------------------------------------------------
-- Cost centers
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cost_centers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  name_en TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  parent_id UUID REFERENCES public.cost_centers(id) ON DELETE SET NULL,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cost_centers TO authenticated;
GRANT ALL ON public.cost_centers TO service_role;
ALTER TABLE public.cost_centers ENABLE ROW LEVEL SECURITY;
CREATE POLICY cc_select ON public.cost_centers FOR SELECT TO authenticated USING (public.is_org_member(org_id, auth.uid()));
CREATE POLICY cc_write ON public.cost_centers FOR ALL TO authenticated
  USING (public.has_org_role(org_id, auth.uid(),'owner') OR public.has_org_role(org_id, auth.uid(),'admin') OR public.has_org_role(org_id, auth.uid(),'accountant'))
  WITH CHECK (public.has_org_role(org_id, auth.uid(),'owner') OR public.has_org_role(org_id, auth.uid(),'admin') OR public.has_org_role(org_id, auth.uid(),'accountant'));
CREATE TRIGGER cc_touch BEFORE UPDATE ON public.cost_centers FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ------------------------------------------------------------
-- Chart of Accounts
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chart_of_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES public.chart_of_accounts(id) ON DELETE RESTRICT,
  code TEXT NOT NULL,          -- account code (e.g., 1100)
  number TEXT,                 -- optional full hierarchical numbering (e.g., 1.1.100)
  name TEXT NOT NULL,
  name_en TEXT,
  type public.account_type NOT NULL,
  category TEXT,               -- e.g., current_asset, fixed_asset
  is_header BOOLEAN NOT NULL DEFAULT FALSE,   -- header (non-posting) accounts
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  currency TEXT NOT NULL DEFAULT 'SAR',
  allow_cost_center BOOLEAN NOT NULL DEFAULT FALSE,
  allow_branch BOOLEAN NOT NULL DEFAULT TRUE,
  opening_balance NUMERIC(18,4) NOT NULL DEFAULT 0,
  description TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, code)
);
CREATE INDEX IF NOT EXISTS coa_org_idx ON public.chart_of_accounts(org_id);
CREATE INDEX IF NOT EXISTS coa_parent_idx ON public.chart_of_accounts(parent_id);
CREATE INDEX IF NOT EXISTS coa_type_idx ON public.chart_of_accounts(org_id, type);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chart_of_accounts TO authenticated;
GRANT ALL ON public.chart_of_accounts TO service_role;
ALTER TABLE public.chart_of_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY coa_select ON public.chart_of_accounts FOR SELECT TO authenticated USING (public.is_org_member(org_id, auth.uid()));
CREATE POLICY coa_write ON public.chart_of_accounts FOR ALL TO authenticated
  USING (public.has_org_role(org_id, auth.uid(),'owner') OR public.has_org_role(org_id, auth.uid(),'admin') OR public.has_org_role(org_id, auth.uid(),'accountant'))
  WITH CHECK (public.has_org_role(org_id, auth.uid(),'owner') OR public.has_org_role(org_id, auth.uid(),'admin') OR public.has_org_role(org_id, auth.uid(),'accountant'));
CREATE TRIGGER coa_touch BEFORE UPDATE ON public.chart_of_accounts FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ------------------------------------------------------------
-- Extend fiscal_years for lock/close/reopen audit
-- ------------------------------------------------------------
ALTER TABLE public.fiscal_years
  ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS reopened_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reopened_by UUID REFERENCES auth.users(id);

-- ------------------------------------------------------------
-- Accounting Periods (monthly)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.accounting_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  fiscal_year_id UUID NOT NULL REFERENCES public.fiscal_years(id) ON DELETE CASCADE,
  period_number INT NOT NULL,       -- 1..12
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status public.period_status NOT NULL DEFAULT 'open',
  closed_at TIMESTAMPTZ,
  closed_by UUID REFERENCES auth.users(id),
  reopened_at TIMESTAMPTZ,
  reopened_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(fiscal_year_id, period_number)
);
CREATE INDEX IF NOT EXISTS ap_org_idx ON public.accounting_periods(org_id);
CREATE INDEX IF NOT EXISTS ap_fy_idx ON public.accounting_periods(fiscal_year_id);
CREATE INDEX IF NOT EXISTS ap_range_idx ON public.accounting_periods(org_id, start_date, end_date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounting_periods TO authenticated;
GRANT ALL ON public.accounting_periods TO service_role;
ALTER TABLE public.accounting_periods ENABLE ROW LEVEL SECURITY;
CREATE POLICY ap_select ON public.accounting_periods FOR SELECT TO authenticated USING (public.is_org_member(org_id, auth.uid()));
CREATE POLICY ap_write ON public.accounting_periods FOR ALL TO authenticated
  USING (public.has_org_role(org_id, auth.uid(),'owner') OR public.has_org_role(org_id, auth.uid(),'admin') OR public.has_org_role(org_id, auth.uid(),'accountant'))
  WITH CHECK (public.has_org_role(org_id, auth.uid(),'owner') OR public.has_org_role(org_id, auth.uid(),'admin') OR public.has_org_role(org_id, auth.uid(),'accountant'));
CREATE TRIGGER ap_touch BEFORE UPDATE ON public.accounting_periods FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ------------------------------------------------------------
-- Posting Rules
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.posting_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_type public.posting_event_type NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  -- Rule config: array of legs [{side:'debit'|'credit', account_code, amount_expr}]
  -- amount_expr references payload keys: subtotal, vat_total, grand_total, amount, etc.
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  priority INT NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pr_org_event_idx ON public.posting_rules(org_id, event_type, is_active);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.posting_rules TO authenticated;
GRANT ALL ON public.posting_rules TO service_role;
ALTER TABLE public.posting_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY pr_select ON public.posting_rules FOR SELECT TO authenticated USING (public.is_org_member(org_id, auth.uid()));
CREATE POLICY pr_write ON public.posting_rules FOR ALL TO authenticated
  USING (public.has_org_role(org_id, auth.uid(),'owner') OR public.has_org_role(org_id, auth.uid(),'admin') OR public.has_org_role(org_id, auth.uid(),'accountant'))
  WITH CHECK (public.has_org_role(org_id, auth.uid(),'owner') OR public.has_org_role(org_id, auth.uid(),'admin') OR public.has_org_role(org_id, auth.uid(),'accountant'));
CREATE TRIGGER pr_touch BEFORE UPDATE ON public.posting_rules FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ------------------------------------------------------------
-- Journal Entries + Lines
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  fiscal_year_id UUID REFERENCES public.fiscal_years(id) ON DELETE RESTRICT,
  period_id UUID REFERENCES public.accounting_periods(id) ON DELETE RESTRICT,
  entry_number TEXT NOT NULL,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  memo TEXT,
  status public.journal_status NOT NULL DEFAULT 'draft',
  -- Currency
  currency TEXT NOT NULL DEFAULT 'SAR',
  exchange_rate NUMERIC(18,6) NOT NULL DEFAULT 1,
  -- Totals (in base currency)
  total_debit NUMERIC(18,4) NOT NULL DEFAULT 0,
  total_credit NUMERIC(18,4) NOT NULL DEFAULT 0,
  -- Source
  source_module TEXT,                -- 'sales','purchases','cash','manual','inventory'
  source_document_type TEXT,         -- 'invoice','bill','payment','credit_note',...
  source_document_id UUID,           -- reference to documents.id (nullable)
  event_type public.posting_event_type,
  event_id TEXT,                     -- idempotency key for the originating event
  -- Reversal linkage
  reversed_by_entry_id UUID REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  reverses_entry_id UUID REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  -- Audit
  created_by UUID NOT NULL REFERENCES auth.users(id),
  posted_by UUID REFERENCES auth.users(id),
  posted_at TIMESTAMPTZ,
  reversed_by UUID REFERENCES auth.users(id),
  reversed_at TIMESTAMPTZ,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, entry_number)
);
CREATE INDEX IF NOT EXISTS je_org_date_idx ON public.journal_entries(org_id, entry_date);
CREATE INDEX IF NOT EXISTS je_period_idx ON public.journal_entries(period_id);
CREATE INDEX IF NOT EXISTS je_source_idx ON public.journal_entries(source_document_id);
CREATE INDEX IF NOT EXISTS je_status_idx ON public.journal_entries(org_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS je_event_idem_idx ON public.journal_entries(org_id, event_id) WHERE event_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.journal_entries TO authenticated;
GRANT ALL ON public.journal_entries TO service_role;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY je_select ON public.journal_entries FOR SELECT TO authenticated USING (public.is_org_member(org_id, auth.uid()));
CREATE POLICY je_write ON public.journal_entries FOR ALL TO authenticated
  USING (public.has_org_role(org_id, auth.uid(),'owner') OR public.has_org_role(org_id, auth.uid(),'admin') OR public.has_org_role(org_id, auth.uid(),'accountant'))
  WITH CHECK (public.has_org_role(org_id, auth.uid(),'owner') OR public.has_org_role(org_id, auth.uid(),'admin') OR public.has_org_role(org_id, auth.uid(),'accountant'));

-- Journal Lines
CREATE TABLE IF NOT EXISTS public.journal_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  line_no INT NOT NULL,
  account_id UUID NOT NULL REFERENCES public.chart_of_accounts(id) ON DELETE RESTRICT,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  cost_center_id UUID REFERENCES public.cost_centers(id) ON DELETE SET NULL,
  party_id UUID REFERENCES public.parties(id) ON DELETE SET NULL,
  description TEXT,
  -- foreign amounts
  currency TEXT NOT NULL DEFAULT 'SAR',
  exchange_rate NUMERIC(18,6) NOT NULL DEFAULT 1,
  debit_fc NUMERIC(18,4) NOT NULL DEFAULT 0,
  credit_fc NUMERIC(18,4) NOT NULL DEFAULT 0,
  -- base amounts
  debit NUMERIC(18,4) NOT NULL DEFAULT 0,
  credit NUMERIC(18,4) NOT NULL DEFAULT 0,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (debit >= 0 AND credit >= 0),
  CHECK (NOT (debit > 0 AND credit > 0))
);
CREATE INDEX IF NOT EXISTS jl_entry_idx ON public.journal_lines(entry_id);
CREATE INDEX IF NOT EXISTS jl_account_idx ON public.journal_lines(account_id);
CREATE INDEX IF NOT EXISTS jl_org_idx ON public.journal_lines(org_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.journal_lines TO authenticated;
GRANT ALL ON public.journal_lines TO service_role;
ALTER TABLE public.journal_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY jl_select ON public.journal_lines FOR SELECT TO authenticated USING (public.is_org_member(org_id, auth.uid()));
CREATE POLICY jl_write ON public.journal_lines FOR ALL TO authenticated
  USING (public.has_org_role(org_id, auth.uid(),'owner') OR public.has_org_role(org_id, auth.uid(),'admin') OR public.has_org_role(org_id, auth.uid(),'accountant'))
  WITH CHECK (public.has_org_role(org_id, auth.uid(),'owner') OR public.has_org_role(org_id, auth.uid(),'admin') OR public.has_org_role(org_id, auth.uid(),'accountant'));

-- ------------------------------------------------------------
-- Posting Events (idempotent event log)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.posting_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_type public.posting_event_type NOT NULL,
  event_key TEXT NOT NULL,        -- idempotency key
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending|processed|failed
  error TEXT,
  journal_entry_id UUID REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  source_module TEXT,
  source_document_id UUID,
  created_by UUID REFERENCES auth.users(id),
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, event_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.posting_events TO authenticated;
GRANT ALL ON public.posting_events TO service_role;
ALTER TABLE public.posting_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY pe_select ON public.posting_events FOR SELECT TO authenticated USING (public.is_org_member(org_id, auth.uid()));
CREATE POLICY pe_write ON public.posting_events FOR ALL TO authenticated
  USING (public.has_org_role(org_id, auth.uid(),'owner') OR public.has_org_role(org_id, auth.uid(),'admin') OR public.has_org_role(org_id, auth.uid(),'accountant'))
  WITH CHECK (public.has_org_role(org_id, auth.uid(),'owner') OR public.has_org_role(org_id, auth.uid(),'admin') OR public.has_org_role(org_id, auth.uid(),'accountant'));

-- ------------------------------------------------------------
-- Helper functions
-- ------------------------------------------------------------

-- Find open period for a given org+date
CREATE OR REPLACE FUNCTION public.find_open_period(_org UUID, _date DATE)
RETURNS TABLE(period_id UUID, fiscal_year_id UUID, status public.period_status)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ap.id, ap.fiscal_year_id, ap.status
  FROM public.accounting_periods ap
  WHERE ap.org_id = _org AND _date BETWEEN ap.start_date AND ap.end_date
  LIMIT 1;
$$;

-- Post a journal entry atomically. Payload:
-- { entry_date, memo, currency, exchange_rate, source_module, source_document_type,
--   source_document_id, event_type, event_id, branch_id,
--   lines: [{ account_code, debit, credit, description, cost_center_code, branch_id, party_id, currency, exchange_rate }] }
CREATE OR REPLACE FUNCTION public.post_journal(_org UUID, _payload JSONB)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_entry_id UUID;
  v_entry_number TEXT;
  v_date DATE := COALESCE((_payload->>'entry_date')::date, CURRENT_DATE);
  v_rate NUMERIC := COALESCE((_payload->>'exchange_rate')::numeric, 1);
  v_currency TEXT := COALESCE(_payload->>'currency', 'SAR');
  v_period RECORD;
  v_line JSONB;
  v_account RECORD;
  v_cc UUID;
  v_debit NUMERIC;
  v_credit NUMERIC;
  v_debit_fc NUMERIC;
  v_credit_fc NUMERIC;
  v_line_currency TEXT;
  v_line_rate NUMERIC;
  v_total_debit NUMERIC := 0;
  v_total_credit NUMERIC := 0;
  v_line_no INT := 0;
  v_event_id TEXT := _payload->>'event_id';
  v_existing UUID;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT (public.has_org_role(_org, v_uid,'owner') OR public.has_org_role(_org, v_uid,'admin') OR public.has_org_role(_org, v_uid,'accountant')) THEN
    RAISE EXCEPTION 'forbidden: missing accountant role';
  END IF;

  -- Idempotency
  IF v_event_id IS NOT NULL THEN
    SELECT id INTO v_existing FROM public.journal_entries WHERE org_id=_org AND event_id=v_event_id;
    IF v_existing IS NOT NULL THEN
      RETURN v_existing;
    END IF;
  END IF;

  -- Resolve period
  SELECT * INTO v_period FROM public.find_open_period(_org, v_date);
  IF v_period.period_id IS NULL THEN
    RAISE EXCEPTION 'no_period_for_date: %', v_date;
  END IF;
  IF v_period.status <> 'open' THEN
    RAISE EXCEPTION 'period_closed_or_locked: %', v_period.status;
  END IF;

  -- Fiscal year lock check
  IF EXISTS (SELECT 1 FROM public.fiscal_years fy WHERE fy.id = v_period.fiscal_year_id AND (fy.is_locked OR fy.is_closed)) THEN
    RAISE EXCEPTION 'fiscal_year_locked';
  END IF;

  -- Generate entry number
  v_entry_number := 'JE-' || to_char(now(),'YYYYMM') || '-' || substr(replace(gen_random_uuid()::text,'-',''),1,8);

  INSERT INTO public.journal_entries(
    org_id, branch_id, fiscal_year_id, period_id, entry_number, entry_date, memo, status,
    currency, exchange_rate, source_module, source_document_type, source_document_id,
    event_type, event_id, created_by, posted_by, posted_at, meta
  ) VALUES (
    _org,
    NULLIF(_payload->>'branch_id','')::uuid,
    v_period.fiscal_year_id, v_period.period_id, v_entry_number, v_date,
    _payload->>'memo', 'posted',
    v_currency, v_rate,
    _payload->>'source_module', _payload->>'source_document_type',
    NULLIF(_payload->>'source_document_id','')::uuid,
    NULLIF(_payload->>'event_type','')::public.posting_event_type,
    v_event_id, v_uid, v_uid, now(),
    COALESCE(_payload->'meta','{}'::jsonb)
  ) RETURNING id INTO v_entry_id;

  -- Insert lines
  FOR v_line IN SELECT * FROM jsonb_array_elements(_payload->'lines') LOOP
    v_line_no := v_line_no + 1;
    SELECT * INTO v_account FROM public.chart_of_accounts
      WHERE org_id=_org AND code = v_line->>'account_code';
    IF v_account.id IS NULL THEN RAISE EXCEPTION 'account_not_found: %', v_line->>'account_code'; END IF;
    IF v_account.is_header THEN RAISE EXCEPTION 'cannot_post_to_header_account: %', v_account.code; END IF;
    IF NOT v_account.is_active THEN RAISE EXCEPTION 'account_inactive: %', v_account.code; END IF;

    v_cc := NULL;
    IF (v_line ? 'cost_center_code') AND (v_line->>'cost_center_code') <> '' THEN
      SELECT id INTO v_cc FROM public.cost_centers WHERE org_id=_org AND code = v_line->>'cost_center_code';
    END IF;

    v_line_currency := COALESCE(v_line->>'currency', v_currency);
    v_line_rate := COALESCE((v_line->>'exchange_rate')::numeric, v_rate);
    v_debit_fc  := COALESCE((v_line->>'debit')::numeric, 0);
    v_credit_fc := COALESCE((v_line->>'credit')::numeric, 0);
    v_debit  := ROUND(v_debit_fc  * v_line_rate, 4);
    v_credit := ROUND(v_credit_fc * v_line_rate, 4);

    IF v_debit > 0 AND v_credit > 0 THEN
      RAISE EXCEPTION 'line_debit_and_credit_both_set';
    END IF;
    IF v_debit = 0 AND v_credit = 0 THEN
      RAISE EXCEPTION 'line_zero_amount';
    END IF;

    INSERT INTO public.journal_lines(
      entry_id, org_id, line_no, account_id, branch_id, cost_center_id, party_id,
      description, currency, exchange_rate,
      debit_fc, credit_fc, debit, credit, meta
    ) VALUES (
      v_entry_id, _org, v_line_no, v_account.id,
      NULLIF(v_line->>'branch_id','')::uuid, v_cc,
      NULLIF(v_line->>'party_id','')::uuid,
      v_line->>'description', v_line_currency, v_line_rate,
      v_debit_fc, v_credit_fc, v_debit, v_credit,
      COALESCE(v_line->'meta','{}'::jsonb)
    );
    v_total_debit  := v_total_debit + v_debit;
    v_total_credit := v_total_credit + v_credit;
  END LOOP;

  IF v_line_no < 2 THEN RAISE EXCEPTION 'journal_needs_at_least_two_lines'; END IF;
  IF ROUND(v_total_debit,2) <> ROUND(v_total_credit,2) THEN
    RAISE EXCEPTION 'journal_unbalanced: debit=% credit=%', v_total_debit, v_total_credit;
  END IF;

  UPDATE public.journal_entries
    SET total_debit = v_total_debit, total_credit = v_total_credit
    WHERE id = v_entry_id;

  RETURN v_entry_id;
END; $$;

-- Reverse a posted journal entry: creates a new balanced entry with swapped debits/credits.
CREATE OR REPLACE FUNCTION public.reverse_journal(_org UUID, _entry_id UUID, _memo TEXT DEFAULT NULL, _date DATE DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_src public.journal_entries%ROWTYPE;
  v_new_id UUID;
  v_payload JSONB;
  v_lines JSONB := '[]'::jsonb;
  v_line RECORD;
  v_date DATE := COALESCE(_date, CURRENT_DATE);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT (public.has_org_role(_org, v_uid,'owner') OR public.has_org_role(_org, v_uid,'admin') OR public.has_org_role(_org, v_uid,'accountant')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO v_src FROM public.journal_entries WHERE id=_entry_id AND org_id=_org;
  IF v_src.id IS NULL THEN RAISE EXCEPTION 'entry_not_found'; END IF;
  IF v_src.status <> 'posted' THEN RAISE EXCEPTION 'only_posted_entries_can_be_reversed'; END IF;
  IF v_src.reversed_by_entry_id IS NOT NULL THEN RAISE EXCEPTION 'entry_already_reversed'; END IF;

  FOR v_line IN
    SELECT jl.*, coa.code AS account_code, cc.code AS cost_center_code
    FROM public.journal_lines jl
    JOIN public.chart_of_accounts coa ON coa.id = jl.account_id
    LEFT JOIN public.cost_centers cc ON cc.id = jl.cost_center_id
    WHERE jl.entry_id = _entry_id ORDER BY jl.line_no
  LOOP
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'account_code', v_line.account_code,
      'debit',  v_line.credit_fc,
      'credit', v_line.debit_fc,
      'currency', v_line.currency,
      'exchange_rate', v_line.exchange_rate,
      'description', COALESCE(v_line.description, '') || ' (reversal)',
      'cost_center_code', v_line.cost_center_code,
      'branch_id', v_line.branch_id,
      'party_id', v_line.party_id
    ));
  END LOOP;

  v_payload := jsonb_build_object(
    'entry_date', v_date,
    'memo', COALESCE(_memo, 'Reversal of ' || v_src.entry_number),
    'currency', v_src.currency,
    'exchange_rate', v_src.exchange_rate,
    'source_module', v_src.source_module,
    'source_document_type', v_src.source_document_type,
    'source_document_id', v_src.source_document_id,
    'event_type', 'manual_journal',
    'branch_id', v_src.branch_id,
    'lines', v_lines
  );

  v_new_id := public.post_journal(_org, v_payload);

  UPDATE public.journal_entries
    SET reverses_entry_id = _entry_id
    WHERE id = v_new_id;
  UPDATE public.journal_entries
    SET status='reversed', reversed_by_entry_id = v_new_id, reversed_by = v_uid, reversed_at = now()
    WHERE id = _entry_id;

  RETURN v_new_id;
END; $$;

-- Prevent edits/deletes of posted or reversed journal entries and their lines
CREATE OR REPLACE FUNCTION public.journal_entries_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('posted','reversed') THEN
      RAISE EXCEPTION 'cannot_delete_posted_or_reversed_journal';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    -- allow only status transitions (posted -> reversed) and totals set by post_journal.
    IF OLD.status = 'posted' AND NEW.status NOT IN ('posted','reversed') THEN
      RAISE EXCEPTION 'invalid_journal_status_transition';
    END IF;
    IF OLD.status = 'reversed' AND OLD.* IS DISTINCT FROM NEW.* THEN
      -- Allow only reversed_by_entry_id backfill; be permissive but block financial edits
      IF OLD.total_debit <> NEW.total_debit OR OLD.total_credit <> NEW.total_credit
         OR OLD.entry_date <> NEW.entry_date OR OLD.currency <> NEW.currency THEN
        RAISE EXCEPTION 'cannot_edit_reversed_journal';
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS je_guard ON public.journal_entries;
CREATE TRIGGER je_guard BEFORE UPDATE OR DELETE ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.journal_entries_guard();

CREATE OR REPLACE FUNCTION public.journal_lines_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_status public.journal_status;
BEGIN
  IF TG_OP = 'INSERT' THEN RETURN NEW; END IF;
  SELECT status INTO v_status FROM public.journal_entries WHERE id = COALESCE(NEW.entry_id, OLD.entry_id);
  IF v_status IN ('posted','reversed') THEN
    RAISE EXCEPTION 'cannot_modify_lines_of_posted_journal';
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $$;

DROP TRIGGER IF EXISTS jl_guard ON public.journal_lines;
CREATE TRIGGER jl_guard BEFORE UPDATE OR DELETE ON public.journal_lines
  FOR EACH ROW EXECUTE FUNCTION public.journal_lines_guard();

-- Update timestamp trigger for journal_entries
DROP TRIGGER IF EXISTS je_touch ON public.journal_entries;
CREATE TRIGGER je_touch BEFORE UPDATE ON public.journal_entries FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ------------------------------------------------------------
-- Period close / reopen helpers
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.close_accounting_period(_org UUID, _period_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid UUID := auth.uid();
BEGIN
  IF NOT (public.has_org_role(_org, v_uid,'owner') OR public.has_org_role(_org, v_uid,'admin')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.accounting_periods
    SET status='closed', closed_at=now(), closed_by=v_uid
    WHERE id=_period_id AND org_id=_org;
END; $$;

CREATE OR REPLACE FUNCTION public.reopen_accounting_period(_org UUID, _period_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid UUID := auth.uid();
BEGIN
  IF NOT public.has_org_role(_org, v_uid,'owner') THEN
    RAISE EXCEPTION 'forbidden: owner only';
  END IF;
  UPDATE public.accounting_periods
    SET status='open', reopened_at=now(), reopened_by=v_uid
    WHERE id=_period_id AND org_id=_org AND status <> 'locked';
END; $$;

-- Auto-generate 12 monthly periods when a fiscal year is inserted
CREATE OR REPLACE FUNCTION public.fiscal_year_create_periods()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE i INT; v_start DATE; v_end DATE;
BEGIN
  FOR i IN 0..11 LOOP
    v_start := (NEW.start_date + (i || ' months')::interval)::date;
    v_end := (v_start + interval '1 month' - interval '1 day')::date;
    IF v_end > NEW.end_date THEN v_end := NEW.end_date; END IF;
    IF v_start > NEW.end_date THEN EXIT; END IF;
    INSERT INTO public.accounting_periods(org_id, fiscal_year_id, period_number, name, start_date, end_date, status)
    VALUES (NEW.org_id, NEW.id, i+1,
      to_char(v_start,'Mon YYYY'),
      v_start, v_end, 'open')
    ON CONFLICT DO NOTHING;
  END LOOP;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS fy_create_periods ON public.fiscal_years;
CREATE TRIGGER fy_create_periods AFTER INSERT ON public.fiscal_years
  FOR EACH ROW EXECUTE FUNCTION public.fiscal_year_create_periods();

-- Seed periods for existing fiscal_years missing them
INSERT INTO public.accounting_periods(org_id, fiscal_year_id, period_number, name, start_date, end_date, status)
SELECT fy.org_id, fy.id, gs+1,
  to_char((fy.start_date + (gs || ' months')::interval)::date,'Mon YYYY'),
  (fy.start_date + (gs || ' months')::interval)::date,
  LEAST((fy.start_date + ((gs+1) || ' months')::interval - interval '1 day')::date, fy.end_date),
  'open'
FROM public.fiscal_years fy
CROSS JOIN generate_series(0,11) gs
WHERE (fy.start_date + (gs || ' months')::interval)::date <= fy.end_date
  AND NOT EXISTS (
    SELECT 1 FROM public.accounting_periods ap
    WHERE ap.fiscal_year_id = fy.id AND ap.period_number = gs+1
  );
