
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

  SELECT unapplied_as_source INTO v_advance FROM public.document_open_balances WHERE org_id=_org AND document_id=v_doc_id;
  IF COALESCE(v_advance,0) > 0.005 THEN
    INSERT INTO public.financial_audit_log(org_id,event_kind,party_id,source_document_id,amount,currency,actor_id,after_state)
      VALUES (_org,'advance_created',v_party,v_doc_id,v_advance,v_currency,v_uid,
        jsonb_build_object('doc_number', v_doc_number, 'advance_amount', v_advance));
  END IF;

  PERFORM public.recompute_document_financial_state(_org, v_doc_id);
  RETURN v_doc_id;
END $$;
