import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/db/org";
import { useAuth } from "@/lib/haseem/auth";

export const Route = createFileRoute("/settings/test-data")({
  head: () => ({
    meta: [
      { title: "مولّد بيانات الاختبار — كنار المحاسبية" },
      { name: "description", content: "أداة المطور لإنشاء بيانات تجريبية كبيرة الحجم وقياس الأداء" },
    ],
  }),
  component: TestDataPage,
});

type Counts = {
  customers: number;
  suppliers: number;
  items: number;
  salesInvoices: number;
  purchaseInvoices: number;
  journalDocs: number;
  attachments: number;
};

const DEFAULTS: Counts = {
  customers: 500,
  suppliers: 300,
  items: 5000,
  salesInvoices: 10000,
  purchaseInvoices: 5000,
  journalDocs: 20000,
  attachments: 1000,
};

const BATCH = 500;

function chunk<T>(a: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n));
  return out;
}

function rand(n: number) {
  return Math.floor(Math.random() * n);
}

function randomDate(): string {
  const start = new Date(2024, 0, 1).getTime();
  const end = Date.now();
  return new Date(start + Math.random() * (end - start)).toISOString().slice(0, 10);
}

const CLOSED_BETA_ITEMS = [
  { sku: "SRV-CONS-001", name: "Professional Consulting Service", kind: "service", unit: "hour", price: 450, cost: 0, stock: 0 },
  { sku: "SRV-MNT-001", name: "Annual Maintenance Support", kind: "service", unit: "contract", price: 1800, cost: 0, stock: 0 },
  { sku: "SRV-SW-001", name: "Accounting Software License", kind: "service", unit: "license", price: 1200, cost: 0, stock: 0 },
  { sku: "PRD-LAP-001", name: "Business Laptop 14-inch", kind: "product", unit: "piece", price: 3200, cost: 2550, stock: 25 },
  { sku: "PRD-MON-001", name: "24-inch Monitor", kind: "product", unit: "piece", price: 850, cost: 620, stock: 40 },
  { sku: "PRD-PAPR-001", name: "Premium A4 Paper Box", kind: "product", unit: "box", price: 48, cost: 28, stock: 200 },
  { sku: "PRD-INK-001", name: "Printer Ink Cartridge", kind: "product", unit: "piece", price: 165, cost: 110, stock: 75 },
  { sku: "PRD-CHAIR-001", name: "Office Chair", kind: "product", unit: "piece", price: 725, cost: 480, stock: 30 },
].map((item) => ({
  ...item,
  tax_rate: 15,
  meta: { category: item.kind === "service" ? "service" : "standard_good", vat_compliant: true, seed: "closed-beta" },
}));

const CLOSED_BETA_DOCS = {
  salesInvoices: [
    {
      doc_number: "SI-CB-001",
      kind: "sales_invoice",
      partyCode: "CB-CUST-001",
      party_name: "Closed Beta Customer 1",
      issue_date: "2026-07-01",
      lines: [
        { sku: "SRV-CONS-001", description: "Professional Consulting Service", qty: 4, price: 450, tax_rate: 15 },
        { sku: "PRD-LAP-001", description: "Business Laptop 14-inch", qty: 2, price: 3200, tax_rate: 15 },
      ],
    },
    {
      doc_number: "SI-CB-002",
      kind: "sales_invoice",
      partyCode: "CB-CUST-002",
      party_name: "Closed Beta Customer 2",
      issue_date: "2026-07-03",
      lines: [
        { sku: "SRV-SW-001", description: "Accounting Software License", qty: 5, price: 1200, tax_rate: 15 },
        { sku: "PRD-MON-001", description: "24-inch Monitor", qty: 4, price: 850, tax_rate: 15 },
      ],
    },
  ],
  purchaseBills: [
    {
      doc_number: "PB-CB-001",
      kind: "purchase_invoice",
      partyCode: "CB-SUP-001",
      party_name: "Closed Beta Supplier 1",
      issue_date: "2026-07-02",
      lines: [
        { sku: "PRD-PAPR-001", description: "Premium A4 Paper Box", qty: 20, price: 48, tax_rate: 15 },
        { sku: "PRD-INK-001", description: "Printer Ink Cartridge", qty: 10, price: 165, tax_rate: 15 },
      ],
    },
    {
      doc_number: "PB-CB-002",
      kind: "purchase_invoice",
      partyCode: "CB-SUP-002",
      party_name: "Closed Beta Supplier 2",
      issue_date: "2026-07-04",
      lines: [
        { sku: "SRV-MNT-001", description: "Annual Maintenance Support", qty: 1, price: 1800, tax_rate: 15 },
        { sku: "PRD-CHAIR-001", description: "Office Chair", qty: 3, price: 725, tax_rate: 15 },
      ],
    },
  ],
  receiptVouchers: [
    {
      doc_number: "CR-CB-001",
      kind: "receipt_voucher",
      partyCode: "CB-CUST-001",
      party_name: "Closed Beta Customer 1",
      issue_date: "2026-07-05",
      grand_total: 5175,
      memo: "Receipt against invoice SI-CB-001",
    },
  ],
  paymentVouchers: [
    {
      doc_number: "CP-CB-001",
      kind: "payment_voucher",
      partyCode: "CB-SUP-001",
      party_name: "Closed Beta Supplier 1",
      issue_date: "2026-07-06",
      grand_total: 2070,
      memo: "Payment against bill PB-CB-001",
    },
  ],
  journalEntries: [
    {
      ref: "JV-CB-001",
      entry_date: "2026-07-07",
      memo: "Sales invoice posting",
      lines: [
        { accountCode: "1201", description: "Accounts Receivable", debit: 5175, credit: 0 },
        { accountCode: "4101", description: "Sales Revenue", debit: 0, credit: 4500 },
        { accountCode: "2201", description: "VAT Payable", debit: 0, credit: 675 },
      ],
    },
    {
      ref: "JV-CB-002",
      entry_date: "2026-07-08",
      memo: "Purchase bill posting",
      lines: [
        { accountCode: "5101", description: "Cost of Sales", debit: 3350, credit: 0 },
        { accountCode: "2201", description: "VAT Payable", debit: 503, credit: 0 },
        { accountCode: "2101", description: "Accounts Payable", debit: 0, credit: 3853 },
      ],
    },
  ],
};

function sumInvoice(lines: Array<{ qty: number; price: number; tax_rate: number }>) {
  const subtotal = lines.reduce((sum, l) => sum + (l.qty * l.price), 0);
  const vat = Math.round(subtotal * 0.15 * 100) / 100;
  return { subtotal, vat, grand_total: subtotal + vat };
}

function TestDataPage() {
  const { currentOrgId } = useOrg();
  const { user } = useAuth();
  const [counts, setCounts] = useState<Counts>(DEFAULTS);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [perf, setPerf] = useState<Array<{ name: string; ms: number; rows?: number }>>([]);
  const cancelRef = useRef(false);

  const push = (m: string) => setLog((l) => [...l, `[${new Date().toLocaleTimeString()}] ${m}`]);

  const setC = (k: keyof Counts, v: number) => setCounts((c) => ({ ...c, [k]: Math.max(0, v) }));

  async function closedBetaSeed() {
    if (!currentOrgId || !user) return alert("لا توجد منشأة");
    if (!confirm("سيتم إنشاء بيانات Closed Beta الخفيفة للمنشأة الحالية. متابعة؟")) return;
    setRunning(true);
    cancelRef.current = false;
    setLog([]);
    setPerf([]);
    const tag = `CB-${Date.now().toString(36)}`;
    push(`بدء Closed Beta Seed — علامة: ${tag}`);
    try {
      const coaRows = [
        { code: "1101", name: "Cash on Hand", type: "أصول", subtype: "أصول متداولة", opening_balance: 0 },
        { code: "1102", name: "Bank", type: "أصول", subtype: "أصول متداولة", opening_balance: 0 },
        { code: "1201", name: "Accounts Receivable", type: "أصول", subtype: "أصول متداولة", opening_balance: 0 },
        { code: "2101", name: "Accounts Payable", type: "التزامات", subtype: "التزامات متداولة", opening_balance: 0 },
        { code: "2201", name: "VAT Payable", type: "التزامات", subtype: "التزامات متداولة", opening_balance: 0 },
        { code: "4101", name: "Sales Revenue", type: "إيرادات", subtype: "إيرادات تشغيلية", opening_balance: 0 },
        { code: "5101", name: "Cost of Sales", type: "مصروفات", subtype: "تكلفة المبيعات", opening_balance: 0 },
        { code: "6401", name: "General Expenses", type: "مصروفات", subtype: "مصروفات تشغيلية", opening_balance: 0 },
      ].map((r) => ({ org_id: currentOrgId, currency: "SAR", is_active: true, ...r })) as any[];
      const { error: coaErr } = await supabase.from("chart_of_accounts").upsert(coaRows, { onConflict: "org_id,code" });
      if (coaErr) throw coaErr;
      push("تم تجهيز دليل الحسابات الأساسي");

      const customers = [
        { name: "Closed Beta Customer 1", code: `CB-CUST-001`, email: "customer1@example.test", phone: "0500000001" },
        { name: "Closed Beta Customer 2", code: `CB-CUST-002`, email: "customer2@example.test", phone: "0500000002" },
      ].map((r) => ({
        org_id: currentOrgId,
        type: "customer",
        vat_number: null,
        opening_balance: 0,
        currency: "SAR",
        notes: "Closed Beta seed",
        meta: { seed: tag, closed_beta: true },
        ...r,
      })) as any[];
      const suppliers = [
        { name: "Closed Beta Supplier 1", code: `CB-SUP-001`, email: "supplier1@example.test", phone: "0550000001" },
        { name: "Closed Beta Supplier 2", code: `CB-SUP-002`, email: "supplier2@example.test", phone: "0550000002" },
      ].map((r) => ({
        org_id: currentOrgId,
        type: "supplier",
        vat_number: null,
        opening_balance: 0,
        currency: "SAR",
        notes: "Closed Beta seed",
        meta: { seed: tag, closed_beta: true },
        ...r,
      })) as any[];
      const { error: partyErr } = await supabase.from("parties").upsert([...customers, ...suppliers], { onConflict: "org_id,code" });
      if (partyErr) throw partyErr;
      push("تم تجهيز العملاء والموردين التجريبيين");

      const items = CLOSED_BETA_ITEMS.map((item) => ({
        org_id: currentOrgId,
        sku: item.sku,
        name: item.name,
        kind: item.kind,
        unit: item.unit,
        price: item.price,
        cost: item.cost,
        stock: item.stock,
        tax_rate: item.tax_rate,
        meta: { ...item.meta, seed: tag },
      })) as any[];
      const { error: itemErr } = await supabase.from("items").upsert(items, { onConflict: "org_id,sku" });
      if (itemErr) throw itemErr;
      push("تم تجهيز الأصناف والخدمات والبضائع التجريبية");

      setPerf([{ name: "closed beta seed", ms: 0, rows: coaRows.length + customers.length + suppliers.length + items.length }]);
      push("✅ اكتمل Closed Beta Seed");
    } catch (e: any) {
      push(`❌ خطأ في Closed Beta Seed: ${e.message}`);
    } finally {
      setRunning(false);
    }
  }

  async function generate() {
    if (!currentOrgId || !user) return alert("لا توجد منشأة");
    if (!confirm(`سيتم إنشاء بيانات كبيرة الحجم في المنشأة الحالية. متابعة؟`)) return;
    setRunning(true);
    cancelRef.current = false;
    setLog([]);
    setPerf([]);
    const tag = `SEED-${Date.now().toString(36)}`;
    push(`بدء التوليد — علامة: ${tag}`);

    try {
      // 1) Customers
      const custIds = await bulkInsert("parties", counts.customers, (i) => ({
        org_id: currentOrgId,
        type: "customer",
        name: `عميل تجريبي ${tag}-${i + 1}`,
        code: `C-${tag}-${i + 1}`,
        email: `c${i}@test.local`,
        phone: `0500${(1000000 + i).toString().slice(-7)}`,
        opening_balance: rand(100000),
        meta: { seed: tag },
      }), push);

      if (cancelRef.current) return;

      // 2) Suppliers
      const supIds = await bulkInsert("parties", counts.suppliers, (i) => ({
        org_id: currentOrgId,
        type: "supplier",
        name: `مورد تجريبي ${tag}-${i + 1}`,
        code: `S-${tag}-${i + 1}`,
        email: `s${i}@test.local`,
        phone: `0555${(1000000 + i).toString().slice(-7)}`,
        opening_balance: rand(50000),
        meta: { seed: tag },
      }), push);

      if (cancelRef.current) return;

      // 3) Items
      const itemIds = await bulkInsert("items", counts.items, (i) => ({
        org_id: currentOrgId,
        sku: `SKU-${tag}-${i + 1}`,
        name: `صنف ${tag}-${i + 1}`,
        kind: i % 5 === 0 ? "service" : "product",
        unit: "قطعة",
        price: 10 + rand(990),
        cost: 5 + rand(500),
        stock: rand(1000),
        tax_rate: 15,
        meta: { seed: tag },
      }), push);

      if (cancelRef.current) return;

      const itemMap = new Map<string, string>();
      CLOSED_BETA_ITEMS.forEach((item) => {
        // Rebuild the map after the upsert so document lines can reference stable SKUs.
        itemMap.set(item.sku, item.sku);
      });

      const { error: cbItemErr } = await supabase.from("items").upsert(
        CLOSED_BETA_ITEMS.map((item) => ({
          org_id: currentOrgId,
          sku: item.sku,
          name: item.name,
          kind: item.kind,
          unit: item.unit,
          price: item.price,
          cost: item.cost,
          stock: item.stock,
          tax_rate: item.tax_rate,
          meta: { ...item.meta, seed: tag },
        })) as any,
        { onConflict: "org_id,sku" },
      );
      if (cbItemErr) throw cbItemErr;
      push("تم تجهيز الأصناف والخدمات والبضائع التجريبية");

      if (cancelRef.current) return;

      // Helper to build docs of a kind
      const buildDocs = async (
        kind: string,
        total: number,
        partyPool: string[],
        prefix: string,
      ) => {
        push(`إنشاء ${total} من ${kind}...`);
        const t0 = performance.now();
        let created = 0;
        // Each batch generates docs, inserts, then inserts lines
        for (let start = 0; start < total; start += BATCH) {
          if (cancelRef.current) return created;
          const size = Math.min(BATCH, total - start);
          const rows = Array.from({ length: size }, (_, k) => {
            const idx = start + k;
            const pid = partyPool.length ? partyPool[rand(partyPool.length)] : null;
            const sub = 100 + rand(9900);
            const vat = Math.round(sub * 0.15 * 100) / 100;
            return {
              org_id: currentOrgId,
              kind,
              doc_number: `${prefix}-${tag}-${idx + 1}`,
              party_id: pid,
              party_snapshot: {},
              issue_date: randomDate(),
              currency: "SAR",
              subtotal: sub,
              vat_total: vat,
              grand_total: sub + vat,
              status: "draft",
              created_by: user.id,
              meta: { seed: tag },
            };
          });
          const { data, error } = await (supabase.from("documents") as any)
            .insert(rows)
            .select("id");
          if (error) { push(`❌ ${kind}: ${error.message}`); return created; }
          const docIds: string[] = (data || []).map((d: any) => d.id);
          created += docIds.length;

          // Lines: 1-3 per doc
          const lines: any[] = [];
          docIds.forEach((docId) => {
            const nLines = 1 + rand(3);
            for (let j = 0; j < nLines; j++) {
              const item = itemIds.length ? itemIds[rand(itemIds.length)] : null;
              const qty = 1 + rand(10);
              const price = 10 + rand(500);
              const lt = qty * price;
              lines.push({
                document_id: docId,
                item_id: item,
                position: j + 1,
                description: `سطر ${j + 1}`,
                qty,
                price,
                tax_rate: 15,
                line_total: lt,
              });
            }
          });
          for (const c of chunk(lines, 1000)) {
            const { error: lErr } = await (supabase.from("document_lines") as any).insert(c);
            if (lErr) { push(`⚠ lines: ${lErr.message}`); break; }
          }
          push(`  ${kind}: ${created}/${total}`);
        }
        const dt = Math.round(performance.now() - t0);
        setPerf((p) => [...p, { name: `insert ${kind}`, ms: dt, rows: created }]);
        return created;
      };

      if (counts.salesInvoices > 0) {
        await buildDocs("sales_invoice", counts.salesInvoices, custIds, "SI");
      }
      if (cancelRef.current) return;
      if (counts.purchaseInvoices > 0) {
        await buildDocs("purchase_invoice", counts.purchaseInvoices, supIds, "PI");
      }
      if (cancelRef.current) return;
      if (counts.journalDocs > 0) {
        await buildDocs("journal_voucher", counts.journalDocs, [], "JV");
      }

      if (cancelRef.current) return;

      const resolvePartyId = async (code: string) => {
        const { data } = await supabase.from("parties").select("id").eq("org_id", currentOrgId).eq("code", code).maybeSingle();
        return (data as any)?.id ?? null;
      };
      const resolveItemId = async (sku: string) => {
        const { data } = await supabase.from("items").select("id").eq("org_id", currentOrgId).eq("sku", sku).maybeSingle();
        return (data as any)?.id ?? null;
      };

      const salesInvoiceRows = [];
      for (const doc of CLOSED_BETA_DOCS.salesInvoices) {
        const partyId = await resolvePartyId(doc.partyCode);
        const { subtotal, vat, grand_total } = sumInvoice(doc.lines);
        salesInvoiceRows.push({
          org_id: currentOrgId,
          kind: doc.kind,
          doc_number: doc.doc_number,
          party_id: partyId,
          party_snapshot: { code: doc.partyCode, name: doc.party_name },
          issue_date: doc.issue_date,
          currency: "SAR",
          subtotal,
          vat_total: vat,
          grand_total,
          financial_state: "posted",
          status: "posted",
          open_amount: grand_total,
          source_module: "seed",
          meta: { seed: tag, vat_rate: 15, document_class: "B2B" },
        });
      }
      const { data: salesDocs, error: salesErr } = await (supabase.from("documents") as any).insert(salesInvoiceRows).select("id, doc_number");
      if (salesErr) throw salesErr;
      for (const doc of CLOSED_BETA_DOCS.salesInvoices) {
        const saved = (salesDocs || []).find((r: any) => r.doc_number === doc.doc_number);
        if (!saved) continue;
        const lines = [];
        for (let i = 0; i < doc.lines.length; i++) {
          const line = doc.lines[i];
          lines.push({
            document_id: saved.id,
            item_id: await resolveItemId(line.sku),
            position: i + 1,
            description: line.description,
            qty: line.qty,
            price: line.price,
            tax_rate: line.tax_rate,
            line_total: line.qty * line.price,
          });
        }
        const { error: lineErr } = await (supabase.from("document_lines") as any).insert(lines);
        if (lineErr) throw lineErr;
      }
      push("تم تجهيز فواتير المبيعات");

      const purchaseRows = [];
      for (const doc of CLOSED_BETA_DOCS.purchaseBills) {
        const partyId = await resolvePartyId(doc.partyCode);
        const { subtotal, vat, grand_total } = sumInvoice(doc.lines);
        purchaseRows.push({
          org_id: currentOrgId,
          kind: doc.kind,
          doc_number: doc.doc_number,
          party_id: partyId,
          party_snapshot: { code: doc.partyCode, name: doc.party_name },
          issue_date: doc.issue_date,
          currency: "SAR",
          subtotal,
          vat_total: vat,
          grand_total,
          financial_state: "posted",
          status: "posted",
          open_amount: grand_total,
          source_module: "seed",
          meta: { seed: tag, vat_rate: 15, document_class: "AP" },
        });
      }
      const { data: billDocs, error: billErr } = await (supabase.from("documents") as any).insert(purchaseRows).select("id, doc_number");
      if (billErr) throw billErr;
      for (const doc of CLOSED_BETA_DOCS.purchaseBills) {
        const saved = (billDocs || []).find((r: any) => r.doc_number === doc.doc_number);
        if (!saved) continue;
        const lines = [];
        for (let i = 0; i < doc.lines.length; i++) {
          const line = doc.lines[i];
          lines.push({
            document_id: saved.id,
            item_id: await resolveItemId(line.sku),
            position: i + 1,
            description: line.description,
            qty: line.qty,
            price: line.price,
            tax_rate: line.tax_rate,
            line_total: line.qty * line.price,
          });
        }
        const { error: lineErr } = await (supabase.from("document_lines") as any).insert(lines);
        if (lineErr) throw lineErr;
      }
      push("تم تجهيز فواتير المشتريات");

      const cashRows = [
        ...CLOSED_BETA_DOCS.receiptVouchers.map((doc) => ({ ...doc, org_id: currentOrgId, party_id: null, party_snapshot: { code: doc.partyCode, name: doc.party_name }, currency: "SAR", status: "posted", financial_state: "posted", open_amount: 0, source_module: "seed", meta: { seed: tag, source: "cash_receipt" } })),
        ...CLOSED_BETA_DOCS.paymentVouchers.map((doc) => ({ ...doc, org_id: currentOrgId, party_id: null, party_snapshot: { code: doc.partyCode, name: doc.party_name }, currency: "SAR", status: "posted", financial_state: "posted", open_amount: 0, source_module: "seed", meta: { seed: tag, source: "cash_payment" } })),
      ].map((doc) => ({
        org_id: doc.org_id,
        kind: doc.kind,
        doc_number: doc.doc_number,
        party_id: doc.party_id,
        party_snapshot: doc.party_snapshot,
        issue_date: doc.issue_date,
        currency: doc.currency,
        grand_total: doc.grand_total,
        subtotal: doc.grand_total,
        vat_total: Math.round(doc.grand_total * 0.15 / 1.15 * 100) / 100,
        financial_state: doc.financial_state,
        status: doc.status,
        open_amount: doc.open_amount,
        memo: doc.memo ?? null,
        source_module: doc.source_module,
        meta: doc.meta,
      }));
      for (const doc of CLOSED_BETA_DOCS.receiptVouchers) {
        const partyId = await resolvePartyId(doc.partyCode);
        cashRows.push({
          org_id: currentOrgId,
          kind: "receipt_voucher",
          doc_number: doc.doc_number,
          party_id: partyId,
          party_snapshot: { code: doc.partyCode, name: doc.party_name },
          issue_date: doc.issue_date,
          currency: "SAR",
          grand_total: doc.grand_total,
          subtotal: doc.grand_total,
          vat_total: Math.round(doc.grand_total * 0.15 / 1.15 * 100) / 100,
          financial_state: "posted",
          status: "posted",
          open_amount: 0,
          memo: doc.memo,
          source_module: "seed",
          meta: { seed: tag, source: "cash_receipt" },
        });
      }
      for (const doc of CLOSED_BETA_DOCS.paymentVouchers) {
        const partyId = await resolvePartyId(doc.partyCode);
        cashRows.push({
          org_id: currentOrgId,
          kind: "payment_voucher",
          doc_number: doc.doc_number,
          party_id: partyId,
          party_snapshot: { code: doc.partyCode, name: doc.party_name },
          issue_date: doc.issue_date,
          currency: "SAR",
          grand_total: doc.grand_total,
          subtotal: doc.grand_total,
          vat_total: Math.round(doc.grand_total * 0.15 / 1.15 * 100) / 100,
          financial_state: "posted",
          status: "posted",
          open_amount: 0,
          memo: doc.memo,
          source_module: "seed",
          meta: { seed: tag, source: "cash_payment" },
        });
      }
      const { error: cashErr } = await (supabase.from("documents") as any).upsert(cashRows, { onConflict: "org_id,doc_number" });
      if (cashErr) throw cashErr;
      push("تم تجهيز سندات القبض والصرف");

      const journalRows = CLOSED_BETA_DOCS.journalEntries.map((entry) => ({
        org_id: currentOrgId,
        ref: entry.ref,
        entry_date: entry.entry_date,
        memo: entry.memo,
        status: "posted",
        source_module: "seed",
        meta: { seed: tag },
      }));
      const { data: journals, error: journalErr } = await (supabase.from("journal_entries") as any).insert(journalRows).select("id, ref");
      if (journalErr) throw journalErr;
      for (const entry of CLOSED_BETA_DOCS.journalEntries) {
        const saved = (journals || []).find((r: any) => r.ref === entry.ref);
        if (!saved) continue;
        const { error } = await (supabase.from("journal_lines") as any).insert(
          entry.lines.map((line, idx) => ({
            entry_id: saved.id,
            org_id: currentOrgId,
            line_no: idx + 1,
            account_code: line.accountCode,
            description: line.description,
            debit: line.debit,
            credit: line.credit,
            currency: "SAR",
            exchange_rate: 1,
            meta: { seed: tag },
          }))
        );
        if (error) throw error;
      }
      push("تم تجهيز القيود اليومية والدفتر العام");

      // 4) Attachment stubs (rows only, no file upload)
      if (counts.attachments > 0 && !cancelRef.current) {
        push(`إنشاء ${counts.attachments} مرفق (سجلات فقط)...`);
        // Pick some doc ids
        const { data: sample } = await supabase
          .from("documents")
          .select("id")
          .eq("org_id", currentOrgId)
          .contains("meta", { seed: tag })
          .limit(counts.attachments);
        const docs = (sample || []).map((d) => d.id);
        if (docs.length) {
          const t0 = performance.now();
          let created = 0;
          const rows = Array.from({ length: counts.attachments }, (_, i) => ({
            org_id: currentOrgId,
            entity_type: "document",
            entity_id: docs[i % docs.length],
            file_name: `test-${tag}-${i + 1}.pdf`,
            mime_type: "application/pdf",
            size_bytes: 1024 * (10 + rand(500)),
            storage_bucket: "attachments",
            storage_path: `seed/${tag}/${i + 1}.pdf`,
            uploaded_by: user.id,
            meta: { seed: tag },
          }));
          for (const c of chunk(rows, BATCH)) {
            const { error } = await (supabase.from("attachments") as any).insert(c);
            if (error) { push(`⚠ attachments: ${error.message}`); break; }
            created += c.length;
            push(`  attachments: ${created}/${counts.attachments}`);
          }
          setPerf((p) => [...p, { name: "insert attachments", ms: Math.round(performance.now() - t0), rows: created }]);
        }
      }

      push("✅ اكتمل التوليد");
    } catch (e: any) {
      push(`❌ خطأ: ${e.message}`);
    } finally {
      setRunning(false);
    }
  }

  async function bulkInsert(
    table: string,
    total: number,
    build: (i: number) => any,
    push: (m: string) => void,
  ): Promise<string[]> {
    if (total <= 0) return [];
    push(`إنشاء ${total} في ${table}...`);
    const t0 = performance.now();
    const ids: string[] = [];
    for (let start = 0; start < total; start += BATCH) {
      if (cancelRef.current) break;
      const size = Math.min(BATCH, total - start);
      const rows = Array.from({ length: size }, (_, k) => build(start + k));
      const { data, error } = await ((supabase as any).from(table)).insert(rows).select("id");
      if (error) { push(`❌ ${table}: ${error.message}`); break; }
      (data || []).forEach((d: any) => ids.push(d.id));
      push(`  ${table}: ${ids.length}/${total}`);
    }
    setPerf((p) => [...p, { name: `insert ${table}`, ms: Math.round(performance.now() - t0), rows: ids.length }]);
    return ids;
  }

  async function runPerfTests() {
    if (!currentOrgId) return;
    setPerf([]);
    const sb: any = supabase;
    const tests: Array<{ name: string; fn: () => Promise<any> }> = [
      { name: "COUNT documents", fn: () => sb.from("documents").select("*", { count: "exact", head: true }).eq("org_id", currentOrgId) },
      { name: "list latest 50 invoices", fn: () => sb.from("documents").select("id,doc_number,grand_total,issue_date").eq("org_id", currentOrgId).eq("kind", "sales_invoice").order("issue_date", { ascending: false }).limit(50) },
      { name: "sum grand_total sales", fn: () => sb.from("documents").select("grand_total").eq("org_id", currentOrgId).eq("kind", "sales_invoice") },
      { name: "full-text search 'تجريبي'", fn: () => sb.from("documents").select("id,doc_number").eq("org_id", currentOrgId).ilike("search_text", "%تجريبي%").limit(50) },
      { name: "join party+docs", fn: () => sb.from("documents").select("id,doc_number,party:parties(name)").eq("org_id", currentOrgId).eq("kind", "sales_invoice").limit(100) },
      { name: "count parties", fn: () => sb.from("parties").select("*", { count: "exact", head: true }).eq("org_id", currentOrgId) },
      { name: "count items", fn: () => sb.from("items").select("*", { count: "exact", head: true }).eq("org_id", currentOrgId) },
      { name: "count document_lines", fn: () => sb.from("document_lines").select("id", { count: "exact", head: true }) },
    ];
    for (const t of tests) {
      const t0 = performance.now();
      const res: any = await t.fn();
      const ms = Math.round(performance.now() - t0);
      const rows = res.count ?? (Array.isArray(res.data) ? res.data.length : undefined);
      setPerf((p) => [...p, { name: t.name, ms, rows }]);
    }
  }

  async function cleanup() {
    if (!currentOrgId) return;
    if (!confirm("حذف جميع البيانات التجريبية التي أنشأها هذا المولّد (meta.seed) من المنشأة الحالية؟")) return;
    setRunning(true);
    try {
      const tables = ["attachments", "documents", "items", "parties"];
      for (const t of tables) {
        const t0 = performance.now();
        const { error } = await ((supabase as any).from(t)).delete().eq("org_id", currentOrgId).not("meta->>seed", "is", null);
        const ms = Math.round(performance.now() - t0);
        if (error) setLog((l) => [...l, `❌ delete ${t}: ${error.message}`]);
        else setLog((l) => [...l, `🗑 حذف ${t} (${ms}ms)`]);
      }
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold">مولّد بيانات الاختبار</h1>
        <p className="text-sm text-muted-foreground">أداة مطوّرين لإنشاء بيانات ضخمة وقياس الأداء. لا تستخدمها في منشأة إنتاجية.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {([
          ["customers", "عملاء"],
          ["suppliers", "موردون"],
          ["items", "أصناف"],
          ["salesInvoices", "فواتير مبيعات"],
          ["purchaseInvoices", "فواتير مشتريات"],
          ["journalDocs", "قيود مستندية"],
          ["attachments", "مرفقات"],
        ] as Array<[keyof Counts, string]>).map(([k, label]) => (
          <label key={k} className="border rounded-lg p-3 bg-card">
            <div className="text-xs text-muted-foreground">{label}</div>
            <input
              type="number"
              className="w-full mt-1 bg-transparent text-lg font-semibold outline-none"
              value={counts[k]}
              onChange={(e) => setC(k, Number(e.target.value))}
              disabled={running}
            />
          </label>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <button onClick={closedBetaSeed} disabled={running}
          className="px-4 py-2 rounded-lg bg-emerald-600 text-white disabled:opacity-50">
          Closed Beta Seed
        </button>
        <button onClick={generate} disabled={running}
          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground disabled:opacity-50">
          {running ? "جارٍ التوليد..." : "إنشاء البيانات"}
        </button>
        <button onClick={runPerfTests} disabled={running}
          className="px-4 py-2 rounded-lg border">
          تشغيل اختبارات الأداء
        </button>
        <button onClick={() => { cancelRef.current = true; }} disabled={!running}
          className="px-4 py-2 rounded-lg border disabled:opacity-50">
          إيقاف
        </button>
        <button onClick={cleanup} disabled={running}
          className="px-4 py-2 rounded-lg border border-destructive text-destructive">
          حذف البيانات التجريبية
        </button>
      </div>

      {perf.length > 0 && (
        <div className="border rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-muted font-semibold">نتائج الأداء</div>
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr><th className="p-2 text-right">الاختبار</th><th className="p-2 text-right">الصفوف</th><th className="p-2 text-right">الزمن (ms)</th></tr>
            </thead>
            <tbody>
              {perf.map((p, i) => (
                <tr key={i} className="border-t">
                  <td className="p-2">{p.name}</td>
                  <td className="p-2 tabular-nums">{p.rows ?? "—"}</td>
                  <td className="p-2 tabular-nums">{p.ms}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="border rounded-lg bg-black text-green-300 font-mono text-xs p-3 h-72 overflow-auto">
        {log.length === 0 ? <div className="opacity-60">السجل فارغ</div> : log.map((l, i) => <div key={i}>{l}</div>)}
      </div>
    </div>
  );
}

