-- Closed Beta seed data for canar accounting
-- Apply this after provisioning a fresh organization.
-- Assumes the organization and user membership are created separately.

-- Chart of accounts
insert into public.chart_of_accounts (
  org_id, code, name, type, subtype, is_active, currency, opening_balance
) values
  ('00000000-0000-0000-0000-000000000000', '1101', 'Cash on Hand', 'أصول', 'أصول متداولة', true, 'SAR', 0),
  ('00000000-0000-0000-0000-000000000000', '1102', 'Bank', 'أصول', 'أصول متداولة', true, 'SAR', 0),
  ('00000000-0000-0000-0000-000000000000', '1201', 'Accounts Receivable', 'أصول', 'أصول متداولة', true, 'SAR', 0),
  ('00000000-0000-0000-0000-000000000000', '1401', 'Inventory', 'أصول', 'أصول متداولة', true, 'SAR', 0),
  ('00000000-0000-0000-0000-000000000000', '2101', 'Accounts Payable', 'التزامات', 'التزامات متداولة', true, 'SAR', 0),
  ('00000000-0000-0000-0000-000000000000', '2201', 'VAT Payable', 'التزامات', 'التزامات متداولة', true, 'SAR', 0),
  ('00000000-0000-0000-0000-000000000000', '4101', 'Sales Revenue', 'إيرادات', 'إيرادات تشغيلية', true, 'SAR', 0),
  ('00000000-0000-0000-0000-000000000000', '5101', 'Cost of Sales', 'مصروفات', 'تكلفة المبيعات', true, 'SAR', 0),
  ('00000000-0000-0000-0000-000000000000', '6401', 'General Expenses', 'مصروفات', 'مصروفات تشغيلية', true, 'SAR', 0)
on conflict (org_id, code) do update
set
  name = excluded.name,
  type = excluded.type,
  subtype = excluded.subtype,
  is_active = excluded.is_active,
  currency = excluded.currency,
  opening_balance = excluded.opening_balance;

-- Starter customers
insert into public.parties (
  org_id, type, name, code, vat_number, phone, email, opening_balance, currency, notes, meta
) values
  ('00000000-0000-0000-0000-000000000000', 'customer', 'Closed Beta Customer 1', 'CB-CUST-001', null, '0500000001', 'customer1@example.test', 0, 'SAR', 'Seed customer', '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000000', 'customer', 'Closed Beta Customer 2', 'CB-CUST-002', null, '0500000002', 'customer2@example.test', 0, 'SAR', 'Seed customer', '{}'::jsonb)
on conflict do nothing;

-- Starter suppliers
insert into public.parties (
  org_id, type, name, code, vat_number, phone, email, opening_balance, currency, notes, meta
) values
  ('00000000-0000-0000-0000-000000000000', 'supplier', 'Closed Beta Supplier 1', 'CB-SUP-001', null, '0550000001', 'supplier1@example.test', 0, 'SAR', 'Seed supplier', '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000000', 'supplier', 'Closed Beta Supplier 2', 'CB-SUP-002', null, '0550000002', 'supplier2@example.test', 0, 'SAR', 'Seed supplier', '{}'::jsonb)
on conflict do nothing;

-- Starter items, services, and standard goods
insert into public.items (
  org_id, sku, name, kind, unit, price, cost, stock, tax_rate, meta
) values
  ('00000000-0000-0000-0000-000000000000', 'SRV-CONS-001', 'Professional Consulting Service', 'service', 'hour', 450, 0, 0, 15, '{"category":"professional_service","vat_compliant":true,"seed":"closed-beta"}'::jsonb),
  ('00000000-0000-0000-0000-000000000000', 'SRV-MNT-001', 'Annual Maintenance Support', 'service', 'contract', 1800, 0, 0, 15, '{"category":"maintenance_service","vat_compliant":true,"seed":"closed-beta"}'::jsonb),
  ('00000000-0000-0000-0000-000000000000', 'SRV-SW-001', 'Accounting Software License', 'service', 'license', 1200, 0, 0, 15, '{"category":"software_license","vat_compliant":true,"seed":"closed-beta"}'::jsonb),
  ('00000000-0000-0000-0000-000000000000', 'PRD-LAP-001', 'Business Laptop 14-inch', 'product', 'piece', 3200, 2550, 25, 15, '{"category":"standard_good","vat_compliant":true,"seed":"closed-beta"}'::jsonb),
  ('00000000-0000-0000-0000-000000000000', 'PRD-MON-001', '24-inch Monitor', 'product', 'piece', 850, 620, 40, 15, '{"category":"standard_good","vat_compliant":true,"seed":"closed-beta"}'::jsonb),
  ('00000000-0000-0000-0000-000000000000', 'PRD-PAPR-001', 'Premium A4 Paper Box', 'product', 'box', 48, 28, 200, 15, '{"category":"office_supply","vat_compliant":true,"seed":"closed-beta"}'::jsonb),
  ('00000000-0000-0000-0000-000000000000', 'PRD-INK-001', 'Printer Ink Cartridge', 'product', 'piece', 165, 110, 75, 15, '{"category":"office_supply","vat_compliant":true,"seed":"closed-beta"}'::jsonb),
  ('00000000-0000-0000-0000-000000000000', 'PRD-CHAIR-001', 'Office Chair', 'product', 'piece', 725, 480, 30, 15, '{"category":"standard_good","vat_compliant":true,"seed":"closed-beta"}'::jsonb)
on conflict (org_id, sku) do update
set
  name = excluded.name,
  kind = excluded.kind,
  unit = excluded.unit,
  price = excluded.price,
  cost = excluded.cost,
  stock = excluded.stock,
  tax_rate = excluded.tax_rate,
  meta = excluded.meta;

-- Sample sales, purchase, cash, and journal activity
insert into public.documents (
  org_id, kind, doc_number, party_id, party_snapshot, issue_date, currency,
  subtotal, vat_total, grand_total, financial_state, status, open_amount, source_module, meta
) values
  ('00000000-0000-0000-0000-000000000000', 'sales_invoice', 'SI-CB-001', null, '{"code":"CB-CUST-001","name":"Closed Beta Customer 1"}'::jsonb, '2026-07-01', 'SAR', 4500, 675, 5175, 'posted', 'posted', 5175, 'seed', '{"seed":"closed-beta","vat_rate":15,"document_class":"B2B"}'::jsonb),
  ('00000000-0000-0000-0000-000000000000', 'sales_invoice', 'SI-CB-002', null, '{"code":"CB-CUST-002","name":"Closed Beta Customer 2"}'::jsonb, '2026-07-03', 'SAR', 7200, 1080, 8280, 'posted', 'posted', 8280, 'seed', '{"seed":"closed-beta","vat_rate":15,"document_class":"B2B"}'::jsonb),
  ('00000000-0000-0000-0000-000000000000', 'purchase_invoice', 'PB-CB-001', null, '{"code":"CB-SUP-001","name":"Closed Beta Supplier 1"}'::jsonb, '2026-07-02', 'SAR', 1960, 294, 2254, 'posted', 'posted', 2254, 'seed', '{"seed":"closed-beta","vat_rate":15,"document_class":"AP"}'::jsonb),
  ('00000000-0000-0000-0000-000000000000', 'purchase_invoice', 'PB-CB-002', null, '{"code":"CB-SUP-002","name":"Closed Beta Supplier 2"}'::jsonb, '2026-07-04', 'SAR', 3975, 596.25, 4571.25, 'posted', 'posted', 4571.25, 'seed', '{"seed":"closed-beta","vat_rate":15,"document_class":"AP"}'::jsonb),
  ('00000000-0000-0000-0000-000000000000', 'receipt_voucher', 'CR-CB-001', null, '{"code":"CB-CUST-001","name":"Closed Beta Customer 1"}'::jsonb, '2026-07-05', 'SAR', 5175, 675, 5175, 'posted', 'posted', 0, 'seed', '{"seed":"closed-beta","source":"cash_receipt"}'::jsonb),
  ('00000000-0000-0000-0000-000000000000', 'payment_voucher', 'CP-CB-001', null, '{"code":"CB-SUP-001","name":"Closed Beta Supplier 1"}'::jsonb, '2026-07-06', 'SAR', 2070, 270, 2070, 'posted', 'posted', 0, 'seed', '{"seed":"closed-beta","source":"cash_payment"}'::jsonb),
  ('00000000-0000-0000-0000-000000000000', 'journal_voucher', 'JV-CB-001', null, '{}'::jsonb, '2026-07-07', 'SAR', 0, 0, 0, 'posted', 'posted', 0, 'seed', '{"seed":"closed-beta"}'::jsonb),
  ('00000000-0000-0000-0000-000000000000', 'journal_voucher', 'JV-CB-002', null, '{}'::jsonb, '2026-07-08', 'SAR', 0, 0, 0, 'posted', 'posted', 0, 'seed', '{"seed":"closed-beta"}'::jsonb)
on conflict (org_id, doc_number) do update
set
  kind = excluded.kind,
  party_snapshot = excluded.party_snapshot,
  issue_date = excluded.issue_date,
  currency = excluded.currency,
  subtotal = excluded.subtotal,
  vat_total = excluded.vat_total,
  grand_total = excluded.grand_total,
  financial_state = excluded.financial_state,
  status = excluded.status,
  open_amount = excluded.open_amount,
  source_module = excluded.source_module,
  meta = excluded.meta;

insert into public.document_lines (
  document_id, item_id, position, description, qty, price, tax_rate, line_total
) select
  d.id,
  null,
  1,
  'Seed line',
  1,
  0,
  15,
  0
from public.documents d
where d.org_id = '00000000-0000-0000-0000-000000000000'
  and d.doc_number in ('SI-CB-001', 'SI-CB-002', 'PB-CB-001', 'PB-CB-002')
on conflict do nothing;

insert into public.journal_entries (
  org_id, ref, entry_date, memo, status, source_module, meta
) values
  ('00000000-0000-0000-0000-000000000000', 'JV-CB-001', '2026-07-07', 'Sales invoice posting', 'posted', 'seed', '{"seed":"closed-beta"}'::jsonb),
  ('00000000-0000-0000-0000-000000000000', 'JV-CB-002', '2026-07-08', 'Purchase bill posting', 'posted', 'seed', '{"seed":"closed-beta"}'::jsonb)
on conflict (org_id, ref) do update
set
  entry_date = excluded.entry_date,
  memo = excluded.memo,
  status = excluded.status,
  source_module = excluded.source_module,
  meta = excluded.meta;

insert into public.journal_lines (
  entry_id, org_id, line_no, account_code, description, debit, credit, currency, exchange_rate, meta
) select
  j.id,
  '00000000-0000-0000-0000-000000000000',
  v.line_no,
  v.account_code,
  v.description,
  v.debit,
  v.credit,
  'SAR',
  1,
  '{"seed":"closed-beta"}'::jsonb
from public.journal_entries j
join (
  values
    ('JV-CB-001', 1, '1201', 'Accounts Receivable', 5175::numeric, 0::numeric),
    ('JV-CB-001', 2, '4101', 'Sales Revenue', 0::numeric, 4500::numeric),
    ('JV-CB-001', 3, '2201', 'VAT Payable', 0::numeric, 675::numeric),
    ('JV-CB-002', 1, '5101', 'Cost of Sales', 3350::numeric, 0::numeric),
    ('JV-CB-002', 2, '2201', 'VAT Payable', 503::numeric, 0::numeric),
    ('JV-CB-002', 3, '2101', 'Accounts Payable', 0::numeric, 3853::numeric)
) as v(ref, line_no, account_code, description, debit, credit)
on j.ref = v.ref
on conflict do nothing;
