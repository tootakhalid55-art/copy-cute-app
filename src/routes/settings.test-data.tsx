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

