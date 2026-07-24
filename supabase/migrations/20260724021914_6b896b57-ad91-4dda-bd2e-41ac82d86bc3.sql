
DO $$ BEGIN
  CREATE TYPE public.fa_event_type AS ENUM (
    'acquisition','capitalization','improvement_capital','improvement_expense',
    'partial_disposal','full_disposal','sale','transfer',
    'revaluation_up','revaluation_down','impairment','impairment_reversal',
    'restoration','split','merge','write_off','retirement','reactivation'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.fa_event_status AS ENUM ('draft','posted','reversed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.fixed_assets
  ADD COLUMN IF NOT EXISTS revaluation_surplus numeric(18,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS impairment_loss numeric(18,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS health_score int,
  ADD COLUMN IF NOT EXISTS health_tier text,
  ADD COLUMN IF NOT EXISTS last_used_at timestamptz,
  ADD COLUMN IF NOT EXISTS disposed_at date,
  ADD COLUMN IF NOT EXISTS disposal_method text;

CREATE TABLE IF NOT EXISTS public.fixed_asset_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES public.fixed_assets(id) ON DELETE CASCADE,
  event_type public.fa_event_type NOT NULL,
  status public.fa_event_status NOT NULL DEFAULT 'posted',
  effective_date date NOT NULL,
  amount numeric(18,4) NOT NULL DEFAULT 0,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  journal_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  reversed_by uuid REFERENCES public.fixed_asset_events(id) ON DELETE SET NULL,
  reverses_event_id uuid REFERENCES public.fixed_asset_events(id) ON DELETE SET NULL,
  notes text,
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_fae_asset ON public.fixed_asset_events(asset_id, effective_date DESC);
CREATE INDEX IF NOT EXISTS idx_fae_org ON public.fixed_asset_events(org_id, effective_date DESC);
CREATE INDEX IF NOT EXISTS idx_fae_type ON public.fixed_asset_events(org_id, event_type, effective_date DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fixed_asset_events TO authenticated;
GRANT ALL ON public.fixed_asset_events TO service_role;
ALTER TABLE public.fixed_asset_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fae_read ON public.fixed_asset_events;
CREATE POLICY fae_read ON public.fixed_asset_events FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.org_members m WHERE m.org_id = fixed_asset_events.org_id AND m.user_id = auth.uid()));
DROP POLICY IF EXISTS fae_write ON public.fixed_asset_events;
CREATE POLICY fae_write ON public.fixed_asset_events FOR ALL TO authenticated
  USING (public.has_org_role(org_id, auth.uid(),'owner') OR public.has_org_role(org_id, auth.uid(),'admin') OR public.has_org_role(org_id, auth.uid(),'accountant'))
  WITH CHECK (public.has_org_role(org_id, auth.uid(),'owner') OR public.has_org_role(org_id, auth.uid(),'admin') OR public.has_org_role(org_id, auth.uid(),'accountant'));

CREATE OR REPLACE FUNCTION public.fa_require_account(_org uuid, _branch uuid, _key text)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_code text;
BEGIN
  v_code := public.resolve_account(_org, _branch, NULL, _key);
  IF v_code IS NULL OR v_code = '' THEN RAISE EXCEPTION 'missing_determination:%', _key; END IF;
  RETURN v_code;
END $$;

CREATE OR REPLACE FUNCTION public.fa_dispose(_asset_id uuid, _method text, _proceeds numeric, _date date, _notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a RECORD; v_cost numeric; v_acc numeric; v_nbv numeric; v_gain numeric; v_loss numeric;
  v_asset_acc text; v_acc_dep_acc text; v_cash_acc text; v_gain_acc text; v_loss_acc text;
  v_lines jsonb; v_je_id uuid; v_event_id uuid; v_before jsonb; v_after jsonb;
BEGIN
  SELECT * INTO a FROM public.fixed_assets WHERE id = _asset_id;
  IF a.id IS NULL THEN RAISE EXCEPTION 'asset_not_found'; END IF;
  IF a.status IN ('disposed','retired','written_off') THEN RAISE EXCEPTION 'asset_already_disposed:%', a.status; END IF;
  v_cost := a.acquisition_cost + COALESCE(a.revaluation_surplus,0);
  v_acc := a.accumulated_depreciation + COALESCE(a.impairment_loss,0);
  v_nbv := v_cost - v_acc;
  IF _proceeds > v_nbv THEN v_gain := _proceeds - v_nbv; v_loss := 0; ELSE v_gain := 0; v_loss := v_nbv - _proceeds; END IF;
  v_asset_acc := COALESCE((SELECT meta->>'asset_account_code' FROM public.fixed_asset_categories WHERE id = a.category_id),
    public.fa_require_account(a.org_id, a.branch_id, 'fa.cip'));
  v_acc_dep_acc := public.fa_require_account(a.org_id, a.branch_id, 'fa.accumulated_depreciation');
  v_gain_acc := public.fa_require_account(a.org_id, a.branch_id, 'fa.disposal_gain');
  v_loss_acc := public.fa_require_account(a.org_id, a.branch_id, 'fa.disposal_loss');
  v_cash_acc := CASE WHEN _method = 'sale' THEN public.fa_require_account(a.org_id, a.branch_id, 'cash') ELSE NULL END;
  v_lines := jsonb_build_array(
    jsonb_build_object('account_code', v_acc_dep_acc, 'debit', v_acc, 'credit', 0, 'description','FA disposal: accumulated depreciation'),
    jsonb_build_object('account_code', v_asset_acc, 'debit', 0, 'credit', v_cost, 'description','FA disposal: asset cost'));
  IF _method = 'sale' AND _proceeds > 0 THEN v_lines := v_lines || jsonb_build_array(jsonb_build_object('account_code', v_cash_acc, 'debit', _proceeds, 'credit', 0, 'description','FA disposal: proceeds')); END IF;
  IF v_loss > 0 THEN v_lines := v_lines || jsonb_build_array(jsonb_build_object('account_code', v_loss_acc, 'debit', v_loss, 'credit', 0, 'description','FA disposal loss')); END IF;
  IF v_gain > 0 THEN v_lines := v_lines || jsonb_build_array(jsonb_build_object('account_code', v_gain_acc, 'debit', 0, 'credit', v_gain, 'description','FA disposal gain')); END IF;
  v_event_id := gen_random_uuid();
  v_je_id := public.post_journal(a.org_id, jsonb_build_object(
    'entry_date', _date::text, 'memo', 'FA disposal: '||a.code||' ('||_method||')',
    'source_module','fixed_assets','source_document_type','fa_event','source_document_id', v_event_id::text,
    'event_type','manual_journal','event_id','fa_disposal:'||v_event_id::text, 'lines', v_lines));
  v_before := to_jsonb(a);
  UPDATE public.fixed_assets
  SET status = CASE WHEN _method='scrap' THEN 'written_off'::fa_status ELSE 'disposed'::fa_status END,
      disposed_at = _date, disposal_method = _method, updated_at = now()
  WHERE id = a.id RETURNING to_jsonb(fixed_assets.*) INTO v_after;
  INSERT INTO public.fixed_asset_events (id, org_id, asset_id, event_type, status, effective_date, amount, payload, journal_id, notes, before_state, after_state, created_by)
  VALUES (v_event_id, a.org_id, a.id,
    CASE WHEN _method='scrap' THEN 'write_off'::fa_event_type ELSE 'full_disposal'::fa_event_type END,
    'posted', _date, _proceeds,
    jsonb_build_object('method',_method,'proceeds',_proceeds,'cost',v_cost,'acc_dep',v_acc,'nbv',v_nbv,'gain',v_gain,'loss',v_loss),
    v_je_id, _notes, v_before, v_after, auth.uid());
  RETURN jsonb_build_object('event_id', v_event_id, 'journal_id', v_je_id, 'cost', v_cost, 'acc_dep', v_acc, 'nbv', v_nbv, 'gain', v_gain, 'loss', v_loss);
END $$;
GRANT EXECUTE ON FUNCTION public.fa_dispose(uuid,text,numeric,date,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.fa_transfer(_asset_id uuid, _to_branch uuid, _to_cost_center uuid, _custodian_user uuid, _custodian_name text, _location text, _date date, _notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a RECORD; v_event_id uuid; v_before jsonb; v_after jsonb;
BEGIN
  SELECT * INTO a FROM public.fixed_assets WHERE id = _asset_id;
  IF a.id IS NULL THEN RAISE EXCEPTION 'asset_not_found'; END IF;
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
GRANT EXECUTE ON FUNCTION public.fa_transfer(uuid,uuid,uuid,uuid,text,text,date,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.fa_revalue(_asset_id uuid, _new_fair_value numeric, _date date, _notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a RECORD; v_nbv numeric; v_delta numeric; v_asset_acc text; v_surplus_acc text; v_deficit_acc text;
  v_lines jsonb := '[]'::jsonb; v_je_id uuid; v_event_id uuid; v_before jsonb; v_after jsonb;
  v_type public.fa_event_type; v_absorb numeric := 0; v_pl numeric := 0;
BEGIN
  SELECT * INTO a FROM public.fixed_assets WHERE id = _asset_id;
  IF a.id IS NULL THEN RAISE EXCEPTION 'asset_not_found'; END IF;
  IF a.status <> 'active' THEN RAISE EXCEPTION 'asset_not_active'; END IF;
  v_nbv := a.acquisition_cost + COALESCE(a.revaluation_surplus,0) - a.accumulated_depreciation - COALESCE(a.impairment_loss,0);
  v_delta := _new_fair_value - v_nbv;
  IF v_delta = 0 THEN RAISE EXCEPTION 'no_change'; END IF;
  v_asset_acc := COALESCE((SELECT meta->>'asset_account_code' FROM public.fixed_asset_categories WHERE id = a.category_id),
    public.fa_require_account(a.org_id, a.branch_id, 'fa.cip'));
  v_surplus_acc := public.fa_require_account(a.org_id, a.branch_id, 'fa.revaluation_surplus');
  IF v_delta > 0 THEN
    v_type := 'revaluation_up';
    v_lines := jsonb_build_array(
      jsonb_build_object('account_code', v_asset_acc, 'debit', v_delta, 'credit', 0, 'description','Revaluation increase'),
      jsonb_build_object('account_code', v_surplus_acc, 'debit', 0, 'credit', v_delta, 'description','Revaluation surplus (OCI)'));
  ELSE
    v_type := 'revaluation_down';
    v_absorb := LEAST(-v_delta, COALESCE(a.revaluation_surplus,0));
    v_pl := (-v_delta) - v_absorb;
    v_deficit_acc := public.fa_require_account(a.org_id, a.branch_id, 'fa.impairment_expense');
    IF v_absorb > 0 THEN v_lines := v_lines || jsonb_build_array(jsonb_build_object('account_code', v_surplus_acc, 'debit', v_absorb, 'credit', 0, 'description','Revaluation surplus absorbed')); END IF;
    IF v_pl > 0 THEN v_lines := v_lines || jsonb_build_array(jsonb_build_object('account_code', v_deficit_acc, 'debit', v_pl, 'credit', 0, 'description','Revaluation decrease P&L')); END IF;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object('account_code', v_asset_acc, 'debit', 0, 'credit', -v_delta, 'description','Revaluation decrease'));
  END IF;
  v_event_id := gen_random_uuid();
  v_je_id := public.post_journal(a.org_id, jsonb_build_object(
    'entry_date', _date::text, 'memo','FA revaluation: '||a.code,
    'source_module','fixed_assets','source_document_type','fa_event','source_document_id', v_event_id::text,
    'event_type','manual_journal','event_id','fa_reval:'||v_event_id::text, 'lines', v_lines));
  v_before := to_jsonb(a);
  UPDATE public.fixed_assets
  SET revaluation_surplus = CASE WHEN v_delta > 0 THEN COALESCE(revaluation_surplus,0) + v_delta ELSE GREATEST(COALESCE(revaluation_surplus,0) - v_absorb, 0) END,
      updated_at = now() WHERE id = a.id RETURNING to_jsonb(fixed_assets.*) INTO v_after;
  INSERT INTO public.fixed_asset_events (id, org_id, asset_id, event_type, status, effective_date, amount, payload, journal_id, notes, before_state, after_state, created_by)
  VALUES (v_event_id, a.org_id, a.id, v_type, 'posted', _date, v_delta,
    jsonb_build_object('old_nbv',v_nbv,'new_fair_value',_new_fair_value,'delta',v_delta,'absorbed_from_reserve',v_absorb,'pl_impact',v_pl),
    v_je_id, _notes, v_before, v_after, auth.uid());
  RETURN jsonb_build_object('event_id', v_event_id, 'journal_id', v_je_id, 'delta', v_delta);
END $$;
GRANT EXECUTE ON FUNCTION public.fa_revalue(uuid,numeric,date,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.fa_impair(_asset_id uuid, _recoverable_amount numeric, _date date, _reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a RECORD; v_nbv numeric; v_loss numeric; v_asset_acc text; v_exp_acc text;
  v_je_id uuid; v_event_id uuid; v_before jsonb; v_after jsonb;
BEGIN
  SELECT * INTO a FROM public.fixed_assets WHERE id = _asset_id;
  IF a.id IS NULL THEN RAISE EXCEPTION 'asset_not_found'; END IF;
  IF a.status <> 'active' THEN RAISE EXCEPTION 'asset_not_active'; END IF;
  v_nbv := a.acquisition_cost + COALESCE(a.revaluation_surplus,0) - a.accumulated_depreciation - COALESCE(a.impairment_loss,0);
  IF _recoverable_amount >= v_nbv THEN RAISE EXCEPTION 'no_impairment_needed'; END IF;
  v_loss := v_nbv - _recoverable_amount;
  v_asset_acc := COALESCE((SELECT meta->>'asset_account_code' FROM public.fixed_asset_categories WHERE id = a.category_id),
    public.fa_require_account(a.org_id, a.branch_id, 'fa.cip'));
  v_exp_acc := public.fa_require_account(a.org_id, a.branch_id, 'fa.impairment_expense');
  v_event_id := gen_random_uuid();
  v_je_id := public.post_journal(a.org_id, jsonb_build_object(
    'entry_date', _date::text, 'memo','FA impairment: '||a.code,
    'source_module','fixed_assets','source_document_type','fa_event','source_document_id', v_event_id::text,
    'event_type','manual_journal','event_id','fa_impair:'||v_event_id::text,
    'lines', jsonb_build_array(
      jsonb_build_object('account_code', v_exp_acc, 'debit', v_loss, 'credit', 0, 'description','Impairment loss'),
      jsonb_build_object('account_code', v_asset_acc, 'debit', 0, 'credit', v_loss, 'description','Impairment of asset'))));
  v_before := to_jsonb(a);
  UPDATE public.fixed_assets SET impairment_loss = COALESCE(impairment_loss,0) + v_loss, updated_at = now()
  WHERE id = a.id RETURNING to_jsonb(fixed_assets.*) INTO v_after;
  INSERT INTO public.fixed_asset_events (id, org_id, asset_id, event_type, status, effective_date, amount, payload, journal_id, notes, before_state, after_state, created_by)
  VALUES (v_event_id, a.org_id, a.id, 'impairment','posted', _date, v_loss,
    jsonb_build_object('nbv_before',v_nbv,'recoverable',_recoverable_amount,'loss',v_loss), v_je_id, _reason, v_before, v_after, auth.uid());
  RETURN jsonb_build_object('event_id', v_event_id, 'journal_id', v_je_id, 'loss', v_loss);
END $$;
GRANT EXECUTE ON FUNCTION public.fa_impair(uuid,numeric,date,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.fa_improve(_asset_id uuid, _amount numeric, _extend_life_months int, _date date, _notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a RECORD; v_asset_acc text; v_clearing_acc text; v_je_id uuid; v_event_id uuid; v_before jsonb; v_after jsonb;
BEGIN
  SELECT * INTO a FROM public.fixed_assets WHERE id = _asset_id;
  IF a.id IS NULL THEN RAISE EXCEPTION 'asset_not_found'; END IF;
  IF _amount <= 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;
  v_asset_acc := COALESCE((SELECT meta->>'asset_account_code' FROM public.fixed_asset_categories WHERE id = a.category_id),
    public.fa_require_account(a.org_id, a.branch_id, 'fa.cip'));
  v_clearing_acc := public.fa_require_account(a.org_id, a.branch_id, 'accounts_payable');
  v_event_id := gen_random_uuid();
  v_je_id := public.post_journal(a.org_id, jsonb_build_object(
    'entry_date', _date::text, 'memo','FA improvement: '||a.code,
    'source_module','fixed_assets','source_document_type','fa_event','source_document_id', v_event_id::text,
    'event_type','manual_journal','event_id','fa_improve:'||v_event_id::text,
    'lines', jsonb_build_array(
      jsonb_build_object('account_code', v_asset_acc, 'debit', _amount, 'credit', 0, 'description','Capital improvement'),
      jsonb_build_object('account_code', v_clearing_acc, 'debit', 0, 'credit', _amount, 'description','Improvement payable'))));
  v_before := to_jsonb(a);
  UPDATE public.fixed_assets
  SET acquisition_cost = acquisition_cost + _amount,
      useful_life_months = COALESCE(useful_life_months,0) + COALESCE(_extend_life_months,0), updated_at = now()
  WHERE id = a.id RETURNING to_jsonb(fixed_assets.*) INTO v_after;
  INSERT INTO public.fixed_asset_events (id, org_id, asset_id, event_type, status, effective_date, amount, payload, journal_id, notes, before_state, after_state, created_by)
  VALUES (v_event_id, a.org_id, a.id, 'improvement_capital','posted', _date, _amount,
    jsonb_build_object('amount',_amount,'extend_life_months',_extend_life_months), v_je_id, _notes, v_before, v_after, auth.uid());
  RETURN jsonb_build_object('event_id', v_event_id, 'journal_id', v_je_id);
END $$;
GRANT EXECUTE ON FUNCTION public.fa_improve(uuid,numeric,int,date,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.fa_retire(_asset_id uuid, _date date, _notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a RECORD; v_event_id uuid; v_before jsonb; v_after jsonb;
BEGIN
  SELECT * INTO a FROM public.fixed_assets WHERE id = _asset_id;
  IF a.id IS NULL THEN RAISE EXCEPTION 'asset_not_found'; END IF;
  v_before := to_jsonb(a); v_event_id := gen_random_uuid();
  UPDATE public.fixed_assets SET status='retired'::fa_status, updated_at=now() WHERE id=a.id RETURNING to_jsonb(fixed_assets.*) INTO v_after;
  INSERT INTO public.fixed_asset_events (id, org_id, asset_id, event_type, status, effective_date, amount, payload, notes, before_state, after_state, created_by)
  VALUES (v_event_id, a.org_id, a.id, 'retirement','posted', _date, 0, '{}'::jsonb, _notes, v_before, v_after, auth.uid());
  RETURN jsonb_build_object('event_id', v_event_id);
END $$;
GRANT EXECUTE ON FUNCTION public.fa_retire(uuid,date,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.fa_reactivate(_asset_id uuid, _date date, _notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a RECORD; v_event_id uuid; v_before jsonb; v_after jsonb;
BEGIN
  SELECT * INTO a FROM public.fixed_assets WHERE id = _asset_id;
  IF a.id IS NULL THEN RAISE EXCEPTION 'asset_not_found'; END IF;
  IF a.status <> 'retired' THEN RAISE EXCEPTION 'not_retired'; END IF;
  v_before := to_jsonb(a); v_event_id := gen_random_uuid();
  UPDATE public.fixed_assets SET status='active'::fa_status, updated_at=now() WHERE id=a.id RETURNING to_jsonb(fixed_assets.*) INTO v_after;
  INSERT INTO public.fixed_asset_events (id, org_id, asset_id, event_type, status, effective_date, amount, payload, notes, before_state, after_state, created_by)
  VALUES (v_event_id, a.org_id, a.id, 'reactivation','posted', _date, 0, '{}'::jsonb, _notes, v_before, v_after, auth.uid());
  RETURN jsonb_build_object('event_id', v_event_id);
END $$;
GRANT EXECUTE ON FUNCTION public.fa_reactivate(uuid,date,text) TO authenticated;

CREATE OR REPLACE VIEW public.v_asset_timeline AS
  SELECT a.id AS asset_id, a.org_id, a.acquisition_date AS event_date,
    'acquisition'::text AS event_kind, 'Asset acquired'::text AS title,
    a.acquisition_cost AS amount, NULL::uuid AS journal_id,
    jsonb_build_object('supplier', a.supplier_party_id, 'code', a.code) AS payload,
    NULL::uuid AS event_id
  FROM public.fixed_assets a WHERE a.acquisition_date IS NOT NULL
  UNION ALL
  SELECT s.asset_id, s.org_id, s.period_end AS event_date,
    'depreciation'::text, 'Monthly depreciation posted',
    s.depreciation, r.journal_id,
    jsonb_build_object('opening_nbv', s.opening_nbv, 'closing_nbv', s.closing_nbv),
    NULL::uuid
  FROM public.fixed_asset_schedules s
  LEFT JOIN public.fixed_asset_runs r ON r.id = s.run_id
  WHERE s.status = 'posted'
  UNION ALL
  SELECT e.asset_id, e.org_id, e.effective_date, e.event_type::text,
    INITCAP(replace(e.event_type::text,'_',' ')), e.amount, e.journal_id, e.payload, e.id
  FROM public.fixed_asset_events e WHERE e.status = 'posted';

GRANT SELECT ON public.v_asset_timeline TO authenticated;

CREATE OR REPLACE FUNCTION public.fa_reverse_event(_event_id uuid, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e RECORD; v_new uuid;
BEGIN
  SELECT * INTO e FROM public.fixed_asset_events WHERE id = _event_id;
  IF e.id IS NULL THEN RAISE EXCEPTION 'event_not_found'; END IF;
  IF e.status <> 'posted' THEN RAISE EXCEPTION 'event_not_posted'; END IF;
  UPDATE public.fixed_asset_events SET status='reversed', notes=COALESCE(notes,'')||E'\nReversed: '||_reason WHERE id = e.id;
  v_new := gen_random_uuid();
  INSERT INTO public.fixed_asset_events (id, org_id, asset_id, event_type, status, effective_date, amount, payload, reverses_event_id, notes, created_by)
  VALUES (v_new, e.org_id, e.asset_id, e.event_type, 'posted', CURRENT_DATE, -e.amount, e.payload, e.id, _reason, auth.uid());
  UPDATE public.fixed_asset_events SET reversed_by = v_new WHERE id = e.id;
  RETURN jsonb_build_object('reversal_id', v_new);
END $$;
GRANT EXECUTE ON FUNCTION public.fa_reverse_event(uuid,text) TO authenticated;
