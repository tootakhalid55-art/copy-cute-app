
ALTER TYPE public.posting_event_type ADD VALUE IF NOT EXISTS 'receipt_created';
ALTER TYPE public.posting_event_type ADD VALUE IF NOT EXISTS 'payment_allocated';
ALTER TYPE public.posting_event_type ADD VALUE IF NOT EXISTS 'bank_transfer';
ALTER TYPE public.posting_event_type ADD VALUE IF NOT EXISTS 'bank_charge';
ALTER TYPE public.posting_event_type ADD VALUE IF NOT EXISTS 'bank_interest';
ALTER TYPE public.posting_event_type ADD VALUE IF NOT EXISTS 'cash_adjustment';
ALTER TYPE public.posting_event_type ADD VALUE IF NOT EXISTS 'writeoff_created';
ALTER TYPE public.posting_event_type ADD VALUE IF NOT EXISTS 'refund_created';
ALTER TYPE public.posting_event_type ADD VALUE IF NOT EXISTS 'advance_created';

DO $$ BEGIN CREATE TYPE public.cash_account_kind AS ENUM ('cash','bank'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.cash_txn_kind AS ENUM ('deposit','withdrawal','transfer_in','transfer_out','bank_charge','interest','adjustment','payment_out','receipt_in'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.cash_bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.branches(id),
  kind public.cash_account_kind NOT NULL,
  name TEXT NOT NULL, name_en TEXT,
  currency TEXT NOT NULL DEFAULT 'SAR',
  bank_name TEXT, iban TEXT, account_number TEXT,
  gl_account_code TEXT NOT NULL,
  opening_balance NUMERIC(18,4) NOT NULL DEFAULT 0,
  opening_date DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  meta JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_bank_accounts TO authenticated;
GRANT ALL ON public.cash_bank_accounts TO service_role;
ALTER TABLE public.cash_bank_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY cba_org_read ON public.cash_bank_accounts FOR SELECT TO authenticated USING (public.is_org_member(org_id, auth.uid()));
CREATE POLICY cba_org_write ON public.cash_bank_accounts FOR ALL TO authenticated USING (public.is_org_member(org_id, auth.uid())) WITH CHECK (public.is_org_member(org_id, auth.uid()));
CREATE TRIGGER trg_cba_touch BEFORE UPDATE ON public.cash_bank_accounts FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.cash_bank_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.branches(id),
  account_id UUID NOT NULL REFERENCES public.cash_bank_accounts(id) ON DELETE RESTRICT,
  counter_account_id UUID REFERENCES public.cash_bank_accounts(id),
  kind public.cash_txn_kind NOT NULL,
  txn_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC(18,4) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'SAR',
  exchange_rate NUMERIC(18,8) NOT NULL DEFAULT 1,
  reference TEXT, memo TEXT,
  party_id UUID REFERENCES public.parties(id),
  source_document_id UUID REFERENCES public.documents(id),
  journal_entry_id UUID REFERENCES public.journal_entries(id),
  reconciled BOOLEAN NOT NULL DEFAULT false,
  reconciled_at TIMESTAMPTZ, reconciled_by UUID,
  meta JSONB NOT NULL DEFAULT '{}',
  created_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_bank_transactions TO authenticated;
GRANT ALL ON public.cash_bank_transactions TO service_role;
ALTER TABLE public.cash_bank_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY cbt_org_read ON public.cash_bank_transactions FOR SELECT TO authenticated USING (public.is_org_member(org_id, auth.uid()));
CREATE POLICY cbt_org_write ON public.cash_bank_transactions FOR ALL TO authenticated USING (public.is_org_member(org_id, auth.uid())) WITH CHECK (public.is_org_member(org_id, auth.uid()));
CREATE TRIGGER trg_cbt_touch BEFORE UPDATE ON public.cash_bank_transactions FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX IF NOT EXISTS idx_cbt_org_account_date ON public.cash_bank_transactions(org_id, account_id, txn_date);
CREATE INDEX IF NOT EXISTS idx_cbt_org_party_date ON public.cash_bank_transactions(org_id, party_id, txn_date);
CREATE INDEX IF NOT EXISTS idx_cbt_source_doc ON public.cash_bank_transactions(source_document_id);
CREATE INDEX IF NOT EXISTS idx_cbt_reconciled ON public.cash_bank_transactions(org_id, account_id, reconciled);

DO $$ BEGIN CREATE TYPE public.allocation_source_kind AS ENUM ('customer_payment','supplier_payment','receipt','credit_note','debit_note','advance','writeoff','refund'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.allocation_target_kind AS ENUM ('invoice','bill','credit_note','debit_note','advance'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.payment_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.branches(id),
  party_id UUID REFERENCES public.parties(id),
  source_kind public.allocation_source_kind NOT NULL,
  source_document_id UUID REFERENCES public.documents(id) ON DELETE RESTRICT,
  target_kind public.allocation_target_kind NOT NULL,
  target_document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE RESTRICT,
  amount NUMERIC(18,4) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'SAR',
  exchange_rate NUMERIC(18,8) NOT NULL DEFAULT 1,
  allocation_date DATE NOT NULL DEFAULT CURRENT_DATE,
  journal_entry_id UUID REFERENCES public.journal_entries(id),
  memo TEXT,
  meta JSONB NOT NULL DEFAULT '{}',
  created_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_allocations TO authenticated;
GRANT ALL ON public.payment_allocations TO service_role;
ALTER TABLE public.payment_allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY pa_org_read ON public.payment_allocations FOR SELECT TO authenticated USING (public.is_org_member(org_id, auth.uid()));
CREATE POLICY pa_org_write ON public.payment_allocations FOR ALL TO authenticated USING (public.is_org_member(org_id, auth.uid())) WITH CHECK (public.is_org_member(org_id, auth.uid()));
CREATE TRIGGER trg_pa_touch BEFORE UPDATE ON public.payment_allocations FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX IF NOT EXISTS idx_pa_org_target ON public.payment_allocations(org_id, target_document_id);
CREATE INDEX IF NOT EXISTS idx_pa_org_source ON public.payment_allocations(org_id, source_document_id);
CREATE INDEX IF NOT EXISTS idx_pa_org_party_date ON public.payment_allocations(org_id, party_id, allocation_date);

CREATE INDEX IF NOT EXISTS idx_documents_org_party_kind_status ON public.documents(org_id, party_id, kind, status);
CREATE INDEX IF NOT EXISTS idx_documents_org_kind_issue ON public.documents(org_id, kind, issue_date);

ALTER TABLE public.parties ADD COLUMN IF NOT EXISTS credit_limit NUMERIC(18,4);
ALTER TABLE public.parties ADD COLUMN IF NOT EXISTS credit_hold BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE VIEW public.document_open_balances
WITH (security_invoker = true) AS
WITH alloc AS (
  SELECT target_document_id AS doc_id, COALESCE(SUM(amount),0) AS allocated_in
  FROM public.payment_allocations GROUP BY target_document_id
),
consumed AS (
  SELECT source_document_id AS doc_id, COALESCE(SUM(amount),0) AS consumed_out
  FROM public.payment_allocations WHERE source_document_id IS NOT NULL GROUP BY source_document_id
)
SELECT
  d.id AS document_id, d.org_id, d.party_id, d.branch_id, d.kind::text AS kind, d.status::text AS status,
  d.issue_date, d.due_date, d.currency, d.grand_total AS original_amount,
  COALESCE(a.allocated_in, 0) AS allocated_amount,
  COALESCE(c.consumed_out, 0) AS consumed_amount,
  GREATEST(d.grand_total - COALESCE(a.allocated_in,0), 0) AS open_as_target,
  GREATEST(d.grand_total - COALESCE(c.consumed_out,0), 0) AS unapplied_as_source
FROM public.documents d
LEFT JOIN alloc a ON a.doc_id = d.id
LEFT JOIN consumed c ON c.doc_id = d.id;
GRANT SELECT ON public.document_open_balances TO authenticated;

CREATE OR REPLACE VIEW public.party_balances
WITH (security_invoker = true) AS
SELECT
  b.org_id, b.party_id, p.type AS party_type,
  SUM(
    CASE
      WHEN b.kind IN ('invoice','debit_note')      THEN  b.open_as_target
      WHEN b.kind = 'credit_note'                  THEN -b.open_as_target
      WHEN b.kind IN ('customer_payment','receipt') THEN -b.unapplied_as_source
      WHEN b.kind IN ('bill','supplier_debit_note') THEN -b.open_as_target
      WHEN b.kind = 'supplier_credit_note'         THEN  b.open_as_target
      WHEN b.kind = 'supplier_payment'             THEN  b.unapplied_as_source
      WHEN b.kind = 'advance' AND p.type = 'supplier' THEN  b.unapplied_as_source
      WHEN b.kind = 'advance'                      THEN -b.unapplied_as_source
      ELSE 0
    END
  ) AS balance
FROM public.document_open_balances b
JOIN public.parties p ON p.id = b.party_id
WHERE b.party_id IS NOT NULL
GROUP BY b.org_id, b.party_id, p.type;
GRANT SELECT ON public.party_balances TO authenticated;

CREATE OR REPLACE VIEW public.cash_bank_balances
WITH (security_invoker = true) AS
SELECT
  a.id AS account_id, a.org_id, a.name, a.currency, a.kind,
  a.opening_balance + COALESCE(SUM(t.amount), 0) AS balance,
  a.opening_balance + COALESCE(SUM(t.amount) FILTER (WHERE t.reconciled), 0) AS reconciled_balance
FROM public.cash_bank_accounts a
LEFT JOIN public.cash_bank_transactions t ON t.account_id = a.id
GROUP BY a.id;
GRANT SELECT ON public.cash_bank_balances TO authenticated;

CREATE OR REPLACE FUNCTION public.get_document_open_balance(_org UUID, _doc UUID)
RETURNS NUMERIC LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT COALESCE(open_as_target,0) FROM public.document_open_balances WHERE org_id=_org AND document_id=_doc
$$;

CREATE OR REPLACE FUNCTION public.get_party_balance(_org UUID, _party UUID)
RETURNS NUMERIC LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT COALESCE(balance,0) FROM public.party_balances WHERE org_id=_org AND party_id=_party
$$;

CREATE OR REPLACE FUNCTION public.get_aging_buckets(_org UUID, _party_type TEXT DEFAULT NULL, _asof DATE DEFAULT CURRENT_DATE)
RETURNS TABLE(party_id UUID, current_amt NUMERIC, d1_30 NUMERIC, d31_60 NUMERIC, d61_90 NUMERIC, d91_plus NUMERIC, total NUMERIC)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT
    b.party_id,
    SUM(CASE WHEN (_asof - COALESCE(b.due_date,b.issue_date)) <= 0 THEN b.open_as_target ELSE 0 END),
    SUM(CASE WHEN (_asof - COALESCE(b.due_date,b.issue_date)) BETWEEN 1 AND 30 THEN b.open_as_target ELSE 0 END),
    SUM(CASE WHEN (_asof - COALESCE(b.due_date,b.issue_date)) BETWEEN 31 AND 60 THEN b.open_as_target ELSE 0 END),
    SUM(CASE WHEN (_asof - COALESCE(b.due_date,b.issue_date)) BETWEEN 61 AND 90 THEN b.open_as_target ELSE 0 END),
    SUM(CASE WHEN (_asof - COALESCE(b.due_date,b.issue_date)) > 90 THEN b.open_as_target ELSE 0 END),
    SUM(b.open_as_target)
  FROM public.document_open_balances b
  JOIN public.parties p ON p.id = b.party_id
  WHERE b.org_id=_org AND (_party_type IS NULL OR p.type::text=_party_type)
    AND b.kind IN ('invoice','bill','debit_note') AND b.open_as_target > 0
  GROUP BY b.party_id
$$;

CREATE OR REPLACE FUNCTION public.validate_posting(_org UUID, _payload JSONB)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  errs TEXT[] := ARRAY[]::TEXT[];
  v_date DATE := COALESCE((_payload->>'entry_date')::date, CURRENT_DATE);
  v_branch UUID := NULLIF(_payload->>'branch_id','')::uuid;
  v_party UUID := NULLIF(_payload->>'party_id','')::uuid;
  v_currency TEXT := COALESCE(_payload->>'currency','SAR');
  v_rate NUMERIC := COALESCE((_payload->>'exchange_rate')::numeric,1);
  v_doc_id UUID := NULLIF(_payload->>'source_document_id','')::uuid;
  v_doc RECORD; v_period RECORD;
BEGIN
  IF v_branch IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.branches WHERE id=v_branch AND org_id=_org) THEN errs := errs||'branch_not_found'; END IF;
  IF v_party IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.parties WHERE id=v_party AND org_id=_org) THEN errs := errs||'party_not_found'; END IF;
  IF v_rate IS NULL OR v_rate <= 0 THEN errs := errs||'invalid_exchange_rate'; END IF;
  IF v_currency IS NULL OR length(v_currency)<>3 THEN errs := errs||'invalid_currency'; END IF;
  SELECT * INTO v_period FROM public.find_open_period(_org, v_date);
  IF v_period.period_id IS NULL THEN errs := errs||'no_period_for_date';
  ELSIF v_period.status <> 'open' THEN errs := errs||('period_'||v_period.status::text); END IF;
  IF v_doc_id IS NOT NULL THEN
    SELECT * INTO v_doc FROM public.documents WHERE id=v_doc_id AND org_id=_org;
    IF v_doc.id IS NULL THEN errs := errs||'source_document_not_found';
    ELSIF v_doc.status::text NOT IN ('approved','issued','posted','partially_paid','paid') THEN
      errs := errs||('source_document_not_approved:'||v_doc.status::text);
    END IF;
  END IF;
  RETURN jsonb_build_object('ok', array_length(errs,1) IS NULL, 'errors', to_jsonb(errs));
END $$;

CREATE OR REPLACE FUNCTION public.allocate_payment(_org UUID, _payload JSONB)
RETURNS UUID[] LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_source_id UUID := NULLIF(_payload->>'source_document_id','')::uuid;
  v_source_kind public.allocation_source_kind := (_payload->>'source_kind')::public.allocation_source_kind;
  v_party UUID := NULLIF(_payload->>'party_id','')::uuid;
  v_branch UUID := NULLIF(_payload->>'branch_id','')::uuid;
  v_currency TEXT := COALESCE(_payload->>'currency','SAR');
  v_rate NUMERIC := COALESCE((_payload->>'exchange_rate')::numeric,1);
  v_date DATE := COALESCE((_payload->>'allocation_date')::date, CURRENT_DATE);
  v_line JSONB; v_ids UUID[] := ARRAY[]::UUID[]; v_new_id UUID;
  v_target_kind public.allocation_target_kind; v_target_id UUID;
  v_amount NUMERIC; v_open NUMERIC; v_unapplied NUMERIC;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT (public.has_org_role(_org,v_uid,'owner') OR public.has_org_role(_org,v_uid,'admin') OR public.has_org_role(_org,v_uid,'accountant')) THEN
    RAISE EXCEPTION 'forbidden: allocation requires accountant role';
  END IF;
  IF v_source_id IS NOT NULL THEN
    SELECT unapplied_as_source INTO v_unapplied FROM public.document_open_balances WHERE org_id=_org AND document_id=v_source_id;
    IF v_unapplied IS NULL THEN RAISE EXCEPTION 'source_document_not_found'; END IF;
  END IF;
  FOR v_line IN SELECT * FROM jsonb_array_elements(_payload->'allocations') LOOP
    v_target_kind := (v_line->>'target_kind')::public.allocation_target_kind;
    v_target_id := (v_line->>'target_document_id')::uuid;
    v_amount := (v_line->>'amount')::numeric;
    IF v_amount IS NULL OR v_amount <= 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;
    SELECT open_as_target INTO v_open FROM public.document_open_balances WHERE org_id=_org AND document_id=v_target_id;
    IF v_open IS NULL THEN RAISE EXCEPTION 'target_not_found:%', v_target_id; END IF;
    IF ROUND(v_amount,2) > ROUND(v_open,2)+0.01 THEN RAISE EXCEPTION 'over_allocation: target=% open=% requested=%', v_target_id, v_open, v_amount; END IF;
    IF v_source_id IS NOT NULL THEN
      IF ROUND(v_amount,2) > ROUND(v_unapplied,2)+0.01 THEN RAISE EXCEPTION 'source_exhausted: unapplied=% requested=%', v_unapplied, v_amount; END IF;
      v_unapplied := v_unapplied - v_amount;
    END IF;
    INSERT INTO public.payment_allocations(org_id,branch_id,party_id,source_kind,source_document_id,target_kind,target_document_id,amount,currency,exchange_rate,allocation_date,memo,meta,created_by)
    VALUES (_org,v_branch,v_party,v_source_kind,v_source_id,v_target_kind,v_target_id,v_amount,v_currency,v_rate,v_date,v_line->>'memo',COALESCE(v_line->'meta','{}'::jsonb),v_uid)
    RETURNING id INTO v_new_id;
    v_ids := v_ids || v_new_id;
  END LOOP;
  RETURN v_ids;
END $$;
