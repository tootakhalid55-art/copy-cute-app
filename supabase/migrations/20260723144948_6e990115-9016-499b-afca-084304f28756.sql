
-- 1. Normalize kind at the view layer.
DROP VIEW IF EXISTS public.document_open_balances CASCADE;

CREATE VIEW public.document_open_balances AS
WITH alloc AS (
  SELECT target_document_id AS doc_id, COALESCE(SUM(amount),0) AS allocated_in
  FROM public.payment_allocations GROUP BY target_document_id
),
consumed AS (
  SELECT source_document_id AS doc_id, COALESCE(SUM(amount),0) AS consumed_out
  FROM public.payment_allocations WHERE source_document_id IS NOT NULL GROUP BY source_document_id
)
SELECT
  d.id AS document_id,
  d.org_id,
  d.party_id,
  d.branch_id,
  CASE
    WHEN d.kind::text IN ('sales_invoice','simplified_tax_invoice','standard_tax_invoice') THEN 'invoice'
    WHEN d.kind::text = 'purchase_invoice' THEN 'bill'
    ELSE d.kind::text
  END AS kind,
  d.status::text AS status,
  d.issue_date,
  d.due_date,
  d.currency,
  d.grand_total AS original_amount,
  COALESCE(a.allocated_in,0) AS allocated_amount,
  COALESCE(c.consumed_out,0) AS consumed_amount,
  GREATEST(d.grand_total - COALESCE(a.allocated_in,0), 0) AS open_as_target,
  GREATEST(d.grand_total - COALESCE(c.consumed_out,0), 0) AS unapplied_as_source
FROM public.documents d
LEFT JOIN alloc a ON a.doc_id = d.id
LEFT JOIN consumed c ON c.doc_id = d.id
WHERE d.status::text NOT IN ('draft','cancelled');

GRANT SELECT ON public.document_open_balances TO authenticated, service_role;

-- 2. Recreate party_balances (dropped by CASCADE) with same normalization
CREATE VIEW public.party_balances AS
SELECT
  b.org_id, b.party_id, p.type::text AS party_type,
  SUM(CASE
    WHEN p.type IN ('customer','both') THEN
      CASE WHEN b.kind IN ('invoice','debit_note') THEN b.open_as_target
           WHEN b.kind IN ('receipt_voucher','credit_note','advance') THEN -b.unapplied_as_source
           ELSE 0 END
    WHEN p.type = 'supplier' THEN
      CASE WHEN b.kind IN ('bill','debit_note') THEN -b.open_as_target
           WHEN b.kind IN ('payment_voucher','credit_note','advance') THEN b.unapplied_as_source
           ELSE 0 END
    ELSE 0
  END) AS balance
FROM public.document_open_balances b
JOIN public.parties p ON p.id = b.party_id
GROUP BY b.org_id, b.party_id, p.type;

GRANT SELECT ON public.party_balances TO authenticated, service_role;

-- 3. Update recompute_document_financial_state to use normalized kinds
CREATE OR REPLACE FUNCTION public.recompute_document_financial_state(_org UUID, _doc UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_state public.financial_state;
BEGIN
  SELECT * INTO r FROM public.document_open_balances WHERE org_id=_org AND document_id=_doc;
  IF r IS NULL THEN RETURN; END IF;

  IF r.kind IN ('receipt_voucher','payment_voucher','credit_note','debit_note','advance') THEN
    IF r.unapplied_as_source <= 0.005 AND r.original_amount > 0 THEN v_state := 'fully_settled';
    ELSIF r.unapplied_as_source >= r.original_amount - 0.005 THEN v_state := 'advance_available';
    ELSE v_state := 'partially_settled';
    END IF;
  ELSE
    IF r.open_as_target <= 0.005 AND r.original_amount > 0 THEN v_state := 'fully_settled';
    ELSIF r.open_as_target >= r.original_amount - 0.005 THEN v_state := 'open';
    ELSE v_state := 'partially_settled';
    END IF;
  END IF;

  UPDATE public.documents SET financial_state = v_state WHERE id = _doc AND org_id = _org;
END $$;
