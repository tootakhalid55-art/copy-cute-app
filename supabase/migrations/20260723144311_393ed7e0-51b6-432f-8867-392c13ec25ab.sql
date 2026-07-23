
-- ============================================================
-- Phase B2.1 — Financial Operations DB Layer
-- ============================================================

-- 1. Enums ---------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.credit_limit_policy AS ENUM ('warn_only','block','require_approval','allow_override');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.financial_state AS ENUM ('open','partially_settled','fully_settled','overpaid','advance_available','refunded','written_off');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.financial_audit_kind AS ENUM (
    'receipt_created','payment_created','allocation_created','allocation_reversed',
    'advance_created','refund_created','writeoff_created',
    'credit_hold_set','credit_hold_released','credit_limit_overridden','credit_policy_changed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Column extensions --------------------------------------
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS default_credit_policy public.credit_limit_policy NOT NULL DEFAULT 'warn_only';

ALTER TABLE public.parties
  ADD COLUMN IF NOT EXISTS credit_policy public.credit_limit_policy,
  ADD COLUMN IF NOT EXISTS credit_hold_reason TEXT,
  ADD COLUMN IF NOT EXISTS credit_hold_by UUID,
  ADD COLUMN IF NOT EXISTS credit_hold_at TIMESTAMPTZ;

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS financial_state public.financial_state NOT NULL DEFAULT 'open';

-- 3. Financial Audit Log ------------------------------------
CREATE TABLE IF NOT EXISTS public.financial_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_kind public.financial_audit_kind NOT NULL,
  party_id UUID,
  source_document_id UUID,
  target_document_id UUID,
  allocation_id UUID,
  posting_event_id UUID,
  amount NUMERIC(18,4),
  currency TEXT,
  reason TEXT,
  before_state JSONB DEFAULT '{}'::jsonb,
  after_state  JSONB DEFAULT '{}'::jsonb,
  actor_id UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.financial_audit_log TO authenticated;
GRANT ALL ON public.financial_audit_log TO service_role;
ALTER TABLE public.financial_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_select" ON public.financial_audit_log;
CREATE POLICY "audit_select" ON public.financial_audit_log
  FOR SELECT TO authenticated
  USING (public.is_org_member(org_id, auth.uid()));

DROP POLICY IF EXISTS "audit_insert" ON public.financial_audit_log;
CREATE POLICY "audit_insert" ON public.financial_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_org_role(org_id, auth.uid(),'owner') OR
    public.has_org_role(org_id, auth.uid(),'admin') OR
    public.has_org_role(org_id, auth.uid(),'accountant')
  );

CREATE INDEX IF NOT EXISTS idx_audit_org_kind_time ON public.financial_audit_log(org_id, event_kind, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_party ON public.financial_audit_log(org_id, party_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_source_doc ON public.financial_audit_log(source_document_id);
CREATE INDEX IF NOT EXISTS idx_audit_target_doc ON public.financial_audit_log(target_document_id);

-- 4. Performance indexes -----------------------------------
CREATE INDEX IF NOT EXISTS idx_documents_org_party_kind_status ON public.documents(org_id, party_id, kind, status);
CREATE INDEX IF NOT EXISTS idx_documents_org_kind_issue      ON public.documents(org_id, kind, issue_date);
CREATE INDEX IF NOT EXISTS idx_alloc_org_target              ON public.payment_allocations(org_id, target_document_id);
CREATE INDEX IF NOT EXISTS idx_alloc_org_source              ON public.payment_allocations(org_id, source_document_id);
CREATE INDEX IF NOT EXISTS idx_alloc_party_date              ON public.payment_allocations(org_id, party_id, allocation_date);

-- 5. Financial state recompute -----------------------------
CREATE OR REPLACE FUNCTION public.recompute_document_financial_state(_org UUID, _doc UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_state public.financial_state;
BEGIN
  SELECT * INTO r FROM public.document_open_balances WHERE org_id=_org AND document_id=_doc;
  IF r IS NULL THEN RETURN; END IF;

  -- Source-side documents (receipt/payment/credit note/advance): use unapplied_as_source
  IF r.kind IN ('receipt_voucher','payment_voucher','credit_note','debit_note') THEN
    IF r.unapplied_as_source <= 0.005 AND r.original_amount > 0 THEN
      v_state := 'fully_settled';
    ELSIF r.unapplied_as_source >= r.original_amount - 0.005 THEN
      v_state := 'advance_available';
    ELSE
      v_state := 'partially_settled';
    END IF;
  ELSE
    -- Target-side (invoice/bill): use open_as_target
    IF r.open_as_target <= 0.005 AND r.original_amount > 0 THEN
      v_state := 'fully_settled';
    ELSIF r.open_as_target >= r.original_amount - 0.005 THEN
      v_state := 'open';
    ELSE
      v_state := 'partially_settled';
    END IF;
  END IF;

  UPDATE public.documents SET financial_state = v_state WHERE id = _doc AND org_id = _org;
END $$;

CREATE OR REPLACE FUNCTION public.alloc_after_change()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_row RECORD;
BEGIN
  v_row := COALESCE(NEW, OLD);
  IF v_row.source_document_id IS NOT NULL THEN
    PERFORM public.recompute_document_financial_state(v_row.org_id, v_row.source_document_id);
  END IF;
  IF v_row.target_document_id IS NOT NULL THEN
    PERFORM public.recompute_document_financial_state(v_row.org_id, v_row.target_document_id);
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_alloc_after_change ON public.payment_allocations;
CREATE TRIGGER trg_alloc_after_change
AFTER INSERT OR UPDATE OR DELETE ON public.payment_allocations
FOR EACH ROW EXECUTE FUNCTION public.alloc_after_change();

-- 6. Credit checking ---------------------------------------
CREATE OR REPLACE FUNCTION public.check_credit(_org UUID, _party UUID, _new_amount NUMERIC DEFAULT 0)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_party RECORD;
  v_org   RECORD;
  v_exposure NUMERIC := 0;
  v_limit    NUMERIC;
  v_policy   public.credit_limit_policy;
  v_remaining NUMERIC;
  v_ok BOOLEAN;
BEGIN
  SELECT * INTO v_party FROM public.parties WHERE id=_party AND org_id=_org;
  IF v_party.id IS NULL THEN RAISE EXCEPTION 'party_not_found'; END IF;
  SELECT * INTO v_org FROM public.organizations WHERE id=_org;

  v_limit  := COALESCE(v_party.credit_limit, 0);
  v_policy := COALESCE(v_party.credit_policy, v_org.default_credit_policy, 'warn_only');

  SELECT COALESCE(SUM(open_as_target),0) INTO v_exposure
    FROM public.document_open_balances
   WHERE org_id=_org AND party_id=_party AND kind IN ('invoice','debit_note') AND open_as_target > 0;

  v_remaining := v_limit - v_exposure - COALESCE(_new_amount,0);
  v_ok := (v_limit <= 0) OR (v_remaining >= 0);

  RETURN jsonb_build_object(
    'party_id', _party,
    'credit_limit', v_limit,
    'exposure', v_exposure,
    'new_amount', COALESCE(_new_amount,0),
    'remaining', v_remaining,
    'policy', v_policy,
    'credit_hold', COALESCE(v_party.credit_hold,false),
    'ok', v_ok AND NOT COALESCE(v_party.credit_hold,false)
  );
END $$;

CREATE OR REPLACE FUNCTION public.set_credit_hold(_org UUID, _party UUID, _reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid UUID := auth.uid(); v_old RECORD;
BEGIN
  IF NOT (public.has_org_role(_org,v_uid,'owner') OR public.has_org_role(_org,v_uid,'admin') OR public.has_org_role(_org,v_uid,'accountant')) THEN
    RAISE EXCEPTION 'forbidden'; END IF;
  SELECT credit_hold, credit_hold_reason INTO v_old FROM public.parties WHERE id=_party AND org_id=_org;
  UPDATE public.parties SET credit_hold=true, credit_hold_reason=_reason, credit_hold_by=v_uid, credit_hold_at=now()
    WHERE id=_party AND org_id=_org;
  INSERT INTO public.financial_audit_log(org_id,event_kind,party_id,reason,before_state,after_state,actor_id)
    VALUES(_org,'credit_hold_set',_party,_reason,
      jsonb_build_object('credit_hold', COALESCE(v_old.credit_hold,false), 'reason', v_old.credit_hold_reason),
      jsonb_build_object('credit_hold', true, 'reason', _reason), v_uid);
END $$;

CREATE OR REPLACE FUNCTION public.release_credit_hold(_org UUID, _party UUID, _reason TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid UUID := auth.uid(); v_old RECORD;
BEGIN
  IF NOT (public.has_org_role(_org,v_uid,'owner') OR public.has_org_role(_org,v_uid,'admin') OR public.has_org_role(_org,v_uid,'accountant')) THEN
    RAISE EXCEPTION 'forbidden'; END IF;
  SELECT credit_hold, credit_hold_reason INTO v_old FROM public.parties WHERE id=_party AND org_id=_org;
  UPDATE public.parties SET credit_hold=false, credit_hold_reason=NULL, credit_hold_by=NULL, credit_hold_at=NULL
    WHERE id=_party AND org_id=_org;
  INSERT INTO public.financial_audit_log(org_id,event_kind,party_id,reason,before_state,after_state,actor_id)
    VALUES(_org,'credit_hold_released',_party,_reason,
      jsonb_build_object('credit_hold', COALESCE(v_old.credit_hold,false), 'reason', v_old.credit_hold_reason),
      jsonb_build_object('credit_hold', false), v_uid);
END $$;

CREATE OR REPLACE FUNCTION public.override_credit_limit(_org UUID, _party UUID, _document UUID, _amount NUMERIC, _reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid UUID := auth.uid();
BEGIN
  IF NOT (public.has_org_role(_org,v_uid,'owner') OR public.has_org_role(_org,v_uid,'admin')) THEN
    RAISE EXCEPTION 'forbidden: override requires admin'; END IF;
  INSERT INTO public.financial_audit_log(org_id,event_kind,party_id,target_document_id,amount,reason,actor_id)
    VALUES (_org,'credit_limit_overridden',_party,_document,_amount,_reason,v_uid);
END $$;

-- 7. Receipt / Payment creation ----------------------------
-- Shared body: creates a document of a given kind (receipt_voucher | payment_voucher),
-- posts the corresponding journal via post_journal, publishes a posting_event,
-- and optionally allocates FIFO or by explicit allocations. Overpayment is parked as
-- unapplied (advance).
CREATE OR REPLACE FUNCTION public._create_settlement_doc(
  _org UUID, _kind public.doc_kind, _payload JSONB
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_party UUID := NULLIF(_payload->>'party_id','')::uuid;
  v_branch UUID := NULLIF(_payload->>'branch_id','')::uuid;
  v_bank UUID := NULLIF(_payload->>'cash_bank_account_id','')::uuid;
  v_amount NUMERIC := (_payload->>'amount')::numeric;
  v_currency TEXT := COALESCE(_payload->>'currency','SAR');
  v_rate NUMERIC := COALESCE((_payload->>'exchange_rate')::numeric,1);
  v_date DATE := COALESCE((_payload->>'date')::date, CURRENT_DATE);
  v_memo TEXT := _payload->>'memo';
  v_reference TEXT := _payload->>'reference';
  v_fy UUID; v_doc_id UUID; v_doc_number TEXT;
  v_bank_acc RECORD;
  v_ar_code TEXT; v_ap_code TEXT; v_advance_ar TEXT; v_advance_ap TEXT;
  v_je_lines JSONB;
  v_event_id UUID;
  v_je_id UUID;
  v_allocations JSONB;
  v_auto_fifo BOOLEAN := COALESCE((_payload->>'auto_fifo')::boolean,false);
  v_kind_label TEXT;
  v_alloc_source_kind public.allocation_source_kind;
  v_alloc_target_kinds TEXT[];
  v_targets JSONB := '[]'::jsonb;
  v_row RECORD;
  v_remaining NUMERIC;
  v_take NUMERIC;
  v_alloc_ids UUID[];
  v_advance NUMERIC;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT (public.has_org_role(_org,v_uid,'owner') OR public.has_org_role(_org,v_uid,'admin') OR public.has_org_role(_org,v_uid,'accountant')) THEN
    RAISE EXCEPTION 'forbidden'; END IF;
  IF v_party IS NULL THEN RAISE EXCEPTION 'party_required'; END IF;
  IF v_amount IS NULL OR v_amount <= 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;
  IF v_bank IS NULL THEN RAISE EXCEPTION 'cash_bank_account_required'; END IF;

  SELECT * INTO v_bank_acc FROM public.cash_bank_accounts WHERE id=v_bank AND org_id=_org;
  IF v_bank_acc.id IS NULL THEN RAISE EXCEPTION 'cash_bank_account_not_found'; END IF;

  SELECT id INTO v_fy FROM public.fiscal_years WHERE org_id=_org AND v_date BETWEEN start_date AND end_date LIMIT 1;
  v_doc_number := public.next_document_number(_org, v_branch, v_fy, _kind::text);

  IF _kind = 'receipt_voucher' THEN
    v_kind_label := 'Receipt';
    v_alloc_source_kind := 'receipt';
    v_alloc_target_kinds := ARRAY['invoice','debit_note'];
    v_ar_code := public.resolve_account(_org, v_branch, 'receipt_voucher','accounts_receivable');
    v_advance_ar := public.resolve_account(_org, v_branch, 'receipt_voucher','customer_advance');
    IF v_ar_code IS NULL THEN RAISE EXCEPTION 'no_account_for_key:accounts_receivable'; END IF;
  ELSIF _kind = 'payment_voucher' THEN
    v_kind_label := 'Payment';
    v_alloc_source_kind := 'supplier_payment';
    v_alloc_target_kinds := ARRAY['bill','credit_note'];
    v_ap_code := public.resolve_account(_org, v_branch, 'payment_voucher','accounts_payable');
    v_advance_ap := public.resolve_account(_org, v_branch, 'payment_voucher','supplier_advance');
    IF v_ap_code IS NULL THEN RAISE EXCEPTION 'no_account_for_key:accounts_payable'; END IF;
  ELSE
    RAISE EXCEPTION 'unsupported_kind: %', _kind;
  END IF;

  -- Insert document
  INSERT INTO public.documents(
    org_id, kind, doc_number, party_id, branch_id, fiscal_year_id,
    issue_date, currency, exchange_rate, grand_total, subtotal,
    status, notes, meta, created_by
  ) VALUES (
    _org, _kind, v_doc_number, v_party, v_branch, v_fy,
    v_date, v_currency, v_rate, v_amount, v_amount,
    'posted', COALESCE(v_memo, v_kind_label || ' ' || v_doc_number),
    jsonb_build_object('reference', v_reference, 'cash_bank_account_id', v_bank),
    v_uid
  ) RETURNING id INTO v_doc_id;

  -- Journal entry: DR bank / CR AR (receipt) or DR AP / CR bank (payment)
  IF _kind = 'receipt_voucher' THEN
    v_je_lines := jsonb_build_array(
      jsonb_build_object('account_code', v_bank_acc.account_code, 'debit', v_amount, 'credit', 0, 'party_id', v_party, 'description', v_kind_label || ' ' || v_doc_number),
      jsonb_build_object('account_code', v_ar_code, 'debit', 0, 'credit', v_amount, 'party_id', v_party, 'description', v_kind_label || ' ' || v_doc_number)
    );
  ELSE
    v_je_lines := jsonb_build_array(
      jsonb_build_object('account_code', v_ap_code, 'debit', v_amount, 'credit', 0, 'party_id', v_party, 'description', v_kind_label || ' ' || v_doc_number),
      jsonb_build_object('account_code', v_bank_acc.account_code, 'debit', 0, 'credit', v_amount, 'party_id', v_party, 'description', v_kind_label || ' ' || v_doc_number)
    );
  END IF;

  v_je_id := public.post_journal(_org, jsonb_build_object(
    'entry_date', v_date, 'memo', v_kind_label || ' ' || v_doc_number,
    'currency', v_currency, 'exchange_rate', v_rate,
    'source_module', CASE WHEN _kind='receipt_voucher' THEN 'AR' ELSE 'AP' END,
    'source_document_type', _kind::text, 'source_document_id', v_doc_id,
    'event_type', CASE WHEN _kind='receipt_voucher' THEN 'receipt_created' ELSE 'payment_created' END,
    'branch_id', v_branch, 'lines', v_je_lines,
    'meta', jsonb_build_object('doc_number', v_doc_number)
  ));

  -- Cash/bank transaction ledger entry
  INSERT INTO public.cash_bank_transactions(
    org_id, account_id, branch_id, party_id, txn_kind, txn_date,
    amount, currency, exchange_rate, reference, memo,
    source_document_id, source_document_type, journal_entry_id, created_by, meta
  ) VALUES (
    _org, v_bank, v_branch, v_party,
    CASE WHEN _kind='receipt_voucher' THEN 'receipt_in' ELSE 'payment_out' END,
    v_date,
    CASE WHEN _kind='receipt_voucher' THEN v_amount ELSE -v_amount END,
    v_currency, v_rate, v_reference, v_memo,
    v_doc_id, _kind::text, v_je_id, v_uid,
    jsonb_build_object('doc_number', v_doc_number)
  );

  -- Posting event
  INSERT INTO public.posting_events(
    org_id, event_type, source_document_id, source_document_type,
    journal_entry_id, party_id, amount, currency, meta, created_by
  ) VALUES (
    _org,
    CASE WHEN _kind='receipt_voucher' THEN 'receipt_created' ELSE 'payment_created' END::public.posting_event_type,
    v_doc_id, _kind::text, v_je_id, v_party, v_amount, v_currency,
    jsonb_build_object('doc_number', v_doc_number, 'reference', v_reference), v_uid
  ) RETURNING id INTO v_event_id;

  INSERT INTO public.financial_audit_log(org_id,event_kind,party_id,source_document_id,posting_event_id,amount,currency,actor_id,after_state)
    VALUES (_org, CASE WHEN _kind='receipt_voucher' THEN 'receipt_created' ELSE 'payment_created' END::public.financial_audit_kind,
      v_party, v_doc_id, v_event_id, v_amount, v_currency, v_uid,
      jsonb_build_object('doc_number', v_doc_number));

  -- Allocations
  v_allocations := COALESCE(_payload->'allocations','[]'::jsonb);

  IF v_auto_fifo AND jsonb_array_length(v_allocations)=0 THEN
    v_remaining := v_amount;
    FOR v_row IN
      SELECT document_id, kind, open_as_target
      FROM public.document_open_balances
      WHERE org_id=_org AND party_id=v_party AND kind = ANY(v_alloc_target_kinds) AND open_as_target > 0.005
      ORDER BY issue_date NULLS LAST, document_id
    LOOP
      EXIT WHEN v_remaining <= 0.005;
      v_take := LEAST(v_remaining, v_row.open_as_target);
      v_targets := v_targets || jsonb_build_array(jsonb_build_object(
        'target_kind', v_row.kind, 'target_document_id', v_row.document_id, 'amount', v_take
      ));
      v_remaining := v_remaining - v_take;
    END LOOP;
    v_allocations := v_targets;
  END IF;

  IF jsonb_array_length(v_allocations) > 0 THEN
    v_alloc_ids := public.allocate_payment(_org, jsonb_build_object(
      'source_kind', v_alloc_source_kind, 'source_document_id', v_doc_id,
      'party_id', v_party, 'branch_id', v_branch,
      'currency', v_currency, 'exchange_rate', v_rate,
      'allocation_date', v_date, 'allocations', v_allocations
    ));
  END IF;

  -- Detect residual advance
  SELECT unapplied_as_source INTO v_advance FROM public.document_open_balances WHERE org_id=_org AND document_id=v_doc_id;
  IF COALESCE(v_advance,0) > 0.005 THEN
    INSERT INTO public.financial_audit_log(org_id,event_kind,party_id,source_document_id,amount,currency,actor_id,after_state)
      VALUES (_org,'advance_created',v_party,v_doc_id,v_advance,v_currency,v_uid,
        jsonb_build_object('doc_number', v_doc_number, 'advance_amount', v_advance));
  END IF;

  PERFORM public.recompute_document_financial_state(_org, v_doc_id);
  RETURN v_doc_id;
END $$;

CREATE OR REPLACE FUNCTION public.create_receipt(_org UUID, _payload JSONB) RETURNS UUID
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$ SELECT public._create_settlement_doc(_org, 'receipt_voucher'::public.doc_kind, _payload) $$;

CREATE OR REPLACE FUNCTION public.create_payment(_org UUID, _payload JSONB) RETURNS UUID
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$ SELECT public._create_settlement_doc(_org, 'payment_voucher'::public.doc_kind, _payload) $$;

-- 8. Write-off --------------------------------------------
CREATE OR REPLACE FUNCTION public.create_writeoff(_org UUID, _payload JSONB) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_target UUID := (_payload->>'target_document_id')::uuid;
  v_amount NUMERIC := (_payload->>'amount')::numeric;
  v_reason TEXT := _payload->>'reason';
  v_date DATE := COALESCE((_payload->>'date')::date, CURRENT_DATE);
  v_doc RECORD; v_ar_code TEXT; v_bad_debt_code TEXT; v_je_id UUID; v_event_id UUID; v_alloc_ids UUID[];
  v_target_kind TEXT;
BEGIN
  IF NOT (public.has_org_role(_org,v_uid,'owner') OR public.has_org_role(_org,v_uid,'admin') OR public.has_org_role(_org,v_uid,'accountant')) THEN
    RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO v_doc FROM public.documents WHERE id=v_target AND org_id=_org;
  IF v_doc.id IS NULL THEN RAISE EXCEPTION 'target_not_found'; END IF;
  v_target_kind := CASE
    WHEN v_doc.kind::text IN ('sales_invoice','simplified_tax_invoice','standard_tax_invoice') THEN 'invoice'
    WHEN v_doc.kind::text = 'debit_note' THEN 'debit_note'
    ELSE v_doc.kind::text END;

  v_ar_code := public.resolve_account(_org, v_doc.branch_id, 'writeoff','accounts_receivable');
  v_bad_debt_code := public.resolve_account(_org, v_doc.branch_id, 'writeoff','bad_debt_expense');
  IF v_ar_code IS NULL OR v_bad_debt_code IS NULL THEN RAISE EXCEPTION 'no_account_for_key:writeoff'; END IF;

  v_je_id := public.post_journal(_org, jsonb_build_object(
    'entry_date', v_date, 'memo', COALESCE(v_reason,'Write-off ' || v_doc.doc_number),
    'source_module','AR','source_document_type','writeoff','source_document_id',v_target,
    'event_type','writeoff_created','branch_id', v_doc.branch_id,
    'lines', jsonb_build_array(
      jsonb_build_object('account_code', v_bad_debt_code, 'debit', v_amount, 'credit', 0, 'party_id', v_doc.party_id, 'description', 'Write-off ' || v_doc.doc_number),
      jsonb_build_object('account_code', v_ar_code,       'debit', 0, 'credit', v_amount, 'party_id', v_doc.party_id, 'description', 'Write-off ' || v_doc.doc_number)
    )
  ));

  -- Register writeoff as an allocation source pointing to the target
  v_alloc_ids := public.allocate_payment(_org, jsonb_build_object(
    'source_kind','writeoff','source_document_id',v_target,
    'party_id',v_doc.party_id,'branch_id',v_doc.branch_id,
    'currency',v_doc.currency,'exchange_rate',v_doc.exchange_rate,
    'allocation_date',v_date,
    'allocations', jsonb_build_array(jsonb_build_object(
      'target_kind', v_target_kind, 'target_document_id', v_target, 'amount', v_amount, 'memo', v_reason
    ))
  ));

  INSERT INTO public.posting_events(org_id,event_type,source_document_id,source_document_type,journal_entry_id,party_id,amount,currency,meta,created_by)
    VALUES (_org,'writeoff_created',v_target,'writeoff',v_je_id,v_doc.party_id,v_amount,v_doc.currency, jsonb_build_object('reason',v_reason),v_uid)
    RETURNING id INTO v_event_id;

  INSERT INTO public.financial_audit_log(org_id,event_kind,party_id,target_document_id,allocation_id,posting_event_id,amount,currency,reason,actor_id)
    VALUES (_org,'writeoff_created',v_doc.party_id,v_target, v_alloc_ids[1], v_event_id, v_amount, v_doc.currency, v_reason, v_uid);

  PERFORM public.recompute_document_financial_state(_org, v_target);
  UPDATE public.documents SET financial_state='written_off' WHERE id=v_target AND org_id=_org;
  RETURN v_je_id;
END $$;

-- 9. Refund -----------------------------------------------
CREATE OR REPLACE FUNCTION public.create_refund(_org UUID, _payload JSONB) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_source UUID := (_payload->>'source_document_id')::uuid;
  v_amount NUMERIC := (_payload->>'amount')::numeric;
  v_bank UUID := (_payload->>'cash_bank_account_id')::uuid;
  v_date DATE := COALESCE((_payload->>'date')::date, CURRENT_DATE);
  v_reason TEXT := _payload->>'reason';
  v_bank_acc RECORD; v_src RECORD; v_ar TEXT; v_ap TEXT; v_je_id UUID; v_event_id UUID;
  v_lines JSONB; v_is_customer BOOLEAN;
BEGIN
  IF NOT (public.has_org_role(_org,v_uid,'owner') OR public.has_org_role(_org,v_uid,'admin') OR public.has_org_role(_org,v_uid,'accountant')) THEN
    RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO v_src FROM public.documents WHERE id=v_source AND org_id=_org;
  IF v_src.id IS NULL THEN RAISE EXCEPTION 'source_not_found'; END IF;
  SELECT * INTO v_bank_acc FROM public.cash_bank_accounts WHERE id=v_bank AND org_id=_org;
  IF v_bank_acc.id IS NULL THEN RAISE EXCEPTION 'bank_not_found'; END IF;

  v_is_customer := v_src.kind::text IN ('receipt_voucher','credit_note');
  IF v_is_customer THEN
    v_ar := public.resolve_account(_org, v_src.branch_id, 'refund','accounts_receivable');
    v_lines := jsonb_build_array(
      jsonb_build_object('account_code', v_ar, 'debit', v_amount, 'credit', 0, 'party_id', v_src.party_id, 'description','Refund ' || v_src.doc_number),
      jsonb_build_object('account_code', v_bank_acc.account_code, 'debit', 0, 'credit', v_amount, 'party_id', v_src.party_id, 'description','Refund ' || v_src.doc_number)
    );
  ELSE
    v_ap := public.resolve_account(_org, v_src.branch_id, 'refund','accounts_payable');
    v_lines := jsonb_build_array(
      jsonb_build_object('account_code', v_bank_acc.account_code, 'debit', v_amount, 'credit', 0, 'party_id', v_src.party_id, 'description','Refund ' || v_src.doc_number),
      jsonb_build_object('account_code', v_ap, 'debit', 0, 'credit', v_amount, 'party_id', v_src.party_id, 'description','Refund ' || v_src.doc_number)
    );
  END IF;

  v_je_id := public.post_journal(_org, jsonb_build_object(
    'entry_date',v_date,'memo',COALESCE(v_reason,'Refund ' || v_src.doc_number),
    'source_module', CASE WHEN v_is_customer THEN 'AR' ELSE 'AP' END,
    'source_document_type','refund','source_document_id',v_source,
    'event_type','refund_created','branch_id',v_src.branch_id,'lines',v_lines
  ));

  INSERT INTO public.cash_bank_transactions(org_id,account_id,branch_id,party_id,txn_kind,txn_date,amount,currency,exchange_rate,memo,source_document_id,source_document_type,journal_entry_id,created_by)
  VALUES (_org,v_bank,v_src.branch_id,v_src.party_id,
    CASE WHEN v_is_customer THEN 'payment_out' ELSE 'receipt_in' END,
    v_date, CASE WHEN v_is_customer THEN -v_amount ELSE v_amount END, v_src.currency, v_src.exchange_rate, v_reason,
    v_source,'refund',v_je_id,v_uid);

  INSERT INTO public.posting_events(org_id,event_type,source_document_id,source_document_type,journal_entry_id,party_id,amount,currency,meta,created_by)
    VALUES(_org,'refund_created',v_source,'refund',v_je_id,v_src.party_id,v_amount,v_src.currency,jsonb_build_object('reason',v_reason),v_uid)
    RETURNING id INTO v_event_id;

  INSERT INTO public.financial_audit_log(org_id,event_kind,party_id,source_document_id,posting_event_id,amount,currency,reason,actor_id)
    VALUES(_org,'refund_created',v_src.party_id,v_source,v_event_id,v_amount,v_src.currency,v_reason,v_uid);

  PERFORM public.recompute_document_financial_state(_org, v_source);
  UPDATE public.documents SET financial_state='refunded' WHERE id=v_source AND org_id=_org;
  RETURN v_je_id;
END $$;

-- 10. Reverse allocation ----------------------------------
CREATE OR REPLACE FUNCTION public.reverse_allocation(_org UUID, _alloc UUID, _reason TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid UUID := auth.uid(); v_alloc RECORD;
BEGIN
  IF NOT (public.has_org_role(_org,v_uid,'owner') OR public.has_org_role(_org,v_uid,'admin') OR public.has_org_role(_org,v_uid,'accountant')) THEN
    RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO v_alloc FROM public.payment_allocations WHERE id=_alloc AND org_id=_org;
  IF v_alloc.id IS NULL THEN RAISE EXCEPTION 'allocation_not_found'; END IF;

  DELETE FROM public.payment_allocations WHERE id=_alloc;
  INSERT INTO public.financial_audit_log(org_id,event_kind,party_id,source_document_id,target_document_id,allocation_id,amount,currency,reason,actor_id,before_state)
    VALUES(_org,'allocation_reversed',v_alloc.party_id,v_alloc.source_document_id,v_alloc.target_document_id,_alloc,v_alloc.amount,v_alloc.currency,_reason,v_uid,to_jsonb(v_alloc));
END $$;

-- 11. Unified Statement Engine ----------------------------
-- Returns period-scoped movement lines with a running balance for
-- customers, suppliers, cash accounts, and bank accounts.
-- _account_kind: 'customer' | 'supplier' | 'cash_account'
-- _account_id:   parties.id | cash_bank_accounts.id
CREATE OR REPLACE FUNCTION public.get_statement(
  _org UUID,
  _account_kind TEXT,
  _account_id UUID,
  _from DATE DEFAULT NULL,
  _to DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE(
  txn_date DATE,
  doc_kind TEXT,
  doc_id UUID,
  doc_number TEXT,
  description TEXT,
  debit NUMERIC,
  credit NUMERIC,
  balance NUMERIC,
  currency TEXT,
  is_opening BOOLEAN
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_opening NUMERIC := 0;
BEGIN
  IF NOT public.is_org_member(_org, auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF _account_kind IN ('customer','supplier') THEN
    -- Opening balance = SUM of movements strictly before _from
    -- Convention: AR positive = customer owes; AP positive = we owe supplier.
    IF _from IS NOT NULL THEN
      SELECT COALESCE(SUM(
        CASE
          WHEN _account_kind='customer' THEN
            CASE WHEN d.kind::text IN ('sales_invoice','simplified_tax_invoice','standard_tax_invoice','debit_note') THEN d.grand_total
                 WHEN d.kind::text = 'credit_note' THEN -d.grand_total
                 WHEN d.kind::text = 'receipt_voucher' THEN -d.grand_total
                 ELSE 0 END
          ELSE
            CASE WHEN d.kind::text IN ('purchase_invoice','debit_note') THEN d.grand_total
                 WHEN d.kind::text = 'credit_note' THEN -d.grand_total
                 WHEN d.kind::text = 'payment_voucher' THEN -d.grand_total
                 ELSE 0 END
        END
      ),0) INTO v_opening
      FROM public.documents d
      WHERE d.org_id=_org AND d.party_id=_account_id AND d.issue_date < _from
        AND d.status::text NOT IN ('draft','cancelled');
    END IF;

    RETURN QUERY
    WITH movements AS (
      SELECT d.issue_date AS txn_date, d.kind::text AS doc_kind, d.id AS doc_id, d.doc_number,
             COALESCE(d.notes,'') AS description,
             CASE
               WHEN _account_kind='customer' THEN
                 CASE WHEN d.kind::text IN ('sales_invoice','simplified_tax_invoice','standard_tax_invoice','debit_note') THEN d.grand_total ELSE 0 END
               ELSE
                 CASE WHEN d.kind::text = 'payment_voucher' THEN d.grand_total ELSE 0 END
             END AS debit,
             CASE
               WHEN _account_kind='customer' THEN
                 CASE WHEN d.kind::text = 'credit_note' THEN d.grand_total
                      WHEN d.kind::text = 'receipt_voucher' THEN d.grand_total ELSE 0 END
               ELSE
                 CASE WHEN d.kind::text IN ('purchase_invoice','debit_note') THEN d.grand_total
                      WHEN d.kind::text = 'credit_note' THEN d.grand_total ELSE 0 END
             END AS credit,
             d.currency
      FROM public.documents d
      WHERE d.org_id=_org AND d.party_id=_account_id
        AND (_from IS NULL OR d.issue_date >= _from)
        AND (_to IS NULL OR d.issue_date <= _to)
        AND d.status::text NOT IN ('draft','cancelled')
    ), ordered AS (
      SELECT NULL::DATE AS txn_date, 'opening'::TEXT AS doc_kind, NULL::UUID AS doc_id, NULL::TEXT AS doc_number,
             'Opening balance'::TEXT AS description,
             CASE WHEN v_opening >= 0 THEN v_opening ELSE 0 END::NUMERIC AS debit,
             CASE WHEN v_opening < 0  THEN -v_opening ELSE 0 END::NUMERIC AS credit,
             'SAR'::TEXT AS currency, TRUE AS is_opening
      UNION ALL
      SELECT m.txn_date, m.doc_kind, m.doc_id, m.doc_number, m.description,
             m.debit, m.credit, m.currency, FALSE
      FROM movements m
    ), running AS (
      SELECT o.*, SUM(o.debit - o.credit) OVER (ORDER BY o.is_opening DESC, o.txn_date, o.doc_id) AS bal
      FROM ordered o
    )
    SELECT r.txn_date, r.doc_kind, r.doc_id, r.doc_number, r.description,
           r.debit, r.credit, r.bal, r.currency, r.is_opening
    FROM running r
    ORDER BY r.is_opening DESC, r.txn_date NULLS FIRST, r.doc_id;

  ELSIF _account_kind = 'cash_account' THEN
    IF _from IS NOT NULL THEN
      SELECT COALESCE(SUM(t.amount),0) INTO v_opening
      FROM public.cash_bank_transactions t
      WHERE t.org_id=_org AND t.account_id=_account_id AND t.txn_date < _from;
    END IF;
    RETURN QUERY
    WITH movements AS (
      SELECT t.txn_date, t.txn_kind::text AS doc_kind, t.source_document_id AS doc_id,
             COALESCE(t.reference,'') AS doc_number,
             COALESCE(t.memo,'') AS description,
             CASE WHEN t.amount > 0 THEN t.amount ELSE 0 END AS debit,
             CASE WHEN t.amount < 0 THEN -t.amount ELSE 0 END AS credit,
             t.currency
      FROM public.cash_bank_transactions t
      WHERE t.org_id=_org AND t.account_id=_account_id
        AND (_from IS NULL OR t.txn_date >= _from)
        AND (_to IS NULL OR t.txn_date <= _to)
    ), ordered AS (
      SELECT NULL::DATE, 'opening'::TEXT, NULL::UUID, NULL::TEXT, 'Opening balance'::TEXT,
             CASE WHEN v_opening >= 0 THEN v_opening ELSE 0 END::NUMERIC,
             CASE WHEN v_opening < 0  THEN -v_opening ELSE 0 END::NUMERIC,
             'SAR'::TEXT, TRUE
      UNION ALL
      SELECT m.txn_date, m.doc_kind, m.doc_id, m.doc_number, m.description, m.debit, m.credit, m.currency, FALSE
      FROM movements m
    ), running AS (
      SELECT o.*, SUM(o.debit - o.credit) OVER (ORDER BY o.is_opening DESC, o.txn_date, o.doc_id) AS bal
      FROM ordered o
    )
    SELECT r.txn_date, r.doc_kind, r.doc_id, r.doc_number, r.description,
           r.debit, r.credit, r.bal, r.currency, r.is_opening
    FROM running r
    ORDER BY r.is_opening DESC, r.txn_date NULLS FIRST, r.doc_id;
  ELSE
    RAISE EXCEPTION 'unsupported_account_kind: %', _account_kind;
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.get_statement(UUID,TEXT,UUID,DATE,DATE) FROM anon;
REVOKE ALL ON FUNCTION public.check_credit(UUID,UUID,NUMERIC) FROM anon;
REVOKE ALL ON FUNCTION public.create_receipt(UUID,JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.create_payment(UUID,JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.create_writeoff(UUID,JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.create_refund(UUID,JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.reverse_allocation(UUID,UUID,TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.set_credit_hold(UUID,UUID,TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.release_credit_hold(UUID,UUID,TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.override_credit_limit(UUID,UUID,UUID,NUMERIC,TEXT) FROM anon;
