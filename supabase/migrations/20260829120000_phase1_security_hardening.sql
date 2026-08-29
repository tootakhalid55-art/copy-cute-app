-- ============================================================
-- Phase 1 — Security & correctness hardening
--
-- 1) Add missing financial_audit_kind value used by FA functions
-- 2) Tenant isolation: org-role guard on 4 FA lifecycle RPCs
-- 3) Tenant isolation: security_invoker on 3 FA reporting views
-- 4) Fix fa_lock_period_on_post audit insert (wrong column list)
-- 5) Fix fa_post_depreciation_run (called nonexistent function)
-- 6) Storage-level integrity guards:
--      - journal_entries: INSERT must be draft; posting requires
--        balanced lines matching header totals
--      - journal_lines: no INSERT into posted/reversed entries
--      - documents: posted docs are financially immutable and
--        cannot be deleted
--      - document_lines: immutable once the parent doc is posted
--      - payment_allocations / cash_bank_transactions: direct
--        writes revoked; RPCs (SECURITY DEFINER) remain the only
--        write path
-- 7) pg_cron hooks: secret + base URL read from Vault instead of
--    a hardcoded publishable key and Lovable URL.
--    Requires one-time setup on the database:
--      select vault.create_secret('<random-64-hex>', 'cron_hook_secret');
--      select vault.create_secret('https://accounting.canarmodern.com', 'app_base_url');
--    and CRON_HOOK_SECRET set in the app server environment.
-- ============================================================

-- ---------- 1) enum value used by FA + bill posting audit ----------
ALTER TYPE public.financial_audit_kind ADD VALUE IF NOT EXISTS 'manual_journal_posted';

-- ---------- 3) views must run with caller's RLS ----------
ALTER VIEW public.v_asset_timeline          SET (security_invoker = true);
ALTER VIEW public.v_fixed_asset_exceptions  SET (security_invoker = true);
ALTER VIEW public.v_fa_calendar             SET (security_invoker = true);

-- ---------- 2) org-role guard on unprotected FA lifecycle RPCs ----------
CREATE OR REPLACE FUNCTION public.fa_transfer(_asset_id uuid, _to_branch uuid, _to_cost_center uuid, _custodian_user uuid, _custodian_name text, _location text, _date date, _notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a RECORD; v_event_id uuid; v_before jsonb; v_after jsonb;
BEGIN
  SELECT * INTO a FROM public.fixed_assets WHERE id = _asset_id;
  IF a.id IS NULL THEN RAISE EXCEPTION 'asset_not_found'; END IF;
  PERFORM public.fa_assert_operator(a.org_id);
  IF a.status IN ('disposed','retired','written_off') THEN RAISE EXCEPTION 'asset_disposed'; END IF;
  v_before := to_jsonb(a); v_event_id := gen_random_uuid();
  UPDATE public.fixed_assets
  SET branch_id = COALESCE(_to_branch, branch_id), cost_center_id = COALESCE(_to_cost_center, cost_center_id),
      custodian_user_id = COALESCE(_custodian_user, custodian_user_id), custodian_name = COALESCE(_custodian_name, custodian_name),
      location_text = COALESCE(_location, location_text), updated_at = now()
  WHERE id = a.id RETURNING to_jsonb(fixed_assets.*) INTO v_after;
  INSERT INTO public.fixed_asset_events (id, org_id, asset_id, event_type, status, effective_date, amount, payload, notes, before_state, after_state, created_by)
  VALUES (v_event_id, a.org_id, a.id, 'transfer', 'posted', _date, 0,
    jsonb_build_object('from_branch', a.branch_id, 'to_branch', _to_branch, 'from_cc', a.cost_center_id, 'to_cc', _to_cost_center,
      'from_custodian', a.custodian_name, 'to_custodian', _custodian_name, 'from_location', a.location_text, 'to_location', _location),
    _notes, v_before, v_after, auth.uid());
  RETURN jsonb_build_object('event_id', v_event_id);
END $$;

CREATE OR REPLACE FUNCTION public.fa_retire(_asset_id uuid, _date date, _notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a RECORD; v_event_id uuid; v_before jsonb; v_after jsonb;
BEGIN
  SELECT * INTO a FROM public.fixed_assets WHERE id = _asset_id;
  IF a.id IS NULL THEN RAISE EXCEPTION 'asset_not_found'; END IF;
  PERFORM public.fa_assert_operator(a.org_id);
  v_before := to_jsonb(a); v_event_id := gen_random_uuid();
  UPDATE public.fixed_assets SET status='retired'::fa_status, updated_at=now() WHERE id=a.id RETURNING to_jsonb(fixed_assets.*) INTO v_after;
  INSERT INTO public.fixed_asset_events (id, org_id, asset_id, event_type, status, effective_date, amount, payload, notes, before_state, after_state, created_by)
  VALUES (v_event_id, a.org_id, a.id, 'retirement','posted', _date, 0, '{}'::jsonb, _notes, v_before, v_after, auth.uid());
  RETURN jsonb_build_object('event_id', v_event_id);
END $$;

CREATE OR REPLACE FUNCTION public.fa_reactivate(_asset_id uuid, _date date, _notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a RECORD; v_event_id uuid; v_before jsonb; v_after jsonb;
BEGIN
  SELECT * INTO a FROM public.fixed_assets WHERE id = _asset_id;
  IF a.id IS NULL THEN RAISE EXCEPTION 'asset_not_found'; END IF;
  PERFORM public.fa_assert_operator(a.org_id);
  IF a.status <> 'retired' THEN RAISE EXCEPTION 'not_retired'; END IF;
  v_before := to_jsonb(a); v_event_id := gen_random_uuid();
  UPDATE public.fixed_assets SET status='active'::fa_status, updated_at=now() WHERE id=a.id RETURNING to_jsonb(fixed_assets.*) INTO v_after;
  INSERT INTO public.fixed_asset_events (id, org_id, asset_id, event_type, status, effective_date, amount, payload, notes, before_state, after_state, created_by)
  VALUES (v_event_id, a.org_id, a.id, 'reactivation','posted', _date, 0, '{}'::jsonb, _notes, v_before, v_after, auth.uid());
  RETURN jsonb_build_object('event_id', v_event_id);
END $$;

CREATE OR REPLACE FUNCTION public.fa_reverse_event(_event_id uuid, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e RECORD; v_new uuid;
BEGIN
  SELECT * INTO e FROM public.fixed_asset_events WHERE id = _event_id;
  IF e.id IS NULL THEN RAISE EXCEPTION 'event_not_found'; END IF;
  PERFORM public.fa_assert_operator(e.org_id);
  IF e.status <> 'posted' THEN RAISE EXCEPTION 'event_not_posted'; END IF;
  UPDATE public.fixed_asset_events SET status='reversed', notes=COALESCE(notes,'')||E'\nReversed: '||_reason WHERE id = e.id;
  v_new := gen_random_uuid();
  INSERT INTO public.fixed_asset_events (id, org_id, asset_id, event_type, status, effective_date, amount, payload, reverses_event_id, notes, created_by)
  VALUES (v_new, e.org_id, e.asset_id, e.event_type, 'posted', CURRENT_DATE, -e.amount, e.payload, e.id, _reason, auth.uid());
  UPDATE public.fixed_asset_events SET reversed_by = v_new WHERE id = e.id;
  RETURN jsonb_build_object('reversal_id', v_new);
END $$;

-- ---------- 4) fa_lock_period_on_post: use real audit columns ----------
CREATE OR REPLACE FUNCTION public.fa_lock_period_on_post()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.status = 'posted' AND (OLD IS NULL OR OLD.status <> 'posted') THEN
    UPDATE public.accounting_periods
       SET fa_locked_at = now(), fa_locked_by = NEW.created_by
     WHERE org_id = NEW.org_id
       AND NEW.period_end BETWEEN start_date AND end_date;
    INSERT INTO public.financial_audit_log(org_id, event_kind, source_document_id, actor_id, after_state)
    VALUES (NEW.org_id, 'manual_journal_posted', NEW.id,
            NEW.created_by,
            jsonb_build_object('event','fa_run_posted','period_end', NEW.period_end, 'total', NEW.total_depreciation, 'assets', NEW.asset_count));
  ELSIF NEW.status = 'reversed' AND OLD.status = 'posted' THEN
    UPDATE public.accounting_periods
       SET fa_locked_at = NULL, fa_locked_by = NULL
     WHERE org_id = NEW.org_id
       AND NEW.period_end BETWEEN start_date AND end_date;
    INSERT INTO public.financial_audit_log(org_id, event_kind, source_document_id, actor_id, after_state)
    VALUES (NEW.org_id, 'manual_journal_posted', NEW.id,
            NEW.reversed_by,
            jsonb_build_object('event','fa_run_reversed','period_end', NEW.period_end));
  END IF;
  RETURN NEW;
END $$;

-- ---------- 6) storage-level integrity guards ----------
-- journal_entries: forbid inserting non-draft entries; verify balance on post
CREATE OR REPLACE FUNCTION public.journal_entries_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_sum_debit numeric; v_sum_credit numeric; v_line_count int;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' THEN
      RAISE EXCEPTION 'journal_must_be_inserted_as_draft';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('posted','reversed') THEN
      RAISE EXCEPTION 'cannot_delete_posted_or_reversed_journal';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'posted' AND NEW.status NOT IN ('posted','reversed') THEN
      RAISE EXCEPTION 'invalid_journal_status_transition';
    END IF;
    IF OLD.status = 'reversed' AND OLD.* IS DISTINCT FROM NEW.* THEN
      IF OLD.total_debit <> NEW.total_debit OR OLD.total_credit <> NEW.total_credit
         OR OLD.entry_date <> NEW.entry_date OR OLD.currency <> NEW.currency THEN
        RAISE EXCEPTION 'cannot_edit_reversed_journal';
      END IF;
    END IF;
    -- posting a draft: lines must balance and match header totals
    IF OLD.status = 'draft' AND NEW.status = 'posted' THEN
      SELECT COALESCE(SUM(debit),0), COALESCE(SUM(credit),0), COUNT(*)
        INTO v_sum_debit, v_sum_credit, v_line_count
        FROM public.journal_lines WHERE entry_id = NEW.id;
      IF v_line_count < 2 THEN
        RAISE EXCEPTION 'journal_needs_at_least_two_lines';
      END IF;
      IF ROUND(v_sum_debit,2) <> ROUND(v_sum_credit,2) THEN
        RAISE EXCEPTION 'journal_unbalanced_lines: debit=% credit=%', v_sum_debit, v_sum_credit;
      END IF;
      IF ROUND(COALESCE(NEW.total_debit,0),2) <> ROUND(v_sum_debit,2)
         OR ROUND(COALESCE(NEW.total_credit,0),2) <> ROUND(v_sum_credit,2) THEN
        RAISE EXCEPTION 'journal_totals_mismatch_lines';
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS je_guard ON public.journal_entries;
CREATE TRIGGER je_guard BEFORE INSERT OR UPDATE OR DELETE ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.journal_entries_guard();

-- journal_lines: also block INSERT into posted/reversed entries
CREATE OR REPLACE FUNCTION public.journal_lines_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_status public.journal_status;
BEGIN
  SELECT status INTO v_status FROM public.journal_entries WHERE id = COALESCE(NEW.entry_id, OLD.entry_id);
  IF v_status IN ('posted','reversed') THEN
    RAISE EXCEPTION 'cannot_modify_lines_of_posted_journal';
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $$;

DROP TRIGGER IF EXISTS jl_guard ON public.journal_lines;
CREATE TRIGGER jl_guard BEFORE INSERT OR UPDATE OR DELETE ON public.journal_lines
  FOR EACH ROW EXECUTE FUNCTION public.journal_lines_guard();

-- documents: posted docs are financially immutable; posted docs cannot be deleted
CREATE OR REPLACE FUNCTION public.documents_guard_posted()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'posted' THEN
      RAISE EXCEPTION 'cannot_delete_posted_document';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status IN ('posted','cancelled') THEN
    IF NEW.kind            IS DISTINCT FROM OLD.kind
       OR NEW.doc_number   IS DISTINCT FROM OLD.doc_number
       OR NEW.party_id     IS DISTINCT FROM OLD.party_id
       OR NEW.issue_date   IS DISTINCT FROM OLD.issue_date
       OR NEW.currency     IS DISTINCT FROM OLD.currency
       OR NEW.tax_inclusive IS DISTINCT FROM OLD.tax_inclusive
       OR NEW.subtotal     IS DISTINCT FROM OLD.subtotal
       OR NEW.discount_total IS DISTINCT FROM OLD.discount_total
       OR NEW.vat_total    IS DISTINCT FROM OLD.vat_total
       OR NEW.shipping     IS DISTINCT FROM OLD.shipping
       OR NEW.other_charges IS DISTINCT FROM OLD.other_charges
       OR NEW.grand_total  IS DISTINCT FROM OLD.grand_total THEN
      RAISE EXCEPTION 'posted_document_is_immutable';
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS doc_guard_posted ON public.documents;
CREATE TRIGGER doc_guard_posted BEFORE UPDATE OR DELETE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.documents_guard_posted();

-- document_lines: immutable once the parent document is posted
CREATE OR REPLACE FUNCTION public.document_lines_guard_posted()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_status public.doc_status;
BEGIN
  SELECT status INTO v_status FROM public.documents WHERE id = COALESCE(NEW.document_id, OLD.document_id);
  IF v_status = 'posted' THEN
    RAISE EXCEPTION 'cannot_modify_lines_of_posted_document';
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $$;

DROP TRIGGER IF EXISTS doc_lines_guard_posted ON public.document_lines;
CREATE TRIGGER doc_lines_guard_posted BEFORE UPDATE OR DELETE ON public.document_lines
  FOR EACH ROW EXECUTE FUNCTION public.document_lines_guard_posted();

-- settlement tables: writes only through the SECURITY DEFINER RPCs
REVOKE INSERT, UPDATE, DELETE ON public.payment_allocations   FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.cash_bank_transactions FROM authenticated;
DROP POLICY IF EXISTS "pa_org_write" ON public.payment_allocations;
DROP POLICY IF EXISTS "cbt_org_write" ON public.cash_bank_transactions;

-- ---------- 7) cron hooks: Vault-based secret + URL ----------
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT jobid FROM cron.job WHERE jobname IN ('ap-intake-processor','finance-health-daily') LOOP
    PERFORM cron.unschedule(r.jobid);
  END LOOP;
EXCEPTION WHEN undefined_table OR undefined_function OR invalid_schema_name THEN NULL; -- pg_cron absent (local dev)
END $$;

DO $$
BEGIN
  PERFORM cron.schedule(
    'ap-intake-processor',
    '* * * * *',
    $job$
    SELECT net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='app_base_url') || '/api/public/hooks/ap-intake-process?batch=3',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='cron_hook_secret')
      ),
      body := '{}'::jsonb
    )
    WHERE (SELECT COUNT(*) FROM vault.decrypted_secrets WHERE name IN ('app_base_url','cron_hook_secret')) = 2;
    $job$
  );
  PERFORM cron.schedule(
    'finance-health-daily',
    '0 2 * * *',
    $job$
    SELECT net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='app_base_url') || '/api/public/hooks/finance-health',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='cron_hook_secret')
      ),
      body := '{}'::jsonb
    )
    WHERE (SELECT COUNT(*) FROM vault.decrypted_secrets WHERE name IN ('app_base_url','cron_hook_secret')) = 2;
    $job$
  );
EXCEPTION WHEN undefined_table OR undefined_function OR invalid_schema_name THEN NULL; -- pg_cron absent (local dev)
END $$;

-- ---------- 5) fa_post_depreciation_run: remove call to nonexistent post_journal_entry ----------
-- (post_journal already returns the entry in 'posted' status)
CREATE OR REPLACE FUNCTION public.fa_post_depreciation_run(
  _org UUID,
  _period_end DATE,
  _memo TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_run_id UUID;
  v_period_start DATE := date_trunc('month', _period_end)::date;
  v_expense_acc TEXT;
  v_accum_acc TEXT;
  v_lines JSONB := '[]'::jsonb;
  v_total NUMERIC := 0;
  v_count INTEGER := 0;
  v_journal_id UUID;
  v_asset RECORD;
  v_asset_row public.fixed_assets;
  v_amount NUMERIC;
  v_by_cc JSONB := '{}'::jsonb;
  v_cc_code TEXT;
  v_cc_key TEXT;
  v_entry JSONB;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT (public.has_org_role(_org,v_uid,'owner') OR public.has_org_role(_org,v_uid,'admin') OR public.has_org_role(_org,v_uid,'accountant')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Resolve determination keys
  SELECT account_code INTO v_expense_acc FROM public.account_determinations
    WHERE org_id=_org AND key='fa.depreciation_expense' AND branch_id IS NULL AND doc_kind IS NULL AND is_active LIMIT 1;
  SELECT account_code INTO v_accum_acc FROM public.account_determinations
    WHERE org_id=_org AND key='fa.accumulated_depreciation' AND branch_id IS NULL AND doc_kind IS NULL AND is_active LIMIT 1;
  IF v_expense_acc IS NULL OR v_accum_acc IS NULL THEN RAISE EXCEPTION 'missing_determination: fa.depreciation_expense/fa.accumulated_depreciation'; END IF;

  -- Create run header (posted status set at end)
  INSERT INTO public.fixed_asset_runs(org_id, period_start, period_end, status, memo, created_by)
    VALUES (_org, v_period_start, _period_end, 'posted', _memo, v_uid)
    RETURNING id INTO v_run_id;

  -- Iterate eligible assets; skip already-posted for the period.
  -- fa_compute_month_depreciation takes a fixed_assets composite, so fetch the
  -- typed row separately instead of passing the joined RECORD.
  FOR v_asset IN
    SELECT a.id, cc.code AS cc_code
    FROM public.fixed_assets a
    LEFT JOIN public.cost_centers cc ON cc.id=a.cost_center_id
    WHERE a.org_id=_org
      AND a.status='active' AND NOT a.is_cip
      AND NOT EXISTS (SELECT 1 FROM public.fixed_asset_schedules s
                      WHERE s.asset_id=a.id AND s.period_end=_period_end AND s.status='posted')
  LOOP
    SELECT * INTO v_asset_row FROM public.fixed_assets WHERE id = v_asset.id;
    v_amount := public.fa_compute_month_depreciation(v_asset_row,
                  _period_end,
                  (SELECT p FROM public.fixed_asset_method_params p WHERE p.asset_id=v_asset_row.id));
    IF v_amount IS NULL OR v_amount <= 0 THEN CONTINUE; END IF;

    -- Insert schedule row
    INSERT INTO public.fixed_asset_schedules(
      org_id, asset_id, run_id, period_start, period_end, days,
      method, opening_nbv, depreciation, accumulated, closing_nbv, status
    ) VALUES (
      _org, v_asset.id, v_run_id, v_period_start, _period_end,
      (_period_end - v_period_start + 1),
      v_asset_row.method,
      GREATEST(v_asset_row.acquisition_cost - v_asset_row.accumulated_depreciation, 0),
      v_amount,
      v_asset_row.accumulated_depreciation + v_amount,
      GREATEST(v_asset_row.acquisition_cost - v_asset_row.accumulated_depreciation - v_amount, 0),
      'posted'
    );

    -- Update asset rolling figures
    UPDATE public.fixed_assets
      SET accumulated_depreciation = accumulated_depreciation + v_amount,
          last_depreciation_date = _period_end
      WHERE id = v_asset.id;

    -- Aggregate by cost center
    v_cc_code := COALESCE(v_asset.cc_code, '');
    v_cc_key := v_cc_code;
    v_by_cc := jsonb_set(
      v_by_cc,
      ARRAY[v_cc_key],
      to_jsonb(COALESCE((v_by_cc->>v_cc_key)::numeric, 0) + v_amount),
      true
    );

    v_total := v_total + v_amount;
    v_count := v_count + 1;
  END LOOP;

  IF v_count = 0 THEN
    -- No eligible assets — remove run header, no journal
    DELETE FROM public.fixed_asset_runs WHERE id=v_run_id;
    RETURN NULL;
  END IF;

  -- Build journal lines (debit expense + credit accum per CC group)
  FOR v_cc_code, v_amount IN SELECT * FROM jsonb_each_text(v_by_cc) LOOP
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object(
        'account_code', v_expense_acc,
        'debit', v_amount::numeric,
        'credit', 0,
        'cost_center_code', NULLIF(v_cc_code,''),
        'memo', 'إهلاك ' || to_char(_period_end,'YYYY-MM')
      ),
      jsonb_build_object(
        'account_code', v_accum_acc,
        'debit', 0,
        'credit', v_amount::numeric,
        'cost_center_code', NULLIF(v_cc_code,''),
        'memo', 'إهلاك ' || to_char(_period_end,'YYYY-MM')
      )
    );
  END LOOP;

  v_entry := jsonb_build_object(
    'entry_date', _period_end,
    'memo', COALESCE(_memo, 'قيد إهلاك شهري - ' || to_char(_period_end,'YYYY-MM')),
    'source_module', 'fixed_assets',
    'source_document_type', 'fa_depreciation_run',
    'source_document_id', v_run_id::text,
    'event_type', 'manual_journal',
    'event_id', 'fa_run:' || v_run_id::text,
    'lines', v_lines
  );

  v_journal_id := public.post_journal(_org, v_entry);

  UPDATE public.fixed_asset_runs
    SET journal_id = v_journal_id, total_depreciation = v_total, asset_count = v_count
    WHERE id = v_run_id;

  INSERT INTO public.financial_audit_log(org_id, event_kind, source_document_id, actor_id, after_state)
    VALUES (_org, 'manual_journal_posted', v_journal_id, v_uid,
      jsonb_build_object('event','fa_depreciation_posted','run_id',v_run_id,'period_end',_period_end,'total',v_total,'assets',v_count));

  RETURN v_run_id;
END $$;
