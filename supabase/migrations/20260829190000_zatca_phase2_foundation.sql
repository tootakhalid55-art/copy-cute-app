-- ============================================================
-- Phase 3D — ZATCA Phase-2 (Fatoora) foundation
--
-- E-invoice registry with the Phase-2 chain invariants:
--   * ICV: per-org monotonically increasing invoice counter
--   * PIH: previous invoice hash (base64 SHA-256 of "0" for the first)
--   * UUID + generated UBL XML + hash + QR stored per document
--
-- Actual clearance/reporting to the Fatoora API requires the org's
-- CSID certificates from ZATCA onboarding; rows stay in 'generated'
-- until that integration is activated (status: generated -> reported /
-- cleared / failed).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.zatca_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE RESTRICT,
  icv BIGINT NOT NULL,
  uuid UUID NOT NULL DEFAULT gen_random_uuid(),
  invoice_hash TEXT,
  pih TEXT NOT NULL,
  xml TEXT,
  qr TEXT,
  environment TEXT NOT NULL DEFAULT 'sandbox',
  status TEXT NOT NULL DEFAULT 'generated', -- generated|reported|cleared|failed
  api_response JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, document_id),
  UNIQUE (org_id, icv)
);
ALTER TABLE public.zatca_invoices ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.zatca_invoices TO authenticated;
GRANT ALL ON public.zatca_invoices TO service_role;
DROP POLICY IF EXISTS "zatca_select" ON public.zatca_invoices;
CREATE POLICY "zatca_select" ON public.zatca_invoices
  FOR SELECT TO authenticated USING (public.is_org_member(org_id, auth.uid()));

-- Reserve the next ICV + PIH for a document (idempotent per document).
CREATE OR REPLACE FUNCTION public.zatca_next_chain(_org uuid, _doc_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  d RECORD;
  v_existing RECORD;
  v_icv bigint;
  v_pih text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT (public.has_org_role(_org, v_uid, 'owner') OR public.has_org_role(_org, v_uid, 'admin') OR public.has_org_role(_org, v_uid, 'accountant')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO v_existing FROM public.zatca_invoices WHERE org_id = _org AND document_id = _doc_id;
  IF v_existing.id IS NOT NULL THEN
    RETURN jsonb_build_object('icv', v_existing.icv, 'pih', v_existing.pih, 'uuid', v_existing.uuid, 'existing', true);
  END IF;

  SELECT * INTO d FROM public.documents WHERE id = _doc_id AND org_id = _org;
  IF d.id IS NULL THEN RAISE EXCEPTION 'document_not_found'; END IF;
  IF d.status <> 'posted' THEN RAISE EXCEPTION 'document_must_be_posted'; END IF;
  IF d.kind::text NOT IN ('sales_invoice','simplified_tax_invoice','standard_tax_invoice','credit_note','debit_note') THEN
    RAISE EXCEPTION 'kind_not_einvoiceable: %', d.kind;
  END IF;

  -- Serialize the per-org chain.
  PERFORM pg_advisory_xact_lock(hashtext('zatca:' || _org::text));

  SELECT COALESCE(MAX(icv), 0) + 1 INTO v_icv FROM public.zatca_invoices WHERE org_id = _org;
  SELECT invoice_hash INTO v_pih FROM public.zatca_invoices
    WHERE org_id = _org AND icv = v_icv - 1;
  -- First invoice in the chain: PIH = base64(SHA-256("0")) per the spec.
  v_pih := COALESCE(v_pih, encode(sha256('0'::bytea), 'base64'));

  INSERT INTO public.zatca_invoices(org_id, document_id, icv, pih, created_by)
  VALUES (_org, _doc_id, v_icv, v_pih, v_uid);

  RETURN (SELECT jsonb_build_object('icv', icv, 'pih', pih, 'uuid', uuid, 'existing', false)
          FROM public.zatca_invoices WHERE org_id = _org AND document_id = _doc_id);
END $$;
REVOKE ALL ON FUNCTION public.zatca_next_chain(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.zatca_next_chain(uuid, uuid) TO authenticated, service_role;

-- Attach the generated XML/hash/QR to the reserved chain row (write-once
-- unless the row is still 'generated').
CREATE OR REPLACE FUNCTION public.zatca_attach_xml(_org uuid, _doc_id uuid, _xml text, _hash text, _qr text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_row RECORD;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT (public.has_org_role(_org, v_uid, 'owner') OR public.has_org_role(_org, v_uid, 'admin') OR public.has_org_role(_org, v_uid, 'accountant')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT * INTO v_row FROM public.zatca_invoices WHERE org_id = _org AND document_id = _doc_id FOR UPDATE;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'chain_row_not_found'; END IF;
  IF v_row.status <> 'generated' THEN RAISE EXCEPTION 'einvoice_already_submitted'; END IF;
  UPDATE public.zatca_invoices
     SET xml = _xml, invoice_hash = _hash, qr = _qr, updated_at = now()
   WHERE id = v_row.id;
END $$;
REVOKE ALL ON FUNCTION public.zatca_attach_xml(uuid, uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.zatca_attach_xml(uuid, uuid, text, text, text) TO authenticated, service_role;
