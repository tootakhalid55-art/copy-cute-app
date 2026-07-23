
-- Restore party_balances
CREATE OR REPLACE VIEW public.party_balances
WITH (security_invoker = true) AS
SELECT
  d.org_id,
  d.party_id,
  p.type::text AS party_type,
  SUM(
    CASE
      WHEN p.type::text = 'customer' THEN
        CASE
          WHEN d.kind IN ('invoice','debit_note') THEN d.open_as_target
          WHEN d.kind IN ('credit_note') THEN -d.open_as_target
          WHEN d.kind IN ('receipt_voucher') THEN -d.unapplied_as_source
          ELSE 0 END
      WHEN p.type::text = 'supplier' THEN
        CASE
          WHEN d.kind IN ('bill','debit_note') THEN -d.open_as_target
          WHEN d.kind IN ('credit_note') THEN d.open_as_target
          WHEN d.kind IN ('payment_voucher') THEN d.unapplied_as_source
          ELSE 0 END
      ELSE 0
    END
  )::numeric AS balance
FROM public.document_open_balances d
JOIN public.parties p ON p.id = d.party_id
WHERE d.party_id IS NOT NULL
GROUP BY d.org_id, d.party_id, p.type;

GRANT SELECT ON public.party_balances TO authenticated;
GRANT SELECT ON public.party_balances TO service_role;

-- 1) Health snapshots table
CREATE TABLE IF NOT EXISTS public.finance_health_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  ran_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  check_name TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('ok','warn','error')),
  issue_count INT NOT NULL DEFAULT 0,
  details JSONB NOT NULL DEFAULT '{}'::jsonb
);
GRANT SELECT ON public.finance_health_snapshots TO authenticated;
GRANT ALL ON public.finance_health_snapshots TO service_role;
ALTER TABLE public.finance_health_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org members read health snapshots" ON public.finance_health_snapshots;
CREATE POLICY "org members read health snapshots"
  ON public.finance_health_snapshots FOR SELECT TO authenticated
  USING (public.is_org_member(org_id, auth.uid()));
CREATE INDEX IF NOT EXISTS idx_health_snapshots_org_time
  ON public.finance_health_snapshots (org_id, ran_at DESC);

CREATE OR REPLACE FUNCTION public.hc_unbalanced_journals(_org UUID)
RETURNS TABLE(entry_id UUID, entry_number TEXT, total_debit NUMERIC, total_credit NUMERIC)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='public' AS $$
  SELECT id, entry_number, total_debit, total_credit
  FROM public.journal_entries
  WHERE org_id=_org AND status IN ('posted','reversed')
    AND ROUND(total_debit,2) <> ROUND(total_credit,2)
$$;

CREATE OR REPLACE FUNCTION public.hc_orphan_allocations(_org UUID)
RETURNS TABLE(allocation_id UUID, source_document_id UUID, target_document_id UUID, reason TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='public' AS $$
  SELECT a.id, a.source_document_id, a.target_document_id,
    CASE
      WHEN a.target_document_id IS NULL THEN 'missing_target'
      WHEN NOT EXISTS (SELECT 1 FROM public.documents d WHERE d.id=a.target_document_id) THEN 'target_deleted'
      WHEN a.source_document_id IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM public.documents d WHERE d.id=a.source_document_id) THEN 'source_deleted'
      ELSE NULL END
  FROM public.payment_allocations a
  WHERE a.org_id=_org
    AND (a.target_document_id IS NULL
      OR NOT EXISTS (SELECT 1 FROM public.documents d WHERE d.id=a.target_document_id)
      OR (a.source_document_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.documents d WHERE d.id=a.source_document_id)))
$$;

CREATE OR REPLACE FUNCTION public.hc_duplicate_allocations(_org UUID)
RETURNS TABLE(source_document_id UUID, target_document_id UUID, allocation_date DATE, amount NUMERIC, occurrences BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='public' AS $$
  SELECT source_document_id, target_document_id, allocation_date, amount, COUNT(*)::bigint
  FROM public.payment_allocations
  WHERE org_id=_org AND source_document_id IS NOT NULL
  GROUP BY source_document_id, target_document_id, allocation_date, amount
  HAVING COUNT(*) > 1
$$;

CREATE OR REPLACE FUNCTION public.hc_negative_open_balances(_org UUID)
RETURNS TABLE(document_id UUID, kind TEXT, original_amount NUMERIC, allocated_amount NUMERIC, open_as_target NUMERIC)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='public' AS $$
  SELECT d.id, d.kind::text, d.grand_total,
         COALESCE((SELECT SUM(amount) FROM public.payment_allocations WHERE target_document_id=d.id),0),
         d.grand_total - COALESCE((SELECT SUM(amount) FROM public.payment_allocations WHERE target_document_id=d.id),0)
  FROM public.documents d
  WHERE d.org_id=_org AND d.status::text NOT IN ('draft','cancelled')
    AND d.grand_total - COALESCE((SELECT SUM(amount) FROM public.payment_allocations WHERE target_document_id=d.id),0) < -0.01
$$;

CREATE OR REPLACE FUNCTION public.hc_duplicate_journal_refs(_org UUID)
RETURNS TABLE(event_id TEXT, occurrences BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='public' AS $$
  SELECT event_id, COUNT(*)::bigint
  FROM public.journal_entries
  WHERE org_id=_org AND event_id IS NOT NULL
  GROUP BY event_id HAVING COUNT(*) > 1
$$;

CREATE OR REPLACE FUNCTION public.hc_invalid_posting_sequences(_org UUID)
RETURNS TABLE(document_id UUID, doc_number TEXT, kind TEXT, reason TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='public' AS $$
  SELECT d.id, d.doc_number, d.kind::text, 'document_posted_without_journal'
  FROM public.documents d
  WHERE d.org_id=_org
    AND d.status::text = 'posted'
    AND d.kind::text IN ('sales_invoice','purchase_invoice','simplified_tax_invoice',
                         'standard_tax_invoice','credit_note','debit_note',
                         'receipt_voucher','payment_voucher')
    AND NOT EXISTS (
      SELECT 1 FROM public.journal_entries j
      WHERE j.org_id=_org AND j.source_document_id=d.id AND j.status IN ('posted','reversed')
    )
$$;

CREATE OR REPLACE FUNCTION public.hc_failed_posting_events(_org UUID)
RETURNS TABLE(id UUID, event_type TEXT, source_document_id UUID, error TEXT, created_at TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='public' AS $$
  SELECT id, event_type::text, source_document_id, error, created_at
  FROM public.posting_events
  WHERE org_id=_org AND status = 'failed'
$$;

CREATE OR REPLACE FUNCTION public.hc_settlement_mismatch(_org UUID)
RETURNS TABLE(party_id UUID, party_balance NUMERIC, sum_open NUMERIC, delta NUMERIC)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='public' AS $$
  WITH pb AS (SELECT party_id, balance FROM public.party_balances WHERE org_id=_org),
  so AS (
    SELECT party_id,
      SUM(CASE WHEN kind IN ('invoice','debit_note') THEN open_as_target
               WHEN kind IN ('bill') THEN -open_as_target
               ELSE 0 END) AS s
    FROM public.document_open_balances WHERE org_id=_org GROUP BY party_id
  )
  SELECT pb.party_id, pb.balance, COALESCE(so.s,0), pb.balance - COALESCE(so.s,0)
  FROM pb LEFT JOIN so ON so.party_id=pb.party_id
  WHERE ABS(pb.balance - COALESCE(so.s,0)) > 0.01
$$;

CREATE OR REPLACE FUNCTION public.run_finance_health_check(_org UUID)
RETURNS TABLE(check_name TEXT, severity TEXT, issue_count INT, details JSONB)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_now TIMESTAMPTZ := now();
  v_count INT;
  v_details JSONB;
  v_sev TEXT;
BEGIN
  IF v_uid IS NOT NULL AND NOT public.is_org_member(_org, v_uid) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT count(*), COALESCE(jsonb_agg(row_to_json(t)),'[]'::jsonb) INTO v_count, v_details
  FROM (SELECT * FROM public.hc_unbalanced_journals(_org) LIMIT 100) t;
  v_sev := CASE WHEN v_count=0 THEN 'ok' ELSE 'error' END;
  INSERT INTO public.finance_health_snapshots(org_id,ran_at,check_name,severity,issue_count,details)
    VALUES(_org,v_now,'unbalanced_journals',v_sev,v_count,jsonb_build_object('rows',v_details));
  check_name:='unbalanced_journals'; severity:=v_sev; issue_count:=v_count; details:=v_details; RETURN NEXT;

  SELECT count(*), COALESCE(jsonb_agg(row_to_json(t)),'[]'::jsonb) INTO v_count, v_details
  FROM (SELECT * FROM public.hc_orphan_allocations(_org) LIMIT 100) t;
  v_sev := CASE WHEN v_count=0 THEN 'ok' ELSE 'error' END;
  INSERT INTO public.finance_health_snapshots(org_id,ran_at,check_name,severity,issue_count,details)
    VALUES(_org,v_now,'orphan_allocations',v_sev,v_count,jsonb_build_object('rows',v_details));
  check_name:='orphan_allocations'; severity:=v_sev; issue_count:=v_count; details:=v_details; RETURN NEXT;

  SELECT count(*), COALESCE(jsonb_agg(row_to_json(t)),'[]'::jsonb) INTO v_count, v_details
  FROM (SELECT * FROM public.hc_duplicate_allocations(_org) LIMIT 100) t;
  v_sev := CASE WHEN v_count=0 THEN 'ok' ELSE 'warn' END;
  INSERT INTO public.finance_health_snapshots(org_id,ran_at,check_name,severity,issue_count,details)
    VALUES(_org,v_now,'duplicate_allocations',v_sev,v_count,jsonb_build_object('rows',v_details));
  check_name:='duplicate_allocations'; severity:=v_sev; issue_count:=v_count; details:=v_details; RETURN NEXT;

  SELECT count(*), COALESCE(jsonb_agg(row_to_json(t)),'[]'::jsonb) INTO v_count, v_details
  FROM (SELECT * FROM public.hc_negative_open_balances(_org) LIMIT 100) t;
  v_sev := CASE WHEN v_count=0 THEN 'ok' ELSE 'error' END;
  INSERT INTO public.finance_health_snapshots(org_id,ran_at,check_name,severity,issue_count,details)
    VALUES(_org,v_now,'negative_open_balances',v_sev,v_count,jsonb_build_object('rows',v_details));
  check_name:='negative_open_balances'; severity:=v_sev; issue_count:=v_count; details:=v_details; RETURN NEXT;

  SELECT count(*), COALESCE(jsonb_agg(row_to_json(t)),'[]'::jsonb) INTO v_count, v_details
  FROM (SELECT * FROM public.hc_duplicate_journal_refs(_org) LIMIT 100) t;
  v_sev := CASE WHEN v_count=0 THEN 'ok' ELSE 'error' END;
  INSERT INTO public.finance_health_snapshots(org_id,ran_at,check_name,severity,issue_count,details)
    VALUES(_org,v_now,'duplicate_journal_refs',v_sev,v_count,jsonb_build_object('rows',v_details));
  check_name:='duplicate_journal_refs'; severity:=v_sev; issue_count:=v_count; details:=v_details; RETURN NEXT;

  SELECT count(*), COALESCE(jsonb_agg(row_to_json(t)),'[]'::jsonb) INTO v_count, v_details
  FROM (SELECT * FROM public.hc_invalid_posting_sequences(_org) LIMIT 100) t;
  v_sev := CASE WHEN v_count=0 THEN 'ok' ELSE 'warn' END;
  INSERT INTO public.finance_health_snapshots(org_id,ran_at,check_name,severity,issue_count,details)
    VALUES(_org,v_now,'invalid_posting_sequences',v_sev,v_count,jsonb_build_object('rows',v_details));
  check_name:='invalid_posting_sequences'; severity:=v_sev; issue_count:=v_count; details:=v_details; RETURN NEXT;

  SELECT count(*), COALESCE(jsonb_agg(row_to_json(t)),'[]'::jsonb) INTO v_count, v_details
  FROM (SELECT * FROM public.hc_failed_posting_events(_org) LIMIT 100) t;
  v_sev := CASE WHEN v_count=0 THEN 'ok' ELSE 'warn' END;
  INSERT INTO public.finance_health_snapshots(org_id,ran_at,check_name,severity,issue_count,details)
    VALUES(_org,v_now,'failed_posting_events',v_sev,v_count,jsonb_build_object('rows',v_details));
  check_name:='failed_posting_events'; severity:=v_sev; issue_count:=v_count; details:=v_details; RETURN NEXT;

  SELECT count(*), COALESCE(jsonb_agg(row_to_json(t)),'[]'::jsonb) INTO v_count, v_details
  FROM (SELECT * FROM public.hc_settlement_mismatch(_org) LIMIT 100) t;
  v_sev := CASE WHEN v_count=0 THEN 'ok' ELSE 'error' END;
  INSERT INTO public.finance_health_snapshots(org_id,ran_at,check_name,severity,issue_count,details)
    VALUES(_org,v_now,'settlement_mismatch',v_sev,v_count,jsonb_build_object('rows',v_details));
  check_name:='settlement_mismatch'; severity:=v_sev; issue_count:=v_count; details:=v_details; RETURN NEXT;

  RETURN;
END $$;

CREATE OR REPLACE VIEW public.finance_health_latest
WITH (security_invoker=true) AS
SELECT DISTINCT ON (org_id, check_name)
  org_id, check_name, ran_at, severity, issue_count, details
FROM public.finance_health_snapshots
ORDER BY org_id, check_name, ran_at DESC;
GRANT SELECT ON public.finance_health_latest TO authenticated;
GRANT SELECT ON public.finance_health_latest TO service_role;

CREATE OR REPLACE FUNCTION public.cron_run_finance_health_all()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
DECLARE v_org UUID; v_n INT := 0;
BEGIN
  FOR v_org IN SELECT id FROM public.organizations LOOP
    PERFORM public.run_finance_health_check(v_org);
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END $$;
