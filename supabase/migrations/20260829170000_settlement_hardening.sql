-- ============================================================
-- Phase 3B — Settlement hardening
--
-- 1) settlement_refunds ledger: refunds now consume the source
--    voucher's unapplied balance (no more refund-then-reallocate
--    double-dip, no unbounded repeat refunds)
-- 2) document_open_balances: consumed amount includes refunds
-- 3) allocate_payment: row locks (ordered, FOR UPDATE) kill the
--    concurrent over-allocation race; same-currency enforcement;
--    tolerance tightened to rounding grace (0.005); open-period check
-- 4) create_refund: locks the source, validates against the
--    unapplied balance, records the refund in settlement_refunds
-- 5) reverse_allocation: refuses to touch allocations whose period
--    is closed/locked
-- 6) _create_settlement_doc: auto-FIFO only settles documents in the
--    voucher's currency
-- ============================================================

-- ---------- 1) refund ledger ----------
CREATE TABLE IF NOT EXISTS public.settlement_refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  source_document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE RESTRICT,
  amount NUMERIC(18,4) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'SAR',
  refund_date DATE NOT NULL DEFAULT CURRENT_DATE,
  journal_entry_id UUID REFERENCES public.journal_entries(id),
  reason TEXT,
  created_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.settlement_refunds ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.settlement_refunds TO authenticated;
GRANT ALL ON public.settlement_refunds TO service_role;
DROP POLICY IF EXISTS "refunds_select" ON public.settlement_refunds;
CREATE POLICY "refunds_select" ON public.settlement_refunds
  FOR SELECT TO authenticated USING (public.is_org_member(org_id, auth.uid()));
CREATE INDEX IF NOT EXISTS idx_settlement_refunds_source ON public.settlement_refunds(org_id, source_document_id);

-- ---------- 2) open balances include refunds in consumption ----------
CREATE OR REPLACE VIEW public.document_open_balances
WITH (security_invoker = true) AS
WITH alloc AS (
  SELECT payment_allocations.target_document_id AS doc_id,
         COALESCE(sum(payment_allocations.amount), 0::numeric) AS allocated_in
  FROM payment_allocations
  GROUP BY payment_allocations.target_document_id
), consumed AS (
  SELECT doc_id, SUM(consumed_out) AS consumed_out FROM (
    SELECT payment_allocations.source_document_id AS doc_id,
           COALESCE(sum(payment_allocations.amount), 0::numeric) AS consumed_out
    FROM payment_allocations
    WHERE payment_allocations.source_document_id IS NOT NULL
    GROUP BY payment_allocations.source_document_id
    UNION ALL
    SELECT settlement_refunds.source_document_id AS doc_id,
           COALESCE(sum(settlement_refunds.amount), 0::numeric) AS consumed_out
    FROM settlement_refunds
    GROUP BY settlement_refunds.source_document_id
  ) u GROUP BY doc_id
)
SELECT d.id AS document_id,
       d.org_id,
       d.party_id,
       d.branch_id,
       CASE
         WHEN d.kind::text = ANY (ARRAY['sales_invoice','simplified_tax_invoice','standard_tax_invoice']) THEN 'invoice'
         WHEN d.kind::text = 'purchase_invoice' THEN 'bill'
         ELSE d.kind::text
       END AS kind,
       d.status::text AS status,
       d.issue_date,
       d.due_date,
       d.doc_number,
       d.currency,
       d.grand_total AS original_amount,
       COALESCE(a.allocated_in, 0) AS allocated_amount,
       COALESCE(c.consumed_out, 0) AS consumed_amount,
       GREATEST(d.grand_total - COALESCE(a.allocated_in, 0), 0) AS open_as_target,
       GREATEST(d.grand_total - COALESCE(c.consumed_out, 0), 0) AS unapplied_as_source
FROM documents d
LEFT JOIN alloc a ON a.doc_id = d.id
LEFT JOIN consumed c ON c.doc_id = d.id
WHERE d.status::text <> ALL (ARRAY['draft','cancelled']);

-- ---------- 3) allocate_payment: locks + currency + period ----------
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
  v_all_ids UUID[]; v_doc_currency TEXT;
  v_period RECORD;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT (public.has_org_role(_org,v_uid,'owner') OR public.has_org_role(_org,v_uid,'admin') OR public.has_org_role(_org,v_uid,'accountant')) THEN
    RAISE EXCEPTION 'forbidden: allocation requires accountant role';
  END IF;

  SELECT * INTO v_period FROM public.find_open_period(_org, v_date);
  IF v_period.period_id IS NULL THEN RAISE EXCEPTION 'no_period_for_date: %', v_date; END IF;
  IF v_period.status <> 'open' THEN RAISE EXCEPTION 'period_closed_or_locked: %', v_period.status; END IF;

  -- Lock every involved document row in a deterministic order so two
  -- concurrent allocations against the same documents serialize instead
  -- of both reading the same open balance.
  SELECT ARRAY(
    SELECT DISTINCT x.id FROM (
      SELECT (l->>'target_document_id')::uuid AS id
        FROM jsonb_array_elements(COALESCE(_payload->'allocations','[]'::jsonb)) l
      UNION SELECT v_source_id WHERE v_source_id IS NOT NULL
    ) x WHERE x.id IS NOT NULL ORDER BY x.id
  ) INTO v_all_ids;
  PERFORM d.id FROM public.documents d
    WHERE d.org_id = _org AND d.id = ANY(v_all_ids)
    ORDER BY d.id FOR UPDATE;

  IF v_source_id IS NOT NULL THEN
    SELECT unapplied_as_source, currency INTO v_unapplied, v_doc_currency
      FROM public.document_open_balances WHERE org_id=_org AND document_id=v_source_id;
    IF v_unapplied IS NULL THEN RAISE EXCEPTION 'source_document_not_found'; END IF;
    IF v_doc_currency IS DISTINCT FROM v_currency THEN
      RAISE EXCEPTION 'currency_mismatch: source is %, allocation is %', v_doc_currency, v_currency;
    END IF;
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(_payload->'allocations') LOOP
    v_target_kind := (v_line->>'target_kind')::public.allocation_target_kind;
    v_target_id := (v_line->>'target_document_id')::uuid;
    v_amount := (v_line->>'amount')::numeric;
    IF v_amount IS NULL OR v_amount <= 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;
    SELECT open_as_target, currency INTO v_open, v_doc_currency
      FROM public.document_open_balances WHERE org_id=_org AND document_id=v_target_id;
    IF v_open IS NULL THEN RAISE EXCEPTION 'target_not_found:%', v_target_id; END IF;
    IF v_doc_currency IS DISTINCT FROM v_currency THEN
      RAISE EXCEPTION 'currency_mismatch: target % is %, allocation is %', v_target_id, v_doc_currency, v_currency;
    END IF;
    IF ROUND(v_amount,2) > ROUND(v_open,2) + 0.005 THEN
      RAISE EXCEPTION 'over_allocation: target=% open=% requested=%', v_target_id, v_open, v_amount;
    END IF;
    IF v_source_id IS NOT NULL THEN
      IF ROUND(v_amount,2) > ROUND(v_unapplied,2) + 0.005 THEN
        RAISE EXCEPTION 'source_exhausted: unapplied=% requested=%', v_unapplied, v_amount;
      END IF;
      v_unapplied := v_unapplied - v_amount;
    END IF;
    INSERT INTO public.payment_allocations(org_id,branch_id,party_id,source_kind,source_document_id,target_kind,target_document_id,amount,currency,exchange_rate,allocation_date,memo,meta,created_by)
    VALUES (_org,v_branch,v_party,v_source_kind,v_source_id,v_target_kind,v_target_id,v_amount,v_currency,v_rate,v_date,v_line->>'memo',COALESCE(v_line->'meta','{}'::jsonb),v_uid)
    RETURNING id INTO v_new_id;
    v_ids := v_ids || v_new_id;
  END LOOP;
  RETURN v_ids;
END $$;

-- ---------- 5) reverse_allocation: period guard ----------
CREATE OR REPLACE FUNCTION public.reverse_allocation(_org UUID, _alloc UUID, _reason TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid UUID := auth.uid(); v_alloc RECORD; v_period RECORD;
BEGIN
  IF NOT (public.has_org_role(_org,v_uid,'owner') OR public.has_org_role(_org,v_uid,'admin') OR public.has_org_role(_org,v_uid,'accountant')) THEN
    RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO v_alloc FROM public.payment_allocations WHERE id=_alloc AND org_id=_org;
  IF v_alloc.id IS NULL THEN RAISE EXCEPTION 'allocation_not_found'; END IF;

  SELECT * INTO v_period FROM public.find_open_period(_org, v_alloc.allocation_date);
  IF v_period.period_id IS NOT NULL AND v_period.status <> 'open' THEN
    RAISE EXCEPTION 'allocation_period_closed: أعد فتح الفترة قبل عكس التسوية';
  END IF;

  DELETE FROM public.payment_allocations WHERE id=_alloc;
  INSERT INTO public.financial_audit_log(org_id,event_kind,party_id,source_document_id,target_document_id,allocation_id,amount,currency,reason,actor_id,before_state)
    VALUES(_org,'allocation_reversed',v_alloc.party_id,v_alloc.source_document_id,v_alloc.target_document_id,_alloc,v_alloc.amount,v_alloc.currency,_reason,v_uid,to_jsonb(v_alloc));
END $$;

-- ---------- 4) create_refund: bounded by unapplied balance ----------
CREATE OR REPLACE FUNCTION public.create_refund(_org UUID, _payload JSONB)
RETURNS UUID
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
  v_lines JSONB; v_is_customer BOOLEAN; v_bank_code TEXT; v_unapplied NUMERIC;
BEGIN
  IF NOT (public.has_org_role(_org,v_uid,'owner') OR public.has_org_role(_org,v_uid,'admin') OR public.has_org_role(_org,v_uid,'accountant')) THEN
    RAISE EXCEPTION 'forbidden'; END IF;
  IF v_amount IS NULL OR v_amount <= 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;
  SELECT * INTO v_src FROM public.documents WHERE id=v_source AND org_id=_org FOR UPDATE;
  IF v_src.id IS NULL THEN RAISE EXCEPTION 'source_not_found'; END IF;
  SELECT * INTO v_bank_acc FROM public.cash_bank_accounts WHERE id=v_bank AND org_id=_org;
  IF v_bank_acc.id IS NULL THEN RAISE EXCEPTION 'bank_not_found'; END IF;
  v_bank_code := v_bank_acc.gl_account_code;

  -- A refund returns money that is not applied to any document; it may
  -- never exceed the source voucher's unapplied balance.
  SELECT unapplied_as_source INTO v_unapplied
    FROM public.document_open_balances WHERE org_id=_org AND document_id=v_source;
  IF v_unapplied IS NULL THEN RAISE EXCEPTION 'source_not_found'; END IF;
  IF ROUND(v_amount,2) > ROUND(v_unapplied,2) + 0.005 THEN
    RAISE EXCEPTION 'refund_exceeds_unapplied: unapplied=% requested=%', v_unapplied, v_amount;
  END IF;

  v_is_customer := v_src.kind::text IN ('receipt_voucher','credit_note');
  IF v_is_customer THEN
    v_ar := public.resolve_account(_org, v_src.branch_id, 'refund','accounts_receivable');
    v_lines := jsonb_build_array(
      jsonb_build_object('account_code', v_ar,        'debit', v_amount, 'credit', 0, 'party_id', v_src.party_id, 'description','Refund ' || v_src.doc_number),
      jsonb_build_object('account_code', v_bank_code, 'debit', 0, 'credit', v_amount, 'party_id', v_src.party_id, 'description','Refund ' || v_src.doc_number)
    );
  ELSE
    v_ap := public.resolve_account(_org, v_src.branch_id, 'refund','accounts_payable');
    v_lines := jsonb_build_array(
      jsonb_build_object('account_code', v_bank_code, 'debit', v_amount, 'credit', 0, 'party_id', v_src.party_id, 'description','Refund ' || v_src.doc_number),
      jsonb_build_object('account_code', v_ap,        'debit', 0, 'credit', v_amount, 'party_id', v_src.party_id, 'description','Refund ' || v_src.doc_number)
    );
  END IF;

  v_je_id := public.post_journal(_org, jsonb_build_object(
    'entry_date',v_date,'memo',COALESCE(v_reason,'Refund ' || v_src.doc_number),
    'source_module', CASE WHEN v_is_customer THEN 'AR' ELSE 'AP' END,
    'source_document_type','refund','source_document_id',v_source,
    'event_type','refund_created','branch_id',v_src.branch_id,'lines',v_lines
  ));

  INSERT INTO public.settlement_refunds(org_id, source_document_id, amount, currency, refund_date, journal_entry_id, reason, created_by)
  VALUES (_org, v_source, v_amount, v_src.currency, v_date, v_je_id, v_reason, v_uid);

  INSERT INTO public.cash_bank_transactions(org_id,account_id,branch_id,party_id,kind,txn_date,amount,currency,exchange_rate,memo,source_document_id,journal_entry_id,meta)
  VALUES (_org,v_bank,v_src.branch_id,v_src.party_id,
    CASE WHEN v_is_customer THEN 'payment_out'::public.cash_txn_kind ELSE 'receipt_in'::public.cash_txn_kind END,
    v_date, CASE WHEN v_is_customer THEN -v_amount ELSE v_amount END, v_src.currency, v_src.exchange_rate, v_reason,
    v_source, v_je_id, jsonb_build_object('source_kind','refund'));

  INSERT INTO public.posting_events(org_id,event_type,event_key,source_module,source_document_id,journal_entry_id,payload,status,created_by,processed_at)
    VALUES(_org,'refund_created', 'refund:' || v_source::text || ':' || v_je_id::text, CASE WHEN v_is_customer THEN 'AR' ELSE 'AP' END, v_source, v_je_id,
      jsonb_build_object('reason',v_reason,'party_id',v_src.party_id,'amount',v_amount,'currency',v_src.currency,'source_document_type','refund'),
      'processed', v_uid, now())
    RETURNING id INTO v_event_id;

  INSERT INTO public.financial_audit_log(org_id,event_kind,party_id,source_document_id,posting_event_id,amount,currency,reason,actor_id)
    VALUES(_org,'refund_created',v_src.party_id,v_source,v_event_id,v_amount,v_src.currency,v_reason,v_uid);

  PERFORM public.recompute_document_financial_state(_org, v_source);
  UPDATE public.documents SET financial_state='refunded' WHERE id=v_source AND org_id=_org;
  RETURN v_je_id;
END $$;

-- ---------- 6) auto-FIFO settles same-currency documents only ----------
CREATE OR REPLACE FUNCTION public._create_settlement_doc(_org uuid, _kind doc_kind, _payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_bank_code TEXT;
  v_ar_code TEXT; v_ap_code TEXT;
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
  v_bank_code := v_bank_acc.gl_account_code;
  IF v_bank_code IS NULL THEN RAISE EXCEPTION 'cash_bank_account_missing_gl_account_code'; END IF;

  SELECT id INTO v_fy FROM public.fiscal_years WHERE org_id=_org AND v_date BETWEEN start_date AND end_date LIMIT 1;
  v_doc_number := public.next_document_number(_org, v_branch, v_fy, _kind::text);

  IF _kind = 'receipt_voucher' THEN
    v_kind_label := 'Receipt';
    v_alloc_source_kind := 'receipt';
    v_alloc_target_kinds := ARRAY['invoice','debit_note'];
    v_ar_code := public.resolve_account(_org, v_branch, 'receipt_voucher','accounts_receivable');
    IF v_ar_code IS NULL THEN RAISE EXCEPTION 'no_account_for_key:accounts_receivable'; END IF;
  ELSIF _kind = 'payment_voucher' THEN
    v_kind_label := 'Payment';
    v_alloc_source_kind := 'supplier_payment';
    v_alloc_target_kinds := ARRAY['bill','credit_note'];
    v_ap_code := public.resolve_account(_org, v_branch, 'payment_voucher','accounts_payable');
    IF v_ap_code IS NULL THEN RAISE EXCEPTION 'no_account_for_key:accounts_payable'; END IF;
  ELSE
    RAISE EXCEPTION 'unsupported_kind: %', _kind;
  END IF;

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

  IF _kind = 'receipt_voucher' THEN
    v_je_lines := jsonb_build_array(
      jsonb_build_object('account_code', v_bank_code, 'debit', v_amount, 'credit', 0, 'party_id', v_party, 'description', v_kind_label || ' ' || v_doc_number),
      jsonb_build_object('account_code', v_ar_code,   'debit', 0, 'credit', v_amount, 'party_id', v_party, 'description', v_kind_label || ' ' || v_doc_number)
    );
  ELSE
    v_je_lines := jsonb_build_array(
      jsonb_build_object('account_code', v_ap_code,   'debit', v_amount, 'credit', 0, 'party_id', v_party, 'description', v_kind_label || ' ' || v_doc_number),
      jsonb_build_object('account_code', v_bank_code, 'debit', 0, 'credit', v_amount, 'party_id', v_party, 'description', v_kind_label || ' ' || v_doc_number)
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

  INSERT INTO public.cash_bank_transactions(
    org_id, account_id, branch_id, party_id, kind, txn_date,
    amount, currency, exchange_rate, reference, memo,
    source_document_id, journal_entry_id, meta
  ) VALUES (
    _org, v_bank, v_branch, v_party,
    CASE WHEN _kind='receipt_voucher' THEN 'receipt_in'::public.cash_txn_kind ELSE 'payment_out'::public.cash_txn_kind END,
    v_date,
    CASE WHEN _kind='receipt_voucher' THEN v_amount ELSE -v_amount END,
    v_currency, v_rate, v_reference, v_memo,
    v_doc_id, v_je_id,
    jsonb_build_object('doc_number', v_doc_number, 'source_kind', _kind::text)
  );

  INSERT INTO public.posting_events(
    org_id, event_type, event_key, source_module, source_document_id,
    journal_entry_id, payload, status, created_by, processed_at
  ) VALUES (
    _org,
    CASE WHEN _kind='receipt_voucher' THEN 'receipt_created' ELSE 'payment_created' END::public.posting_event_type,
    _kind::text || ':' || v_doc_id::text,
    CASE WHEN _kind='receipt_voucher' THEN 'AR' ELSE 'AP' END,
    v_doc_id, v_je_id,
    jsonb_build_object('doc_number', v_doc_number, 'reference', v_reference,
      'party_id', v_party, 'amount', v_amount, 'currency', v_currency,
      'source_document_type', _kind::text),
    'processed', v_uid, now()
  ) RETURNING id INTO v_event_id;

  INSERT INTO public.financial_audit_log(org_id,event_kind,party_id,source_document_id,posting_event_id,amount,currency,actor_id,after_state)
    VALUES (_org, CASE WHEN _kind='receipt_voucher' THEN 'receipt_created' ELSE 'payment_created' END::public.financial_audit_kind,
      v_party, v_doc_id, v_event_id, v_amount, v_currency, v_uid,
      jsonb_build_object('doc_number', v_doc_number));

  v_allocations := COALESCE(_payload->'allocations','[]'::jsonb);

  IF v_auto_fifo AND jsonb_array_length(v_allocations)=0 THEN
    v_remaining := v_amount;
    FOR v_row IN
      SELECT document_id, kind, open_as_target
      FROM public.document_open_balances
      WHERE org_id=_org AND party_id=v_party AND kind = ANY(v_alloc_target_kinds) AND open_as_target > 0.005
        AND currency = v_currency -- settle only same-currency documents
      ORDER BY issue_date NULLS LAST, doc_number NULLS LAST, document_id
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

  SELECT unapplied_as_source INTO v_advance FROM public.document_open_balances WHERE org_id=_org AND document_id=v_doc_id;
  IF COALESCE(v_advance,0) > 0.005 THEN
    INSERT INTO public.financial_audit_log(org_id,event_kind,party_id,source_document_id,amount,currency,actor_id,after_state)
      VALUES (_org,'advance_created',v_party,v_doc_id,v_advance,v_currency,v_uid,
        jsonb_build_object('doc_number', v_doc_number, 'advance_amount', v_advance));
  END IF;

  PERFORM public.recompute_document_financial_state(_org, v_doc_id);
  RETURN v_doc_id;
END $function$;

CREATE INDEX IF NOT EXISTS idx_documents_org_party_open_fifo
  ON public.documents (org_id, party_id, issue_date, doc_number)
  WHERE status <> 'draft' AND status <> 'cancelled';

CREATE INDEX IF NOT EXISTS idx_payment_allocations_target
  ON public.payment_allocations (target_document_id);
CREATE INDEX IF NOT EXISTS idx_payment_allocations_source
  ON public.payment_allocations (source_document_id) WHERE source_document_id IS NOT NULL;
