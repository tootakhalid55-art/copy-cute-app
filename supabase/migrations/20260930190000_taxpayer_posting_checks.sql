-- Apply before deploying the corresponding application change.
-- Evidence is service-role-only; client JSON/AI confidence is never trusted.
CREATE TABLE public.taxpayer_posting_checks (
  document_id uuid PRIMARY KEY REFERENCES public.documents(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  party_id uuid NOT NULL REFERENCES public.parties(id),
  invoice_vat text NOT NULL, invoice_name text NOT NULL,
  party_vat text NOT NULL, party_name text NOT NULL,
  checked_at timestamptz NOT NULL, checked_by uuid NOT NULL,
  result jsonb NOT NULL
);
ALTER TABLE public.taxpayer_posting_checks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.taxpayer_posting_checks FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.taxpayer_posting_checks TO service_role;

CREATE FUNCTION public.require_purchase_taxpayer_check() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.parties; c public.taxpayer_posting_checks;
BEGIN
  IF NEW.kind <> 'purchase_invoice' OR NEW.status NOT IN ('approved','posted') THEN RETURN NEW; END IF;
  -- Existing posted documents remain readable; no retroactive rewriting.
  IF TG_OP = 'UPDATE' AND OLD.status = NEW.status THEN RETURN NEW; END IF;
  SELECT * INTO p FROM public.parties WHERE id = NEW.party_id AND org_id = NEW.org_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'purchase_supplier_required'; END IF;
  SELECT * INTO c FROM public.taxpayer_posting_checks WHERE document_id = NEW.id AND org_id = NEW.org_id;
  IF NOT FOUND OR c.checked_at < now() - interval '24 hours'
    OR c.checked_at > now() + interval '1 minute'
    OR c.party_id IS DISTINCT FROM NEW.party_id
    OR c.party_vat IS DISTINCT FROM p.vat_number OR c.party_name IS DISTINCT FROM p.name
    OR c.invoice_vat IS DISTINCT FROM coalesce(NEW.meta->>'supplierVatNumber', p.vat_number, '')
    OR c.invoice_name IS DISTINCT FROM coalesce(NEW.meta->>'supplierInvoiceName', NEW.party_snapshot->>'name', p.name, '')
    OR NOT coalesce((c.result->>'status' = 'registered'
      OR (c.result->>'status' = 'manual_review' AND c.result->>'source' = 'manual'
        AND c.result->>'acknowledged' = 'true')), false)
  THEN RAISE EXCEPTION 'purchase_taxpayer_verification_required: verify supplier and invoice identity before posting';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.require_purchase_taxpayer_check() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER purchase_taxpayer_check BEFORE INSERT OR UPDATE OF status ON public.documents
FOR EACH ROW EXECUTE FUNCTION public.require_purchase_taxpayer_check();
