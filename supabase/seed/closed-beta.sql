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
