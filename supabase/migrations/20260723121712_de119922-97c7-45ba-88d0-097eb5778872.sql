
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
  v_debit NUMERIC; v_credit NUMERIC;
  v_debit_fc NUMERIC; v_credit_fc NUMERIC;
  v_line_currency TEXT; v_line_rate NUMERIC;
  v_total_debit NUMERIC := 0; v_total_credit NUMERIC := 0;
  v_line_no INT := 0;
  v_event_id TEXT := _payload->>'event_id';
  v_existing UUID;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT (public.has_org_role(_org, v_uid,'owner') OR public.has_org_role(_org, v_uid,'admin') OR public.has_org_role(_org, v_uid,'accountant')) THEN
    RAISE EXCEPTION 'forbidden: missing accountant role';
  END IF;

  IF v_event_id IS NOT NULL THEN
    SELECT id INTO v_existing FROM public.journal_entries WHERE org_id=_org AND event_id=v_event_id;
    IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
  END IF;

  SELECT * INTO v_period FROM public.find_open_period(_org, v_date);
  IF v_period.period_id IS NULL THEN RAISE EXCEPTION 'no_period_for_date: %', v_date; END IF;
  IF v_period.status <> 'open' THEN RAISE EXCEPTION 'period_closed_or_locked: %', v_period.status; END IF;

  IF EXISTS (SELECT 1 FROM public.fiscal_years fy WHERE fy.id = v_period.fiscal_year_id AND (fy.is_locked OR fy.is_closed)) THEN
    RAISE EXCEPTION 'fiscal_year_locked';
  END IF;

  v_entry_number := 'JE-' || to_char(now(),'YYYYMM') || '-' || substr(replace(gen_random_uuid()::text,'-',''),1,8);

  -- Insert as DRAFT first (guard allows mutation on draft)
  INSERT INTO public.journal_entries(
    org_id, branch_id, fiscal_year_id, period_id, entry_number, entry_date, memo, status,
    currency, exchange_rate, source_module, source_document_type, source_document_id,
    event_type, event_id, created_by, meta
  ) VALUES (
    _org,
    NULLIF(_payload->>'branch_id','')::uuid,
    v_period.fiscal_year_id, v_period.period_id, v_entry_number, v_date,
    _payload->>'memo', 'draft',
    v_currency, v_rate,
    _payload->>'source_module', _payload->>'source_document_type',
    NULLIF(_payload->>'source_document_id','')::uuid,
    NULLIF(_payload->>'event_type','')::public.posting_event_type,
    v_event_id, v_uid,
    COALESCE(_payload->'meta','{}'::jsonb)
  ) RETURNING id INTO v_entry_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(_payload->'lines') LOOP
    v_line_no := v_line_no + 1;
    SELECT * INTO v_account FROM public.chart_of_accounts WHERE org_id=_org AND code = v_line->>'account_code';
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
    IF v_debit > 0 AND v_credit > 0 THEN RAISE EXCEPTION 'line_debit_and_credit_both_set'; END IF;
    IF v_debit = 0 AND v_credit = 0 THEN RAISE EXCEPTION 'line_zero_amount'; END IF;

    INSERT INTO public.journal_lines(
      entry_id, org_id, line_no, account_id, branch_id, cost_center_id, party_id,
      description, currency, exchange_rate, debit_fc, credit_fc, debit, credit, meta
    ) VALUES (
      v_entry_id, _org, v_line_no, v_account.id,
      NULLIF(v_line->>'branch_id','')::uuid, v_cc, NULLIF(v_line->>'party_id','')::uuid,
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

  -- Flip from draft to posted with totals + posted audit
  UPDATE public.journal_entries
    SET total_debit = v_total_debit, total_credit = v_total_credit,
        status = 'posted', posted_by = v_uid, posted_at = now()
    WHERE id = v_entry_id;

  RETURN v_entry_id;
END; $$;
