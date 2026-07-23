
CREATE OR REPLACE FUNCTION public.get_statement(_org uuid, _account_kind text, _account_id uuid, _from date DEFAULT NULL::date, _to date DEFAULT CURRENT_DATE)
 RETURNS TABLE(txn_date date, doc_kind text, doc_id uuid, doc_number text, description text, debit numeric, credit numeric, balance numeric, currency text, is_opening boolean)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_opening NUMERIC := 0;
BEGIN
  IF NOT public.is_org_member(_org, auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;

  IF _account_kind IN ('customer','supplier') THEN
    IF _from IS NOT NULL THEN
      SELECT COALESCE(SUM(CASE WHEN _account_kind='customer' THEN
          CASE WHEN d.kind::text IN ('sales_invoice','simplified_tax_invoice','standard_tax_invoice','debit_note') THEN d.grand_total
               WHEN d.kind::text IN ('credit_note','receipt_voucher') THEN -d.grand_total ELSE 0 END
        ELSE CASE WHEN d.kind::text IN ('purchase_invoice','debit_note') THEN d.grand_total
                  WHEN d.kind::text IN ('credit_note','payment_voucher') THEN -d.grand_total ELSE 0 END END),0)
      INTO v_opening FROM public.documents d
      WHERE d.org_id=_org AND d.party_id=_account_id AND d.issue_date < _from AND d.status::text NOT IN ('draft','cancelled');
    END IF;
    RETURN QUERY
    WITH movements AS (
      SELECT d.issue_date AS txn_date, d.kind::text AS doc_kind, d.id AS doc_id, d.doc_number,
             COALESCE(d.notes,'') AS description,
             CASE WHEN _account_kind='customer' THEN
               CASE WHEN d.kind::text IN ('sales_invoice','simplified_tax_invoice','standard_tax_invoice','debit_note') THEN d.grand_total ELSE 0 END
             ELSE CASE WHEN d.kind::text = 'payment_voucher' THEN d.grand_total ELSE 0 END END AS debit,
             CASE WHEN _account_kind='customer' THEN
               CASE WHEN d.kind::text IN ('credit_note','receipt_voucher') THEN d.grand_total ELSE 0 END
             ELSE CASE WHEN d.kind::text IN ('purchase_invoice','debit_note','credit_note') THEN d.grand_total ELSE 0 END END AS credit,
             d.currency
      FROM public.documents d
      WHERE d.org_id=_org AND d.party_id=_account_id
        AND (_from IS NULL OR d.issue_date >= _from) AND (_to IS NULL OR d.issue_date <= _to)
        AND d.status::text NOT IN ('draft','cancelled')
    ), ordered AS (
      SELECT NULL::DATE AS txn_date, 'opening'::TEXT AS doc_kind, NULL::UUID AS doc_id, NULL::TEXT AS doc_number,
             'Opening balance'::TEXT AS description,
             CASE WHEN v_opening>=0 THEN v_opening ELSE 0 END::NUMERIC AS debit,
             CASE WHEN v_opening<0 THEN -v_opening ELSE 0 END::NUMERIC AS credit,
             'SAR'::TEXT AS currency, TRUE AS is_opening
      UNION ALL
      SELECT m.txn_date, m.doc_kind, m.doc_id, m.doc_number, m.description, m.debit, m.credit, m.currency, FALSE FROM movements m
    ), running AS (
      SELECT o.*, SUM(o.debit - o.credit) OVER (ORDER BY o.is_opening DESC, o.txn_date, o.doc_id) AS bal FROM ordered o
    )
    SELECT r.txn_date, r.doc_kind, r.doc_id, r.doc_number, r.description, r.debit, r.credit, r.bal, r.currency, r.is_opening
    FROM running r ORDER BY r.is_opening DESC, r.txn_date NULLS FIRST, r.doc_id;

  ELSIF _account_kind = 'cash_account' THEN
    IF _from IS NOT NULL THEN
      SELECT COALESCE(SUM(t.amount),0) INTO v_opening FROM public.cash_bank_transactions t
      WHERE t.org_id=_org AND t.account_id=_account_id AND t.txn_date < _from;
    END IF;
    RETURN QUERY
    WITH movements AS (
      SELECT t.txn_date, t.kind::text AS doc_kind, t.source_document_id AS doc_id,
             COALESCE(t.reference,'') AS doc_number, COALESCE(t.memo,'') AS description,
             CASE WHEN t.amount > 0 THEN t.amount ELSE 0 END AS debit,
             CASE WHEN t.amount < 0 THEN -t.amount ELSE 0 END AS credit, t.currency
      FROM public.cash_bank_transactions t
      WHERE t.org_id=_org AND t.account_id=_account_id
        AND (_from IS NULL OR t.txn_date >= _from) AND (_to IS NULL OR t.txn_date <= _to)
    ), ordered AS (
      SELECT NULL::DATE AS txn_date, 'opening'::TEXT AS doc_kind, NULL::UUID AS doc_id, NULL::TEXT AS doc_number,
             'Opening balance'::TEXT AS description,
             CASE WHEN v_opening>=0 THEN v_opening ELSE 0 END::NUMERIC AS debit,
             CASE WHEN v_opening<0 THEN -v_opening ELSE 0 END::NUMERIC AS credit,
             'SAR'::TEXT AS currency, TRUE AS is_opening
      UNION ALL
      SELECT m.txn_date, m.doc_kind, m.doc_id, m.doc_number, m.description, m.debit, m.credit, m.currency, FALSE FROM movements m
    ), running AS (
      SELECT o.*, SUM(o.debit - o.credit) OVER (ORDER BY o.is_opening DESC, o.txn_date, o.doc_id) AS bal FROM ordered o
    )
    SELECT r.txn_date, r.doc_kind, r.doc_id, r.doc_number, r.description, r.debit, r.credit, r.bal, r.currency, r.is_opening
    FROM running r ORDER BY r.is_opening DESC, r.txn_date NULLS FIRST, r.doc_id;
  ELSE RAISE EXCEPTION 'unsupported_account_kind: %', _account_kind; END IF;
END $function$;
