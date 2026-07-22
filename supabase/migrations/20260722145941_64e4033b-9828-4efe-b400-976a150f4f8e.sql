
-- ==== ENUMS ====
CREATE TYPE public.app_role AS ENUM ('owner', 'admin', 'accountant', 'user', 'viewer');
CREATE TYPE public.party_type AS ENUM ('customer', 'supplier', 'both');
CREATE TYPE public.doc_kind AS ENUM (
  'sales_invoice','simplified_tax_invoice','standard_tax_invoice',
  'sales_quotation','delivery_note','credit_note',
  'purchase_invoice','purchase_order','purchase_quotation','grn','debit_note',
  'payment_voucher','receipt_voucher','journal_voucher','expense_voucher'
);
CREATE TYPE public.doc_status AS ENUM ('draft','issued','paid','partially_paid','cancelled','archived');

-- ==== ORGANIZATIONS ====
CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  name_en text,
  vat_number text,
  cr_number text,
  currency text NOT NULL DEFAULT 'SAR',
  address jsonb NOT NULL DEFAULT '{}'::jsonb,
  phone text,
  email text,
  logo_url text,
  stamp_url text,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- ==== MEMBERSHIPS + ROLES ====
CREATE TABLE public.org_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role public.app_role NOT NULL DEFAULT 'user',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_members TO authenticated;
GRANT ALL ON public.org_members TO service_role;
ALTER TABLE public.org_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_org_member(_org uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.org_members WHERE org_id = _org AND user_id = _user)
$$;

CREATE OR REPLACE FUNCTION public.has_org_role(_org uuid, _user uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.org_members WHERE org_id = _org AND user_id = _user AND role = _role)
$$;

-- RLS: organizations
CREATE POLICY "members view org" ON public.organizations FOR SELECT TO authenticated
  USING (public.is_org_member(id, auth.uid()));
CREATE POLICY "user creates own org" ON public.organizations FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());
CREATE POLICY "owner/admin update org" ON public.organizations FOR UPDATE TO authenticated
  USING (public.has_org_role(id, auth.uid(), 'owner') OR public.has_org_role(id, auth.uid(), 'admin'));
CREATE POLICY "owner delete org" ON public.organizations FOR DELETE TO authenticated
  USING (public.has_org_role(id, auth.uid(), 'owner'));

-- RLS: org_members
CREATE POLICY "members view membership" ON public.org_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_org_member(org_id, auth.uid()));
CREATE POLICY "owner/admin manage members" ON public.org_members FOR ALL TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), 'owner') OR public.has_org_role(org_id, auth.uid(), 'admin'))
  WITH CHECK (public.has_org_role(org_id, auth.uid(), 'owner') OR public.has_org_role(org_id, auth.uid(), 'admin'));

-- Auto-add creator as owner
CREATE OR REPLACE FUNCTION public.add_org_owner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.org_members (org_id, user_id, role) VALUES (NEW.id, NEW.created_by, 'owner');
  RETURN NEW;
END;$$;
CREATE TRIGGER trg_add_org_owner AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.add_org_owner();

-- ==== PROFILES ====
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  full_name text,
  avatar_url text,
  phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own profile" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "update own profile" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());
CREATE POLICY "insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ==== PARTIES (customers/suppliers) ====
CREATE TABLE public.parties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  type public.party_type NOT NULL DEFAULT 'customer',
  name text NOT NULL,
  name_en text,
  vat_number text,
  cr_number text,
  email text,
  phone text,
  address jsonb NOT NULL DEFAULT '{}'::jsonb,
  currency text NOT NULL DEFAULT 'SAR',
  opening_balance numeric(14,2) NOT NULL DEFAULT 0,
  payment_terms_days int NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.parties TO authenticated;
GRANT ALL ON public.parties TO service_role;
ALTER TABLE public.parties ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members manage parties" ON public.parties FOR ALL TO authenticated
  USING (public.is_org_member(org_id, auth.uid()))
  WITH CHECK (public.is_org_member(org_id, auth.uid()));
CREATE INDEX idx_parties_org ON public.parties(org_id);

-- ==== ITEMS ====
CREATE TABLE public.items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  sku text,
  name text NOT NULL,
  name_en text,
  kind text NOT NULL DEFAULT 'product',
  unit text,
  price numeric(14,2) NOT NULL DEFAULT 0,
  cost numeric(14,2) NOT NULL DEFAULT 0,
  stock numeric(14,2) NOT NULL DEFAULT 0,
  tax_rate numeric(5,2) NOT NULL DEFAULT 15,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.items TO authenticated;
GRANT ALL ON public.items TO service_role;
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members manage items" ON public.items FOR ALL TO authenticated
  USING (public.is_org_member(org_id, auth.uid()))
  WITH CHECK (public.is_org_member(org_id, auth.uid()));
CREATE INDEX idx_items_org ON public.items(org_id);

-- ==== DOCUMENTS (unified header) ====
CREATE TABLE public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind public.doc_kind NOT NULL,
  doc_number text NOT NULL,
  uuid_v4 uuid NOT NULL DEFAULT gen_random_uuid(),
  party_id uuid REFERENCES public.parties(id) ON DELETE SET NULL,
  party_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  issue_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  currency text NOT NULL DEFAULT 'SAR',
  po_number text,
  project text,
  notes text,
  terms text,
  tax_inclusive boolean NOT NULL DEFAULT false,
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  discount_total numeric(14,2) NOT NULL DEFAULT 0,
  vat_total numeric(14,2) NOT NULL DEFAULT 0,
  shipping numeric(14,2) NOT NULL DEFAULT 0,
  other_charges numeric(14,2) NOT NULL DEFAULT 0,
  grand_total numeric(14,2) NOT NULL DEFAULT 0,
  status public.doc_status NOT NULL DEFAULT 'draft',
  template_id text,
  qr_payload text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, kind, doc_number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.documents TO authenticated;
GRANT ALL ON public.documents TO service_role;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members manage documents" ON public.documents FOR ALL TO authenticated
  USING (public.is_org_member(org_id, auth.uid()))
  WITH CHECK (public.is_org_member(org_id, auth.uid()));
CREATE INDEX idx_documents_org_kind ON public.documents(org_id, kind);
CREATE INDEX idx_documents_party ON public.documents(party_id);

-- ==== DOCUMENT LINES ====
CREATE TABLE public.document_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  item_id uuid REFERENCES public.items(id) ON DELETE SET NULL,
  position int NOT NULL DEFAULT 0,
  description text NOT NULL,
  description_en text,
  qty numeric(14,3) NOT NULL DEFAULT 1,
  unit text,
  price numeric(14,4) NOT NULL DEFAULT 0,
  discount numeric(14,2) NOT NULL DEFAULT 0,
  tax_rate numeric(5,2) NOT NULL DEFAULT 15,
  line_total numeric(14,2) NOT NULL DEFAULT 0,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_lines TO authenticated;
GRANT ALL ON public.document_lines TO service_role;
ALTER TABLE public.document_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members manage doc lines" ON public.document_lines FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.documents d WHERE d.id = document_id AND public.is_org_member(d.org_id, auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.documents d WHERE d.id = document_id AND public.is_org_member(d.org_id, auth.uid())));
CREATE INDEX idx_doc_lines_doc ON public.document_lines(document_id);

-- ==== ATTACHMENTS ====
CREATE TABLE public.attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  bucket text NOT NULL,
  storage_path text NOT NULL,
  filename text NOT NULL,
  mime_type text,
  size_bytes bigint,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  uploaded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attachments TO authenticated;
GRANT ALL ON public.attachments TO service_role;
ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members manage attachments" ON public.attachments FOR ALL TO authenticated
  USING (public.is_org_member(org_id, auth.uid()))
  WITH CHECK (public.is_org_member(org_id, auth.uid()));
CREATE INDEX idx_attach_entity ON public.attachments(entity_type, entity_id);

-- ==== INBOX (incoming supplier docs / OCR queue) ====
CREATE TABLE public.inbox_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'upload',
  status text NOT NULL DEFAULT 'pending',
  filename text NOT NULL,
  storage_path text,
  ocr_json jsonb,
  linked_document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inbox_documents TO authenticated;
GRANT ALL ON public.inbox_documents TO service_role;
ALTER TABLE public.inbox_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members manage inbox" ON public.inbox_documents FOR ALL TO authenticated
  USING (public.is_org_member(org_id, auth.uid()))
  WITH CHECK (public.is_org_member(org_id, auth.uid()));

-- ==== AUDIT LOG ====
CREATE TABLE public.audit_log (
  id bigserial PRIMARY KEY,
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  old_value jsonb,
  new_value jsonb,
  ip inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members view audit" ON public.audit_log FOR SELECT TO authenticated
  USING (org_id IS NULL OR public.is_org_member(org_id, auth.uid()));
CREATE POLICY "members insert audit" ON public.audit_log FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND (org_id IS NULL OR public.is_org_member(org_id, auth.uid())));
CREATE INDEX idx_audit_org ON public.audit_log(org_id, created_at DESC);

-- ==== TIMESTAMP TRIGGER ====
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;$$;

CREATE TRIGGER t_orgs_updated BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER t_parties_updated BEFORE UPDATE ON public.parties FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER t_items_updated BEFORE UPDATE ON public.items FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER t_documents_updated BEFORE UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER t_inbox_updated BEFORE UPDATE ON public.inbox_documents FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER t_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
