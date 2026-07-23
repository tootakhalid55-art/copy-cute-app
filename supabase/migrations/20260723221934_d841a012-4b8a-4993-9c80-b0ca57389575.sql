
-- ============================================================
-- Phase C2B — Fixed Assets: Depreciation Engine
-- ============================================================

-- 1) Per-asset method parameters (overrides for UoP / DDB / manual)
CREATE TABLE IF NOT EXISTS public.fixed_asset_method_params (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES public.fixed_assets(id) ON DELETE CASCADE,
  total_units NUMERIC(18,4),
  units_this_period NUMERIC(18,4),
  ddb_factor NUMERIC(6,3) DEFAULT 2.0,
  manual_monthly_amount NUMERIC(18,4),
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (asset_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fixed_asset_method_params TO authenticated;
GRANT ALL ON public.fixed_asset_method_params TO service_role;
ALTER TABLE public.fixed_asset_method_params ENABLE ROW LEVEL SECURITY;
CREATE POLICY "famp_read" ON public.fixed_asset_method_params FOR SELECT TO authenticated USING (public.is_org_member(org_id, auth.uid()));
CREATE POLICY "famp_write" ON public.fixed_asset_method_params FOR ALL TO authenticated
  USING (public.has_org_role(org_id, auth.uid(),'owner') OR public.has_org_role(org_id, auth.uid(),'admin') OR public.has_org_role(org_id, auth.uid(),'accountant'))
  WITH CHECK (public.has_org_role(org_id, auth.uid(),'owner') OR public.has_org_role(org_id, auth.uid(),'admin') OR public.has_org_role(org_id, auth.uid(),'accountant'));
CREATE TRIGGER trg_famp_touch BEFORE UPDATE ON public.fixed_asset_method_params FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2) Depreciation runs (header per posted period)
CREATE TABLE IF NOT EXISTS public.fixed_asset_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'posted', -- posted | reversed
  total_depreciation NUMERIC(18,4) NOT NULL DEFAULT 0,
  asset_count INTEGER NOT NULL DEFAULT 0,
  journal_id UUID REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  memo TEXT,
  created_by UUID REFERENCES auth.users(id),
  reversed_at TIMESTAMPTZ,
  reversed_by UUID REFERENCES auth.users(id),
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_far_org_period ON public.fixed_asset_runs(org_id, period_end DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fixed_asset_runs TO authenticated;
GRANT ALL ON public.fixed_asset_runs TO service_role;
ALTER TABLE public.fixed_asset_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "far_read" ON public.fixed_asset_runs FOR SELECT TO authenticated USING (public.is_org_member(org_id, auth.uid()));
CREATE POLICY "far_write" ON public.fixed_asset_runs FOR ALL TO authenticated
  USING (public.has_org_role(org_id, auth.uid(),'owner') OR public.has_org_role(org_id, auth.uid(),'admin') OR public.has_org_role(org_id, auth.uid(),'accountant'))
  WITH CHECK (public.has_org_role(org_id, auth.uid(),'owner') OR public.has_org_role(org_id, auth.uid(),'admin') OR public.has_org_role(org_id, auth.uid(),'accountant'));
CREATE TRIGGER trg_far_touch BEFORE UPDATE ON public.fixed_asset_runs FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 3) Depreciation schedules (row per asset per period)
CREATE TABLE IF NOT EXISTS public.fixed_asset_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES public.fixed_assets(id) ON DELETE CASCADE,
  run_id UUID REFERENCES public.fixed_asset_runs(id) ON DELETE SET NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  days INTEGER NOT NULL DEFAULT 30,
  method public.fa_depreciation_method NOT NULL,
  opening_nbv NUMERIC(18,4) NOT NULL DEFAULT 0,
  depreciation NUMERIC(18,4) NOT NULL DEFAULT 0,
  accumulated NUMERIC(18,4) NOT NULL DEFAULT 0,
  closing_nbv NUMERIC(18,4) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'posted', -- planned | posted | reversed
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (asset_id, period_end, status)
);
CREATE INDEX IF NOT EXISTS idx_fasch_asset ON public.fixed_asset_schedules(asset_id, period_end);
CREATE INDEX IF NOT EXISTS idx_fasch_run ON public.fixed_asset_schedules(run_id);
CREATE INDEX IF NOT EXISTS idx_fasch_org_period ON public.fixed_asset_schedules(org_id, period_end);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fixed_asset_schedules TO authenticated;
GRANT ALL ON public.fixed_asset_schedules TO service_role;
ALTER TABLE public.fixed_asset_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fasch_read" ON public.fixed_asset_schedules FOR SELECT TO authenticated USING (public.is_org_member(org_id, auth.uid()));
CREATE POLICY "fasch_write" ON public.fixed_asset_schedules FOR ALL TO authenticated
  USING (public.has_org_role(org_id, auth.uid(),'owner') OR public.has_org_role(org_id, auth.uid(),'admin') OR public.has_org_role(org_id, auth.uid(),'accountant'))
  WITH CHECK (public.has_org_role(org_id, auth.uid(),'owner') OR public.has_org_role(org_id, auth.uid(),'admin') OR public.has_org_role(org_id, auth.uid(),'accountant'));
CREATE TRIGGER trg_fasch_touch BEFORE UPDATE ON public.fixed_asset_schedules FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ------------------------------------------------------------
-- 4) Core compute helper: monthly depreciation for one asset at a target period end.
--    Returns 0 for CIP/disposed/manual/no-life/not-in-service assets.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fa_compute_month_depreciation(
  _asset public.fixed_assets,
  _period_end DATE,
  _params public.fixed_asset_method_params
) RETURNS NUMERIC
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_base NUMERIC;
  v_nbv NUMERIC;
  v_monthly NUMERIC := 0;
  v_period_start DATE := date_trunc('month', _period_end)::date;
BEGIN
  IF _asset.status <> 'active' OR _asset.is_cip THEN RETURN 0; END IF;
  IF _asset.in_service_date IS NULL OR _asset.in_service_date > _period_end THEN RETURN 0; END IF;
  IF _asset.method = 'none' THEN RETURN 0; END IF;
  IF COALESCE(_asset.useful_life_months,0) <= 0 AND _asset.method IN ('straight_line','declining_balance','double_declining') THEN RETURN 0; END IF;

  v_base := GREATEST(_asset.acquisition_cost - _asset.residual_value, 0);
  v_nbv := GREATEST(_asset.acquisition_cost - _asset.accumulated_depreciation, 0);

  IF _asset.method = 'straight_line' THEN
    v_monthly := v_base / _asset.useful_life_months;
  ELSIF _asset.method = 'declining_balance' THEN
    v_monthly := v_nbv * (1.0 / _asset.useful_life_months);
  ELSIF _asset.method = 'double_declining' THEN
    v_monthly := v_nbv * (COALESCE(_params.ddb_factor, 2.0) / _asset.useful_life_months);
  ELSIF _asset.method = 'units_of_production' THEN
    IF _params.total_units IS NULL OR _params.total_units <= 0 OR _params.units_this_period IS NULL THEN RETURN 0; END IF;
    v_monthly := v_base * (_params.units_this_period / _params.total_units);
  ELSIF _asset.method = 'manual' THEN
    v_monthly := COALESCE(_params.manual_monthly_amount, 0);
  END IF;

  -- Cap at remaining depreciable amount (never below zero, never depreciate residual)
  v_monthly := LEAST(GREATEST(v_monthly, 0), GREATEST(v_nbv - _asset.residual_value, 0));
  RETURN ROUND(v_monthly, 4);
END $$;

-- ------------------------------------------------------------
-- 5) Preview depreciation for a month (no writes)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fa_preview_depreciation(
  _org UUID,
  _period_end DATE,
  _category_id UUID DEFAULT NULL,
  _branch_id UUID DEFAULT NULL
) RETURNS TABLE (
  asset_id UUID,
  code TEXT,
  name TEXT,
  category_id UUID,
  category_name TEXT,
  cost_center_id UUID,
  method public.fa_depreciation_method,
  opening_nbv NUMERIC,
  depreciation NUMERIC,
  closing_nbv NUMERIC,
  already_posted BOOLEAN,
  reason TEXT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.is_org_member(_org, v_uid) THEN RAISE EXCEPTION 'forbidden'; END IF;

  RETURN QUERY
  SELECT
    a.id,
    a.code,
    a.name,
    a.category_id,
    c.name,
    a.cost_center_id,
    a.method,
    GREATEST(a.acquisition_cost - a.accumulated_depreciation, 0)::NUMERIC AS opening_nbv,
    public.fa_compute_month_depreciation(a, _period_end, p)::NUMERIC AS depreciation,
    GREATEST(a.acquisition_cost - a.accumulated_depreciation - public.fa_compute_month_depreciation(a, _period_end, p), 0)::NUMERIC AS closing_nbv,
    EXISTS (SELECT 1 FROM public.fixed_asset_schedules s
            WHERE s.asset_id=a.id AND s.period_end=_period_end AND s.status='posted') AS already_posted,
    CASE
      WHEN a.status <> 'active' THEN 'ليس نشطًا'
      WHEN a.is_cip THEN 'تحت الإنشاء'
      WHEN a.in_service_date IS NULL THEN 'بدون تاريخ تشغيل'
      WHEN a.in_service_date > _period_end THEN 'قبل التشغيل'
      WHEN a.method='none' THEN 'بدون إهلاك'
      WHEN a.method='manual' AND p.manual_monthly_amount IS NULL THEN 'يحتاج قيمة يدوية'
      WHEN a.method='units_of_production' AND (p.total_units IS NULL OR p.units_this_period IS NULL) THEN 'يحتاج بيانات إنتاج'
      ELSE NULL
    END AS reason
  FROM public.fixed_assets a
  LEFT JOIN public.fixed_asset_categories c ON c.id=a.category_id
  LEFT JOIN public.fixed_asset_method_params p ON p.asset_id=a.id
  WHERE a.org_id=_org
    AND (_category_id IS NULL OR a.category_id=_category_id)
    AND (_branch_id IS NULL OR a.branch_id=_branch_id)
  ORDER BY a.code;
END $$;

GRANT EXECUTE ON FUNCTION public.fa_preview_depreciation(UUID,DATE,UUID,UUID) TO authenticated;

-- ------------------------------------------------------------
-- 6) Post a depreciation run for a period (atomic)
-- ------------------------------------------------------------
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

  -- Iterate eligible assets; skip already-posted for the period
  FOR v_asset IN
    SELECT a.*, cc.code AS cc_code
    FROM public.fixed_assets a
    LEFT JOIN public.cost_centers cc ON cc.id=a.cost_center_id
    WHERE a.org_id=_org
      AND a.status='active' AND NOT a.is_cip
      AND NOT EXISTS (SELECT 1 FROM public.fixed_asset_schedules s
                      WHERE s.asset_id=a.id AND s.period_end=_period_end AND s.status='posted')
  LOOP
    v_amount := public.fa_compute_month_depreciation(v_asset,
                  _period_end,
                  (SELECT p FROM public.fixed_asset_method_params p WHERE p.asset_id=v_asset.id));
    IF v_amount IS NULL OR v_amount <= 0 THEN CONTINUE; END IF;

    -- Insert schedule row
    INSERT INTO public.fixed_asset_schedules(
      org_id, asset_id, run_id, period_start, period_end, days,
      method, opening_nbv, depreciation, accumulated, closing_nbv, status
    ) VALUES (
      _org, v_asset.id, v_run_id, v_period_start, _period_end,
      (_period_end - v_period_start + 1),
      v_asset.method,
      GREATEST(v_asset.acquisition_cost - v_asset.accumulated_depreciation, 0),
      v_amount,
      v_asset.accumulated_depreciation + v_amount,
      GREATEST(v_asset.acquisition_cost - v_asset.accumulated_depreciation - v_amount, 0),
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
  -- Auto-post (post_journal creates draft; use existing posting api if available)
  PERFORM public.post_journal_entry(_org, v_journal_id)
    WHERE EXISTS (SELECT 1 FROM pg_proc WHERE proname='post_journal_entry');
  BEGIN
    UPDATE public.journal_entries SET status='posted' WHERE id=v_journal_id AND status='draft';
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  UPDATE public.fixed_asset_runs
    SET journal_id = v_journal_id, total_depreciation = v_total, asset_count = v_count
    WHERE id = v_run_id;

  INSERT INTO public.financial_audit_log(org_id, event_kind, source_document_id, actor_id, after_state)
    VALUES (_org, 'manual_journal_posted', v_journal_id, v_uid,
      jsonb_build_object('event','fa_depreciation_posted','run_id',v_run_id,'period_end',_period_end,'total',v_total,'assets',v_count));

  RETURN v_run_id;
END $$;

GRANT EXECUTE ON FUNCTION public.fa_post_depreciation_run(UUID,DATE,TEXT) TO authenticated;

-- ------------------------------------------------------------
-- 7) Reverse a depreciation run
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fa_reverse_depreciation_run(
  _run_id UUID,
  _memo TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_run RECORD;
  v_rev UUID;
  v_row RECORD;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO v_run FROM public.fixed_asset_runs WHERE id=_run_id;
  IF v_run.id IS NULL THEN RAISE EXCEPTION 'run_not_found'; END IF;
  IF NOT (public.has_org_role(v_run.org_id,v_uid,'owner') OR public.has_org_role(v_run.org_id,v_uid,'admin') OR public.has_org_role(v_run.org_id,v_uid,'accountant')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF v_run.status <> 'posted' THEN RAISE EXCEPTION 'run_not_posted'; END IF;

  -- Reverse each schedule row & adjust asset accumulated
  FOR v_row IN SELECT * FROM public.fixed_asset_schedules WHERE run_id=_run_id AND status='posted' LOOP
    UPDATE public.fixed_assets
      SET accumulated_depreciation = GREATEST(accumulated_depreciation - v_row.depreciation, 0),
          last_depreciation_date = (
            SELECT MAX(period_end) FROM public.fixed_asset_schedules
            WHERE asset_id=v_row.asset_id AND status='posted' AND id<>v_row.id
          )
      WHERE id = v_row.asset_id;
    UPDATE public.fixed_asset_schedules SET status='reversed' WHERE id=v_row.id;
  END LOOP;

  -- Reverse the associated journal (if present)
  IF v_run.journal_id IS NOT NULL THEN
    BEGIN
      v_rev := public.reverse_journal(v_run.org_id, v_run.journal_id, COALESCE(_memo,'عكس إهلاك ' || to_char(v_run.period_end,'YYYY-MM')), v_run.period_end);
    EXCEPTION WHEN OTHERS THEN v_rev := NULL;
    END;
  END IF;

  UPDATE public.fixed_asset_runs
    SET status='reversed', reversed_at=now(), reversed_by=v_uid,
        meta = meta || jsonb_build_object('reversal_journal_id', v_rev)
    WHERE id=_run_id;

  INSERT INTO public.financial_audit_log(org_id, event_kind, source_document_id, actor_id, after_state)
    VALUES (v_run.org_id, 'manual_journal_posted', v_run.journal_id, v_uid,
      jsonb_build_object('event','fa_depreciation_reversed','run_id',_run_id,'reversal_journal_id',v_rev));

  RETURN v_run_id;
END $$;

GRANT EXECUTE ON FUNCTION public.fa_reverse_depreciation_run(UUID,TEXT) TO authenticated;

-- ------------------------------------------------------------
-- 8) Forecast future depreciation for a single asset (no writes)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fa_depreciation_forecast(
  _asset_id UUID,
  _months INTEGER DEFAULT 60
) RETURNS TABLE (
  period_end DATE,
  opening_nbv NUMERIC,
  depreciation NUMERIC,
  accumulated NUMERIC,
  closing_nbv NUMERIC
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_asset public.fixed_assets%ROWTYPE;
  v_params public.fixed_asset_method_params%ROWTYPE;
  v_current_date DATE;
  v_start DATE;
  v_nbv NUMERIC;
  v_accum NUMERIC;
  v_dep NUMERIC;
  i INTEGER;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO v_asset FROM public.fixed_assets WHERE id=_asset_id;
  IF v_asset.id IS NULL THEN RAISE EXCEPTION 'asset_not_found'; END IF;
  IF NOT public.is_org_member(v_asset.org_id, v_uid) THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT * INTO v_params FROM public.fixed_asset_method_params WHERE asset_id=_asset_id;

  v_start := COALESCE(v_asset.last_depreciation_date, v_asset.in_service_date, CURRENT_DATE);
  v_accum := v_asset.accumulated_depreciation;

  FOR i IN 1.._months LOOP
    v_current_date := (date_trunc('month', v_start) + ((i) * INTERVAL '1 month') - INTERVAL '1 day')::date;
    v_nbv := GREATEST(v_asset.acquisition_cost - v_accum, 0);
    v_dep := public.fa_compute_month_depreciation(v_asset, v_current_date, v_params);
    IF v_dep <= 0 THEN EXIT; END IF;
    v_accum := v_accum + v_dep;
    period_end := v_current_date;
    opening_nbv := v_nbv;
    depreciation := v_dep;
    accumulated := v_accum;
    closing_nbv := GREATEST(v_asset.acquisition_cost - v_accum, 0);
    RETURN NEXT;
    -- Simulate the effect on the asset row for next iteration
    v_asset.accumulated_depreciation := v_accum;
    v_asset.last_depreciation_date := v_current_date;
    IF closing_nbv <= v_asset.residual_value THEN EXIT; END IF;
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION public.fa_depreciation_forecast(UUID,INTEGER) TO authenticated;

-- ------------------------------------------------------------
-- 9) Convenience view: asset rollforward per month
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.fa_asset_rollforward
WITH (security_invoker = true) AS
SELECT s.org_id, s.asset_id, a.code, a.name, s.period_end,
       s.opening_nbv, s.depreciation, s.accumulated, s.closing_nbv, s.status, s.run_id
FROM public.fixed_asset_schedules s
JOIN public.fixed_assets a ON a.id=s.asset_id;
GRANT SELECT ON public.fa_asset_rollforward TO authenticated;
