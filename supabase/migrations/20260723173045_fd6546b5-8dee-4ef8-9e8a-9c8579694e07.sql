CREATE TABLE IF NOT EXISTS public.ap_intake_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('email','whatsapp','upload','api')),
  source_ref TEXT,
  sender TEXT,
  subject TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  attachment_id UUID REFERENCES public.attachments(id) ON DELETE SET NULL,
  raw_payload JSONB,
  extraction JSONB,
  extraction_model TEXT,
  extraction_started_at TIMESTAMPTZ,
  extraction_completed_at TIMESTAMPTZ,
  confidence NUMERIC(5,4),
  matched_party_id UUID REFERENCES public.parties(id) ON DELETE SET NULL,
  match_confidence NUMERIC(5,4),
  duplicate_of UUID REFERENCES public.ap_intake_documents(id) ON DELETE SET NULL,
  matched_bill_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'received'
    CHECK (status IN ('received','extracting','extracted','review','auto_drafted','posted','duplicate','rejected','failed')),
  error_message TEXT,
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ap_intake_org_status ON public.ap_intake_documents(org_id, status, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_ap_intake_org_party ON public.ap_intake_documents(org_id, matched_party_id);
CREATE INDEX IF NOT EXISTS idx_ap_intake_source ON public.ap_intake_documents(org_id, channel, source_ref);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ap_intake_documents TO authenticated;
GRANT ALL ON public.ap_intake_documents TO service_role;

ALTER TABLE public.ap_intake_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members manage ap intake" ON public.ap_intake_documents
  FOR ALL TO authenticated
  USING (public.is_org_member(org_id, auth.uid()))
  WITH CHECK (public.is_org_member(org_id, auth.uid()));

CREATE TRIGGER trg_ap_intake_updated_at
  BEFORE UPDATE ON public.ap_intake_documents
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


CREATE TABLE IF NOT EXISTS public.ap_intake_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intake_id UUID NOT NULL REFERENCES public.ap_intake_documents(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ap_intake_events_intake ON public.ap_intake_events(intake_id, created_at DESC);

GRANT SELECT, INSERT ON public.ap_intake_events TO authenticated;
GRANT ALL ON public.ap_intake_events TO service_role;

ALTER TABLE public.ap_intake_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read ap intake events" ON public.ap_intake_events
  FOR SELECT TO authenticated
  USING (public.is_org_member(org_id, auth.uid()));

CREATE POLICY "members insert ap intake events" ON public.ap_intake_events
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(org_id, auth.uid()));


CREATE TABLE IF NOT EXISTS public.supplier_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  party_id UUID NOT NULL REFERENCES public.parties(id) ON DELETE CASCADE,
  alias_type TEXT NOT NULL CHECK (alias_type IN ('name','vat','iban','email','phone')),
  alias_value TEXT NOT NULL,
  normalized TEXT NOT NULL,
  confidence NUMERIC(5,4) DEFAULT 1.0,
  source TEXT DEFAULT 'manual',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, alias_type, normalized)
);

CREATE INDEX IF NOT EXISTS idx_supplier_aliases_lookup ON public.supplier_aliases(org_id, alias_type, normalized);
CREATE INDEX IF NOT EXISTS idx_supplier_aliases_party ON public.supplier_aliases(party_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_aliases TO authenticated;
GRANT ALL ON public.supplier_aliases TO service_role;

ALTER TABLE public.supplier_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members manage supplier aliases" ON public.supplier_aliases
  FOR ALL TO authenticated
  USING (public.is_org_member(org_id, auth.uid()))
  WITH CHECK (public.is_org_member(org_id, auth.uid()));


ALTER PUBLICATION supabase_realtime ADD TABLE public.ap_intake_documents;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ap_intake_events;