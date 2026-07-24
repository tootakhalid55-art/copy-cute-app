
ALTER TABLE public.fixed_asset_schedules
  ADD COLUMN IF NOT EXISTS computation jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS locked boolean NOT NULL DEFAULT false;

ALTER TABLE public.accounting_periods
  ADD COLUMN IF NOT EXISTS fa_locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS fa_locked_by uuid;

CREATE UNIQUE INDEX IF NOT EXISTS ux_fa_runs_org_period_posted
  ON public.fixed_asset_runs(org_id, period_end)
  WHERE status = 'posted';

CREATE OR REPLACE FUNCTION public.fa_lock_period_on_post()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.status = 'posted' AND (OLD IS NULL OR OLD.status <> 'posted') THEN
    UPDATE public.accounting_periods
       SET fa_locked_at = now(), fa_locked_by = NEW.created_by
     WHERE org_id = NEW.org_id
       AND NEW.period_end BETWEEN start_date AND end_date;
    INSERT INTO public.financial_audit_log(org_id, entity_type, entity_id, action, changes, user_id)
    VALUES (NEW.org_id, 'fa_run', NEW.id, 'post',
            jsonb_build_object('period_end', NEW.period_end, 'total', NEW.total_depreciation, 'assets', NEW.asset_count),
            NEW.created_by);
  ELSIF NEW.status = 'reversed' AND OLD.status = 'posted' THEN
    UPDATE public.accounting_periods
       SET fa_locked_at = NULL, fa_locked_by = NULL
     WHERE org_id = NEW.org_id
       AND NEW.period_end BETWEEN start_date AND end_date;
    INSERT INTO public.financial_audit_log(org_id, entity_type, entity_id, action, changes, user_id)
    VALUES (NEW.org_id, 'fa_run', NEW.id, 'reverse',
            jsonb_build_object('period_end', NEW.period_end), NEW.reversed_by);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_fa_lock_period_on_post ON public.fixed_asset_runs;
CREATE TRIGGER trg_fa_lock_period_on_post
  AFTER INSERT OR UPDATE OF status ON public.fixed_asset_runs
  FOR EACH ROW EXECUTE FUNCTION public.fa_lock_period_on_post();

CREATE OR REPLACE FUNCTION public.fa_guard_asset_edits()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  has_posted boolean;
BEGIN
  IF NEW.acquisition_cost IS DISTINCT FROM OLD.acquisition_cost
     OR NEW.residual_value IS DISTINCT FROM OLD.residual_value
     OR NEW.useful_life_months IS DISTINCT FROM OLD.useful_life_months
     OR NEW.method IS DISTINCT FROM OLD.method
     OR NEW.in_service_date IS DISTINCT FROM OLD.in_service_date
     OR NEW.acquisition_date IS DISTINCT FROM OLD.acquisition_date THEN
    SELECT EXISTS(
      SELECT 1 FROM public.fixed_asset_schedules s
      JOIN public.fixed_asset_runs r ON r.id = s.run_id
      WHERE s.asset_id = OLD.id AND r.status = 'posted'
    ) INTO has_posted;
    IF has_posted THEN
      RAISE EXCEPTION 'FA_LOCKED: لا يمكن تعديل التكلفة/العمر/الطريقة/التواريخ بعد ترحيل الإهلاك. استخدم عكس الدورة أو أحداث دورة الحياة.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_fa_guard_asset_edits ON public.fixed_assets;
CREATE TRIGGER trg_fa_guard_asset_edits
  BEFORE UPDATE ON public.fixed_assets
  FOR EACH ROW EXECUTE FUNCTION public.fa_guard_asset_edits();

CREATE OR REPLACE VIEW public.v_fixed_asset_exceptions AS
WITH gl AS (
  SELECT org_id,
         bool_or(key = 'fa.depreciation_expense') AS has_exp,
         bool_or(key = 'fa.accumulated_depreciation') AS has_acc
    FROM public.account_determinations
   GROUP BY org_id
)
SELECT a.id AS asset_id, a.org_id, a.code, a.name, a.status, a.is_cip,
       a.acquisition_cost, a.residual_value, a.useful_life_months, a.method,
       a.in_service_date, a.accumulated_depreciation, a.last_depreciation_date,
       CASE
         WHEN COALESCE(gl.has_exp,false) = false OR COALESCE(gl.has_acc,false) = false THEN 'missing_gl_accounts'
         WHEN a.useful_life_months IS NULL OR a.useful_life_months <= 0 THEN 'missing_useful_life'
         WHEN a.residual_value IS NOT NULL AND (a.residual_value < 0 OR a.residual_value >= a.acquisition_cost) THEN 'invalid_salvage'
         WHEN a.status::text = 'active' AND a.is_cip = false
              AND a.in_service_date IS NOT NULL AND a.in_service_date <= CURRENT_DATE
              AND NOT EXISTS (SELECT 1 FROM public.fixed_asset_schedules s WHERE s.asset_id = a.id) THEN 'ready_not_started'
         WHEN a.status::text = 'active' AND a.is_cip = false
              AND a.useful_life_months IS NOT NULL AND a.useful_life_months > 0
              AND COALESCE(a.accumulated_depreciation,0) >= (a.acquisition_cost - COALESCE(a.residual_value,0)) - 0.01 THEN 'fully_depreciated_active'
         ELSE NULL
       END AS exception_type
  FROM public.fixed_assets a
  LEFT JOIN gl ON gl.org_id = a.org_id;

GRANT SELECT ON public.v_fixed_asset_exceptions TO authenticated;

CREATE OR REPLACE VIEW public.v_fa_calendar AS
SELECT p.org_id, p.id AS period_id, p.name AS period_name,
       p.start_date, p.end_date, p.status::text AS period_status,
       p.fa_locked_at IS NOT NULL AS fa_locked,
       (SELECT r.id FROM public.fixed_asset_runs r
         WHERE r.org_id = p.org_id AND r.period_end = p.end_date AND r.status = 'posted' LIMIT 1) AS posted_run_id,
       (SELECT COUNT(*) FROM public.fixed_asset_runs r
         WHERE r.org_id = p.org_id AND r.period_end = p.end_date AND r.status = 'posted') AS posted_runs,
       (SELECT COUNT(*) FROM public.fixed_asset_runs r
         WHERE r.org_id = p.org_id AND r.period_end = p.end_date AND r.status = 'reversed') AS reversed_runs,
       (SELECT COALESCE(SUM(r.total_depreciation),0) FROM public.fixed_asset_runs r
         WHERE r.org_id = p.org_id AND r.period_end = p.end_date AND r.status = 'posted') AS posted_total
  FROM public.accounting_periods p;

GRANT SELECT ON public.v_fa_calendar TO authenticated;

CREATE OR REPLACE FUNCTION public.fa_simulate_run(_org uuid, _period_end date, _category_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  preview jsonb;
  errors jsonb := '[]'::jsonb;
  summary jsonb;
  je_lines jsonb;
  period_row record;
  gl_ok boolean;
BEGIN
  SELECT * INTO period_row FROM public.accounting_periods
    WHERE org_id = _org AND _period_end BETWEEN start_date AND end_date
    ORDER BY end_date DESC LIMIT 1;

  IF period_row.id IS NULL THEN
    errors := errors || jsonb_build_array(jsonb_build_object('code','no_period','message','لا توجد فترة محاسبية تحوي هذا التاريخ'));
  ELSIF period_row.status::text = 'closed' THEN
    errors := errors || jsonb_build_array(jsonb_build_object('code','period_closed','message','الفترة المحاسبية مغلقة'));
  ELSIF period_row.fa_locked_at IS NOT NULL THEN
    errors := errors || jsonb_build_array(jsonb_build_object('code','fa_locked','message','تم ترحيل إهلاك هذا الشهر مسبقاً'));
  END IF;

  SELECT bool_or(key='fa.depreciation_expense') AND bool_or(key='fa.accumulated_depreciation')
    INTO gl_ok FROM public.account_determinations WHERE org_id = _org;
  IF NOT COALESCE(gl_ok, false) THEN
    errors := errors || jsonb_build_array(jsonb_build_object('code','missing_gl','message','حسابات مصروف/مجمع الإهلاك غير مُعرَّفة'));
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO preview
    FROM public.fa_preview_depreciation(_org, _period_end, _category_id, NULL) t;

  SELECT jsonb_build_object(
    'asset_count', COALESCE(SUM(CASE WHEN (r->>'depreciation')::numeric > 0 AND (r->>'already_posted')::boolean = false THEN 1 ELSE 0 END), 0),
    'total_depreciation', COALESCE(SUM(CASE WHEN (r->>'already_posted')::boolean = false THEN (r->>'depreciation')::numeric ELSE 0 END), 0),
    'skipped', COALESCE(SUM(CASE WHEN (r->>'depreciation')::numeric = 0 OR (r->>'already_posted')::boolean = true THEN 1 ELSE 0 END), 0)
  ) INTO summary
  FROM jsonb_array_elements(preview) r;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'category', category_name, 'debit_expense', total, 'credit_accum', total
  )), '[]'::jsonb) INTO je_lines
  FROM (
    SELECT (r->>'category_name') AS category_name,
           SUM((r->>'depreciation')::numeric) AS total
      FROM jsonb_array_elements(preview) r
     WHERE (r->>'already_posted')::boolean = false AND (r->>'depreciation')::numeric > 0
     GROUP BY 1
  ) g;

  RETURN jsonb_build_object(
    'summary', summary,
    'journal_lines', je_lines,
    'blocking_errors', errors,
    'can_post', errors = '[]'::jsonb AND (summary->>'asset_count')::int > 0,
    'preview', preview
  );
END $$;

GRANT EXECUTE ON FUNCTION public.fa_simulate_run(uuid, date, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.fa_explain_schedule(_schedule_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  s record; a record; formula text; m text;
BEGIN
  SELECT * INTO s FROM public.fixed_asset_schedules WHERE id = _schedule_id;
  IF s.id IS NULL THEN RETURN jsonb_build_object('error','schedule not found'); END IF;
  SELECT * INTO a FROM public.fixed_assets WHERE id = s.asset_id;

  m := s.method::text;
  IF m = 'straight_line' THEN
    formula := format('(التكلفة %s − القيمة المتبقية %s) ÷ العمر %s شهر = %s شهرياً',
      a.acquisition_cost, COALESCE(a.residual_value,0), a.useful_life_months,
      round(((a.acquisition_cost - COALESCE(a.residual_value,0)) / NULLIF(a.useful_life_months,0))::numeric, 2));
  ELSIF m IN ('declining_balance','double_declining') THEN
    formula := format('القيمة الدفترية الافتتاحية %s × المعدل × (الأيام %s ÷ 30) = %s',
      s.opening_nbv, s.days, s.depreciation);
  ELSIF m = 'units_of_production' THEN
    formula := format('(التكلفة − المتبقية) × (وحدات الفترة ÷ إجمالي الوحدات) = %s', s.depreciation);
  ELSE
    formula := format('طريقة %s — الإهلاك %s', m, s.depreciation);
  END IF;

  RETURN jsonb_build_object(
    'schedule_id', s.id,
    'asset', jsonb_build_object('id', a.id, 'code', a.code, 'name', a.name),
    'period', jsonb_build_object('start', s.period_start, 'end', s.period_end, 'days', s.days),
    'method', m,
    'inputs', jsonb_build_object(
      'opening_nbv', s.opening_nbv,
      'cost', a.acquisition_cost,
      'salvage', a.residual_value,
      'useful_life_months', a.useful_life_months,
      'days_in_period', s.days
    ),
    'result', jsonb_build_object(
      'depreciation', s.depreciation,
      'accumulated', s.accumulated,
      'closing_nbv', s.closing_nbv
    ),
    'formula_ar', formula,
    'computation', s.computation
  );
END $$;

GRANT EXECUTE ON FUNCTION public.fa_explain_schedule(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.fa_reopen_period(_org uuid, _period_end date, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  ok boolean;
BEGIN
  SELECT public.has_org_role(_org, auth.uid(), 'admin') OR public.has_org_role(_org, auth.uid(), 'accountant')
    INTO ok;
  IF NOT COALESCE(ok,false) THEN
    RAISE EXCEPTION 'FA_FORBIDDEN: يتطلب دور مسؤول أو محاسب';
  END IF;

  UPDATE public.accounting_periods
     SET fa_locked_at = NULL, fa_locked_by = NULL
   WHERE org_id = _org AND _period_end BETWEEN start_date AND end_date;

  INSERT INTO public.financial_audit_log(org_id, entity_type, entity_id, action, changes, user_id)
  VALUES (_org, 'fa_period', gen_random_uuid(), 'reopen',
          jsonb_build_object('period_end', _period_end, 'reason', _reason), auth.uid());

  RETURN jsonb_build_object('ok', true);
END $$;

GRANT EXECUTE ON FUNCTION public.fa_reopen_period(uuid, date, text) TO authenticated;
