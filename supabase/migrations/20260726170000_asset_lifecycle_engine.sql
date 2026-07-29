-- Phase C2C.1 — Asset Lifecycle Engine completion.
-- Extends the existing fixed_asset_events foundation with idempotency,
-- impairment reversal, split/merge, health scoring, and a unified dispatcher.

ALTER TABLE public.fixed_asset_events
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS correlation_id uuid,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';

CREATE UNIQUE INDEX IF NOT EXISTS uq_fae_org_idempotency
  ON public.fixed_asset_events(org_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fae_correlation
  ON public.fixed_asset_events(org_id, correlation_id)
  WHERE correlation_id IS NOT NULL;

ALTER TABLE public.fixed_assets
  ADD COLUMN IF NOT EXISTS maintenance_cost numeric(18,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failure_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS utilization_pct numeric(5,2),
  ADD COLUMN IF NOT EXISTS last_health_calculated_at timestamptz;

CREATE OR REPLACE FUNCTION public.fa_assert_operator(_org uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    public.has_org_role(_org, auth.uid(), 'owner')
    OR public.has_org_role(_org, auth.uid(), 'admin')
    OR public.has_org_role(_org, auth.uid(), 'accountant')
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.fa_reverse_impairment(
  _asset_id uuid,
  _recoverable_amount numeric,
  _date date,
  _reason text DEFAULT NULL,
  _idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a public.fixed_assets%ROWTYPE;
  v_nbv numeric;
  v_unimpaired_cap numeric;
  v_reversal numeric;
  v_asset_acc text;
  v_income_acc text;
  v_event_id uuid;
  v_je_id uuid;
  v_before jsonb;
  v_after jsonb;
BEGIN
  SELECT * INTO a FROM public.fixed_assets WHERE id = _asset_id FOR UPDATE;
  IF a.id IS NULL THEN RAISE EXCEPTION 'asset_not_found'; END IF;
  PERFORM public.fa_assert_operator(a.org_id);

  IF _idempotency_key IS NOT NULL THEN
    SELECT id INTO v_event_id
    FROM public.fixed_asset_events
    WHERE org_id = a.org_id AND idempotency_key = _idempotency_key;
    IF v_event_id IS NOT NULL THEN
      RETURN jsonb_build_object('event_id', v_event_id, 'duplicate', true);
    END IF;
  END IF;

  IF a.status <> 'active' THEN RAISE EXCEPTION 'asset_not_active'; END IF;
  IF COALESCE(a.impairment_loss, 0) <= 0 THEN RAISE EXCEPTION 'no_impairment_to_reverse'; END IF;

  v_nbv := a.acquisition_cost + COALESCE(a.revaluation_surplus, 0)
    - a.accumulated_depreciation - COALESCE(a.impairment_loss, 0);
  v_unimpaired_cap := GREATEST(
    a.acquisition_cost + COALESCE(a.revaluation_surplus, 0) - a.accumulated_depreciation,
    0
  );
  v_reversal := LEAST(
    COALESCE(a.impairment_loss, 0),
    GREATEST(_recoverable_amount - v_nbv, 0),
    GREATEST(v_unimpaired_cap - v_nbv, 0)
  );
  IF v_reversal <= 0 THEN RAISE EXCEPTION 'no_impairment_reversal_allowed'; END IF;

  v_asset_acc := COALESCE(
    (SELECT meta->>'asset_account_code' FROM public.fixed_asset_categories WHERE id = a.category_id),
    public.fa_require_account(a.org_id, a.branch_id, 'fa.cip')
  );
  v_income_acc := public.fa_require_account(a.org_id, a.branch_id, 'fa.impairment_reversal');
  v_event_id := gen_random_uuid();
  v_je_id := public.post_journal(a.org_id, jsonb_build_object(
    'entry_date', _date::text,
    'memo', 'FA impairment reversal: ' || a.code,
    'source_module', 'fixed_assets',
    'source_document_type', 'fa_event',
    'source_document_id', v_event_id::text,
    'event_type', 'manual_journal',
    'event_id', 'fa_impairment_reversal:' || v_event_id::text,
    'lines', jsonb_build_array(
      jsonb_build_object('account_code', v_asset_acc, 'debit', v_reversal, 'credit', 0, 'description', 'Impairment reversal'),
      jsonb_build_object('account_code', v_income_acc, 'debit', 0, 'credit', v_reversal, 'description', 'Impairment reversal income')
    )
  ));

  v_before := to_jsonb(a);
  UPDATE public.fixed_assets
  SET impairment_loss = GREATEST(impairment_loss - v_reversal, 0),
      updated_at = now()
  WHERE id = a.id
  RETURNING to_jsonb(fixed_assets.*) INTO v_after;

  INSERT INTO public.fixed_asset_events (
    id, org_id, asset_id, event_type, status, effective_date, amount,
    payload, journal_id, notes, before_state, after_state, created_by,
    idempotency_key
  )
  VALUES (
    v_event_id, a.org_id, a.id, 'impairment_reversal', 'posted', _date, v_reversal,
    jsonb_build_object(
      'nbv_before', v_nbv,
      'recoverable_amount', _recoverable_amount,
      'unimpaired_cap', v_unimpaired_cap,
      'reversal', v_reversal
    ),
    v_je_id, _reason, v_before, v_after, auth.uid(), _idempotency_key
  );

  RETURN jsonb_build_object(
    'event_id', v_event_id,
    'journal_id', v_je_id,
    'reversal', v_reversal,
    'nbv_after', v_nbv + v_reversal
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.fa_split(
  _asset_id uuid,
  _splits jsonb,
  _date date,
  _notes text DEFAULT NULL,
  _idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a public.fixed_assets%ROWTYPE;
  item jsonb;
  v_pct numeric;
  v_total_pct numeric;
  v_child_id uuid;
  v_child_ids uuid[] := ARRAY[]::uuid[];
  v_event_id uuid;
  v_correlation uuid := gen_random_uuid();
  v_before jsonb;
BEGIN
  SELECT * INTO a FROM public.fixed_assets WHERE id = _asset_id FOR UPDATE;
  IF a.id IS NULL THEN RAISE EXCEPTION 'asset_not_found'; END IF;
  PERFORM public.fa_assert_operator(a.org_id);
  IF a.status <> 'active' THEN RAISE EXCEPTION 'asset_not_active'; END IF;
  IF jsonb_typeof(_splits) <> 'array' OR jsonb_array_length(_splits) < 2 THEN
    RAISE EXCEPTION 'split_requires_two_or_more_components';
  END IF;

  IF _idempotency_key IS NOT NULL THEN
    SELECT id INTO v_event_id FROM public.fixed_asset_events
    WHERE org_id = a.org_id AND idempotency_key = _idempotency_key;
    IF v_event_id IS NOT NULL THEN
      RETURN jsonb_build_object('event_id', v_event_id, 'duplicate', true);
    END IF;
  END IF;

  SELECT sum((x->>'pct')::numeric) INTO v_total_pct
  FROM jsonb_array_elements(_splits) x;
  IF abs(v_total_pct - 100) > 0.0001 THEN RAISE EXCEPTION 'split_percent_must_equal_100'; END IF;

  v_before := to_jsonb(a);
  FOR item IN SELECT * FROM jsonb_array_elements(_splits)
  LOOP
    v_pct := (item->>'pct')::numeric;
    IF v_pct <= 0 THEN RAISE EXCEPTION 'split_percent_must_be_positive'; END IF;

    INSERT INTO public.fixed_assets (
      org_id, code, name, name_en, description, category_id, group_id,
      parent_asset_id, is_component, branch_id, department, cost_center_id,
      project, custodian_user_id, custodian_name, location_text,
      acquisition_cost, residual_value, useful_life_months, method,
      acquisition_date, in_service_date, currency, status, is_cip,
      accumulated_depreciation, revaluation_surplus, impairment_loss, notes
    )
    VALUES (
      a.org_id,
      COALESCE(NULLIF(item->>'code', ''), a.code || '-' || (COALESCE(array_length(v_child_ids, 1), 0) + 1)::text),
      item->>'name',
      item->>'name_en',
      a.description,
      a.category_id,
      a.group_id,
      a.id,
      true,
      a.branch_id,
      a.department,
      a.cost_center_id,
      a.project,
      a.custodian_user_id,
      a.custodian_name,
      a.location_text,
      round(a.acquisition_cost * v_pct / 100, 4),
      round(a.residual_value * v_pct / 100, 4),
      a.useful_life_months,
      a.method,
      a.acquisition_date,
      a.in_service_date,
      a.currency,
      'active',
      false,
      round(a.accumulated_depreciation * v_pct / 100, 4),
      round(COALESCE(a.revaluation_surplus, 0) * v_pct / 100, 4),
      round(COALESCE(a.impairment_loss, 0) * v_pct / 100, 4),
      'Split from ' || a.code
    )
    RETURNING id INTO v_child_id;
    v_child_ids := array_append(v_child_ids, v_child_id);
  END LOOP;

  UPDATE public.fixed_assets
  SET status = 'retired', updated_at = now()
  WHERE id = a.id;

  v_event_id := gen_random_uuid();
  INSERT INTO public.fixed_asset_events (
    id, org_id, asset_id, event_type, status, effective_date, amount,
    payload, notes, before_state, after_state, created_by,
    idempotency_key, correlation_id
  )
  VALUES (
    v_event_id, a.org_id, a.id, 'split', 'posted', _date, a.acquisition_cost,
    jsonb_build_object('children', to_jsonb(v_child_ids), 'allocation', _splits),
    _notes, v_before,
    jsonb_build_object('status', 'retired', 'child_ids', to_jsonb(v_child_ids)),
    auth.uid(), _idempotency_key, v_correlation
  );

  RETURN jsonb_build_object('event_id', v_event_id, 'child_ids', to_jsonb(v_child_ids));
END;
$$;

CREATE OR REPLACE FUNCTION public.fa_merge(
  _org uuid,
  _asset_ids uuid[],
  _target_name text,
  _target_code text,
  _date date,
  _notes text DEFAULT NULL,
  _idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  first_asset public.fixed_assets%ROWTYPE;
  v_target_id uuid;
  v_event_id uuid;
  v_count integer;
  v_cost numeric;
  v_residual numeric;
  v_acc_dep numeric;
  v_revaluation numeric;
  v_impairment numeric;
BEGIN
  PERFORM public.fa_assert_operator(_org);
  SELECT count(*), sum(acquisition_cost), sum(residual_value),
    sum(accumulated_depreciation), sum(COALESCE(revaluation_surplus, 0)),
    sum(COALESCE(impairment_loss, 0))
  INTO v_count, v_cost, v_residual, v_acc_dep, v_revaluation, v_impairment
  FROM public.fixed_assets
  WHERE org_id = _org AND id = ANY(_asset_ids) AND status = 'active';

  IF v_count < 2 OR v_count <> cardinality(_asset_ids) THEN
    RAISE EXCEPTION 'merge_requires_two_or_more_active_assets';
  END IF;

  IF _idempotency_key IS NOT NULL THEN
    SELECT id INTO v_event_id FROM public.fixed_asset_events
    WHERE org_id = _org AND idempotency_key = _idempotency_key;
    IF v_event_id IS NOT NULL THEN
      RETURN jsonb_build_object('event_id', v_event_id, 'duplicate', true);
    END IF;
  END IF;

  SELECT * INTO first_asset
  FROM public.fixed_assets
  WHERE org_id = _org AND id = ANY(_asset_ids)
  ORDER BY created_at
  LIMIT 1;

  INSERT INTO public.fixed_assets (
    org_id, code, name, category_id, group_id, branch_id, department,
    cost_center_id, project, custodian_user_id, custodian_name, location_text,
    acquisition_cost, residual_value, useful_life_months, method,
    acquisition_date, in_service_date, currency, status,
    accumulated_depreciation, revaluation_surplus, impairment_loss, notes
  )
  VALUES (
    _org, _target_code, _target_name, first_asset.category_id, first_asset.group_id,
    first_asset.branch_id, first_asset.department, first_asset.cost_center_id,
    first_asset.project, first_asset.custodian_user_id, first_asset.custodian_name,
    first_asset.location_text, v_cost, v_residual, first_asset.useful_life_months,
    first_asset.method, first_asset.acquisition_date, first_asset.in_service_date,
    first_asset.currency, 'active', v_acc_dep, v_revaluation, v_impairment,
    'Merged from ' || array_to_string(_asset_ids, ', ')
  )
  RETURNING id INTO v_target_id;

  UPDATE public.fixed_assets
  SET status = 'retired', updated_at = now()
  WHERE org_id = _org AND id = ANY(_asset_ids);

  v_event_id := gen_random_uuid();
  INSERT INTO public.fixed_asset_events (
    id, org_id, asset_id, event_type, status, effective_date, amount,
    payload, notes, before_state, after_state, created_by, idempotency_key,
    correlation_id
  )
  VALUES (
    v_event_id, _org, v_target_id, 'merge', 'posted', _date, v_cost,
    jsonb_build_object('source_asset_ids', to_jsonb(_asset_ids), 'target_asset_id', v_target_id),
    _notes, jsonb_build_object('source_asset_ids', to_jsonb(_asset_ids)),
    jsonb_build_object('target_asset_id', v_target_id, 'cost', v_cost, 'accumulated_depreciation', v_acc_dep),
    auth.uid(), _idempotency_key, gen_random_uuid()
  );

  RETURN jsonb_build_object('event_id', v_event_id, 'target_asset_id', v_target_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.fa_calculate_health_score(_asset_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  a public.fixed_assets%ROWTYPE;
  v_age_months numeric;
  v_life numeric;
  v_nbv numeric;
  v_cost numeric;
  v_age_score numeric;
  v_value_score numeric;
  v_failure_score numeric;
  v_maintenance_score numeric;
  v_usage_score numeric;
  v_score integer;
  v_tier text;
BEGIN
  SELECT * INTO a FROM public.fixed_assets WHERE id = _asset_id;
  IF a.id IS NULL THEN RAISE EXCEPTION 'asset_not_found'; END IF;

  v_age_months := GREATEST(
    extract(year FROM age(current_date, COALESCE(a.in_service_date, a.acquisition_date, current_date))) * 12
      + extract(month FROM age(current_date, COALESCE(a.in_service_date, a.acquisition_date, current_date))),
    0
  );
  v_life := GREATEST(COALESCE(a.useful_life_months, 60), 1);
  v_cost := GREATEST(a.acquisition_cost + COALESCE(a.revaluation_surplus, 0), 1);
  v_nbv := GREATEST(v_cost - a.accumulated_depreciation - COALESCE(a.impairment_loss, 0), 0);

  v_age_score := GREATEST(0, 100 - (v_age_months / v_life * 100));
  v_value_score := LEAST(100, v_nbv / v_cost * 100);
  v_failure_score := GREATEST(0, 100 - COALESCE(a.failure_count, 0) * 15);
  v_maintenance_score := GREATEST(0, 100 - COALESCE(a.maintenance_cost, 0) / v_cost * 200);
  v_usage_score := COALESCE(a.utilization_pct, 70);

  v_score := round(
    v_age_score * 0.30
    + v_value_score * 0.20
    + v_failure_score * 0.20
    + v_maintenance_score * 0.20
    + v_usage_score * 0.10
  );
  v_tier := CASE
    WHEN v_score >= 85 THEN 'excellent'
    WHEN v_score >= 65 THEN 'good'
    WHEN v_score >= 40 THEN 'aging'
    ELSE 'replace_soon'
  END;

  RETURN jsonb_build_object(
    'score', v_score,
    'tier', v_tier,
    'components', jsonb_build_object(
      'age', round(v_age_score, 2),
      'book_value', round(v_value_score, 2),
      'failures', round(v_failure_score, 2),
      'maintenance', round(v_maintenance_score, 2),
      'utilization', round(v_usage_score, 2)
    ),
    'metrics', jsonb_build_object(
      'age_months', v_age_months,
      'useful_life_months', v_life,
      'net_book_value', v_nbv,
      'gross_value', v_cost
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.fa_refresh_health_score(_asset_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a public.fixed_assets%ROWTYPE;
  v_health jsonb;
BEGIN
  SELECT * INTO a FROM public.fixed_assets WHERE id = _asset_id;
  IF a.id IS NULL THEN RAISE EXCEPTION 'asset_not_found'; END IF;
  PERFORM public.fa_assert_operator(a.org_id);
  v_health := public.fa_calculate_health_score(_asset_id);
  UPDATE public.fixed_assets
  SET health_score = (v_health->>'score')::integer,
      health_tier = v_health->>'tier',
      last_health_calculated_at = now()
  WHERE id = _asset_id;
  RETURN v_health;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fa_reverse_impairment(uuid,numeric,date,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fa_split(uuid,jsonb,date,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fa_merge(uuid,uuid[],text,text,date,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fa_calculate_health_score(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fa_refresh_health_score(uuid) TO authenticated;
