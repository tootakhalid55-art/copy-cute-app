-- ============================================================
-- Phase 2 — Atomic server-side document posting
--
-- Replaces the browser-side posting bridge (document event ->
-- client builds journal lines -> post_journal RPC) with a single
-- transactional RPC. The document status change and its journal
-- entry now commit or roll back together.
--
--   post_document(_org, _doc_id)    : validate -> transition to
--     'posted' -> evaluate the org's posting rule server-side ->
--     post_journal, all in one transaction. Idempotent per document.
--   cancel_document(_org, _doc_id, _reason) : reverses the
--     document's journal entry (if posted) and transitions to
--     'cancelled'. Refuses while settlements reference the document.
--   eval_rule_expr(expr, scope)     : safe arithmetic evaluator for
--     posting-rule amount expressions (numbers, identifiers, + - * / parens).
-- ============================================================

CREATE OR REPLACE FUNCTION public.eval_rule_expr(_expr text, _scope jsonb)
RETURNS numeric LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE v_sub text; v_tok text; v_out numeric;
BEGIN
  IF _expr IS NULL OR btrim(_expr) = '' THEN RETURN 0; END IF;
  v_sub := _expr;
  FOR v_tok IN SELECT DISTINCT m[1] FROM regexp_matches(_expr, '([a-zA-Z_][a-zA-Z0-9_]*)', 'g') m LOOP
    v_sub := regexp_replace(v_sub, '\m' || v_tok || '\M', COALESCE(_scope->>v_tok, '0'), 'g');
  END LOOP;
  IF v_sub !~ '^[0-9+\-*/(). ]+$' THEN
    RAISE EXCEPTION 'invalid_rule_expr: %', _expr;
  END IF;
  EXECUTE 'SELECT (' || v_sub || ')::numeric' INTO v_out;
  RETURN COALESCE(v_out, 0);
END $$;

CREATE OR REPLACE FUNCTION public.post_document(_org uuid, _doc_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  d RECORD;
  v_event public.posting_event_type;
  v_rule RECORD;
  v_scope jsonb;
  v_lines jsonb := '[]'::jsonb;
  v_leg jsonb;
  v_amt numeric;
  v_code text;
  v_key text;
  v_event_key text;
  v_je uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT (public.has_org_role(_org, v_uid, 'owner') OR public.has_org_role(_org, v_uid, 'admin') OR public.has_org_role(_org, v_uid, 'accountant')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO d FROM public.documents WHERE id = _doc_id AND org_id = _org FOR UPDATE;
  IF d.id IS NULL THEN RAISE EXCEPTION 'document_not_found'; END IF;
  IF d.status = 'posted' THEN
    SELECT id INTO v_je FROM public.journal_entries
      WHERE org_id = _org AND source_document_id = d.id AND status = 'posted'
      ORDER BY created_at DESC LIMIT 1;
    RETURN jsonb_build_object('document_id', d.id, 'journal_id', v_je, 'already_posted', true);
  END IF;
  IF d.status NOT IN ('draft', 'issued', 'approved') THEN
    RAISE EXCEPTION 'document_not_postable: %', d.status;
  END IF;

  v_event := CASE d.kind::text
    WHEN 'sales_invoice'          THEN 'invoice_posted'
    WHEN 'simplified_tax_invoice' THEN 'invoice_posted'
    WHEN 'standard_tax_invoice'   THEN 'invoice_posted'
    WHEN 'purchase_invoice'       THEN 'expense_posted'
    WHEN 'expense_voucher'        THEN 'expense_posted'
    WHEN 'credit_note'            THEN 'credit_note_posted'
    WHEN 'debit_note'             THEN 'debit_note_posted'
    ELSE NULL END::public.posting_event_type;
  IF v_event IS NULL THEN RAISE EXCEPTION 'kind_not_postable: %', d.kind; END IF;
  IF COALESCE(d.grand_total, 0) <= 0 THEN RAISE EXCEPTION 'document_total_must_be_positive'; END IF;

  SELECT id, config INTO v_rule FROM public.posting_rules
    WHERE org_id = _org AND event_type = v_event AND is_active
    ORDER BY priority ASC LIMIT 1;
  IF v_rule.id IS NULL THEN
    RAISE EXCEPTION 'no_posting_rule_for_event: %', v_event;
  END IF;

  v_scope := jsonb_build_object(
    'subtotal',       COALESCE(d.subtotal, 0)::text,
    'discount_total', COALESCE(d.discount_total, 0)::text,
    'vat_total',      COALESCE(d.vat_total, 0)::text,
    'shipping',       COALESCE(d.shipping, 0)::text,
    'other_charges',  COALESCE(d.other_charges, 0)::text,
    'grand_total',    COALESCE(d.grand_total, 0)::text,
    'amount',         COALESCE(d.grand_total, 0)::text,
    'exchange_rate',  COALESCE(d.exchange_rate, 1)::text
  );

  FOR v_leg IN SELECT * FROM jsonb_array_elements(COALESCE(v_rule.config->'legs', '[]'::jsonb)) LOOP
    v_amt := ROUND(public.eval_rule_expr(v_leg->>'amount_expr', v_scope), 2);
    IF v_amt IS NULL OR v_amt = 0 THEN CONTINUE; END IF;
    v_code := NULLIF(v_leg->>'account_code', '');
    v_key  := NULLIF(v_leg->>'account_key', '');
    IF v_code IS NULL AND v_key IS NOT NULL THEN
      v_code := public.resolve_account(_org, d.branch_id, d.kind::text, v_key);
      IF v_code IS NULL THEN RAISE EXCEPTION 'missing_account_determination: %', v_key; END IF;
    END IF;
    IF v_code IS NULL THEN RAISE EXCEPTION 'posting_rule_missing_account_code'; END IF;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'account_code', v_code,
      'debit',  CASE WHEN v_leg->>'side' = 'debit'  THEN v_amt ELSE 0 END,
      'credit', CASE WHEN v_leg->>'side' = 'credit' THEN v_amt ELSE 0 END,
      'description', COALESCE(v_leg->>'description', ''),
      'cost_center_code', NULLIF(v_leg->>'cost_center_code', ''),
      'party_id', CASE WHEN v_key IN ('accounts_receivable','accounts_payable') THEN d.party_id::text END
    ));
  END LOOP;
  IF jsonb_array_length(v_lines) < 2 THEN RAISE EXCEPTION 'rule_produced_less_than_2_lines'; END IF;

  -- Walk the legal state machine to 'posted' (draft -> issued -> posted).
  IF d.status = 'draft' THEN
    UPDATE public.documents SET status = 'issued', updated_by = v_uid WHERE id = d.id;
  END IF;
  UPDATE public.documents SET status = 'posted', updated_by = v_uid WHERE id = d.id;

  v_event_key := 'doc:' || v_event::text || ':' || d.id::text;
  v_je := public.post_journal(_org, jsonb_build_object(
    'entry_date', d.issue_date::text,
    'memo', COALESCE('ترحيل ' || d.doc_number, 'ترحيل مستند'),
    'currency', COALESCE(d.currency, 'SAR'),
    'exchange_rate', COALESCE(d.exchange_rate, 1),
    'branch_id', d.branch_id,
    'source_module', 'documents',
    'source_document_type', d.kind::text,
    'source_document_id', d.id::text,
    'event_type', v_event::text,
    'event_id', v_event_key,
    'lines', v_lines
  ));

  INSERT INTO public.posting_events (org_id, event_type, event_key, payload, source_module, source_document_id, status, journal_entry_id, processed_at)
  VALUES (_org, v_event, v_event_key, v_scope, 'documents', d.id, 'processed', v_je, now())
  ON CONFLICT (org_id, event_key) DO UPDATE
    SET status = 'processed', journal_entry_id = EXCLUDED.journal_entry_id, processed_at = now(), error = NULL;

  RETURN jsonb_build_object('document_id', d.id, 'journal_id', v_je);
END $$;

REVOKE ALL ON FUNCTION public.post_document(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_document(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cancel_document(_org uuid, _doc_id uuid, _reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  d RECORD;
  v_je uuid;
  v_rev uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT (public.has_org_role(_org, v_uid, 'owner') OR public.has_org_role(_org, v_uid, 'admin') OR public.has_org_role(_org, v_uid, 'accountant')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO d FROM public.documents WHERE id = _doc_id AND org_id = _org FOR UPDATE;
  IF d.id IS NULL THEN RAISE EXCEPTION 'document_not_found'; END IF;
  IF d.status = 'cancelled' THEN RETURN jsonb_build_object('document_id', d.id, 'already_cancelled', true); END IF;

  IF EXISTS (
    SELECT 1 FROM public.payment_allocations
    WHERE org_id = _org AND (source_document_id = d.id OR target_document_id = d.id)
  ) THEN
    RAISE EXCEPTION 'document_has_allocations: عكس التسويات المرتبطة أولاً';
  END IF;

  IF d.status = 'posted' THEN
    SELECT id INTO v_je FROM public.journal_entries
      WHERE org_id = _org AND source_document_id = d.id AND status = 'posted'
      ORDER BY created_at DESC LIMIT 1;
    IF v_je IS NOT NULL THEN
      v_rev := public.reverse_journal(_org, v_je, COALESCE('إلغاء ' || d.doc_number || ': ' || _reason, 'إلغاء ' || d.doc_number), CURRENT_DATE);
    END IF;
  END IF;

  UPDATE public.documents
    SET status = 'cancelled', updated_by = v_uid,
        meta = COALESCE(meta, '{}'::jsonb) || jsonb_build_object('cancel_reason', _reason, 'reversal_journal_id', v_rev)
    WHERE id = d.id;

  RETURN jsonb_build_object('document_id', d.id, 'reversal_journal_id', v_rev);
END $$;

REVOKE ALL ON FUNCTION public.cancel_document(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_document(uuid, uuid, text) TO authenticated, service_role;
