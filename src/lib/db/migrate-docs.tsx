// Batch 2B document migration: uploads legacy localStorage documents
// (invoices, bills, quotations, credit/debit notes, purchase orders) to the
// unified documents/document_lines tables, with duplicate detection by
// (kind + doc_number) and a downloadable JSON report.
import { useCallback, useMemo, useState } from "react";
import { UploadCloud, Loader2, CheckCircle2, Download, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "./org";

const LEGACY: Array<{ key: string; kind: string; prefix: string }> = [
  { key: "invoices", kind: "sales_invoice", prefix: "INV" },
  { key: "bills", kind: "purchase_invoice", prefix: "BILL" },
  { key: "quotations", kind: "sales_quotation", prefix: "Q" },
  { key: "credit-notes", kind: "credit_note", prefix: "CN" },
  { key: "debit-notes", kind: "debit_note", prefix: "DN" },
  { key: "purchase-orders", kind: "purchase_order", prefix: "PO" },
];


type ReportRow = { key: string; docNumber: string; outcome: "imported" | "duplicate" | "failed" | "skipped"; error?: string };
type Report = {
  scope: string;
  imported: number;
  failed: number;
  skipped: number;
  duplicate: number;
  details: ReportRow[];
  finished_at: string;
};

function readLS(k: string): any[] {
  try {
    return JSON.parse(localStorage.getItem(`haseem:${k}`) || "[]");
  } catch {
    return [];
  }
}

export function DocumentsMigrationButton() {
  const { currentOrgId } = useOrg();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [report, setReport] = useState<Report | null>(null);

  const totals = useMemo(() => {
    const t: Record<string, number> = {};
    for (const l of LEGACY) t[l.key] = readLS(l.key).length;
    return t;
  }, [open]);

  const run = useCallback(async () => {
    if (!currentOrgId) return;
    setBusy(true);
    const details: ReportRow[] = [];
    let imported = 0, failed = 0, skipped = 0, duplicate = 0;

    for (const legacy of LEGACY) {
      const rows = readLS(legacy.key);
      if (!rows.length) continue;
      setProgress(`ترحيل ${legacy.key}...`);

      // Existing doc numbers to detect duplicates
      const { data: existing } = await supabase
        .from("documents")
        .select("doc_number")
        .eq("org_id", currentOrgId)
        .eq("kind", legacy.kind);
      const have = new Set((existing ?? []).map((d) => d.doc_number));

      for (const r of rows) {
        const doc_number = String(r.docNumber || r.number || r.doc_number || `${legacy.prefix}-${r.id ?? Date.now()}`);
        if (have.has(doc_number)) {
          duplicate++;
          details.push({ key: legacy.key, docNumber: doc_number, outcome: "duplicate" });
          continue;
        }
        try {
          const lines = Array.isArray(r.lines) ? r.lines : [];
          const grand = Number(r.grandTotal ?? r.total ?? 0);
          const { data: doc, error } = await (supabase.from("documents") as any)
            .insert({
              org_id: currentOrgId,
              kind: legacy.kind,
              status: "draft",
              doc_number,
              po_number: r.poNumber ?? null,
              issue_date: r.date ?? r.issueDate ?? new Date().toISOString().slice(0, 10),
              due_date: r.dueDate ?? null,
              currency: r.currency ?? "SAR",
              exchange_rate: Number(r.exchangeRate ?? 1) || 1,
              tax_inclusive: !!r.taxInclusive,
              subtotal: Number(r.subtotal ?? 0),
              discount_total: Number(r.discountTotal ?? 0),
              shipping: Number(r.shipping ?? 0),
              other_charges: Number(r.otherCharges ?? 0),
              grand_total: grand,
              notes: r.notes ?? null,
              terms: r.terms ?? null,
              party_snapshot: r.party ?? r.customer ?? r.supplier ?? {},
              qr_payload: r.qrPayload ?? null,
              meta: { imported: true, legacy_key: legacy.key, legacy_id: r.id ?? null },
            })
            .select("id")
            .single();
          if (error) throw error;

          if (lines.length) {
            const rowsIns = lines.map((l: any, i: number) => ({
              org_id: currentOrgId,
              document_id: doc.id,
              line_no: i + 1,
              description: l.description ?? l.name ?? null,
              quantity: Number(l.qty ?? l.quantity ?? 1),
              unit: l.unit ?? null,
              unit_price: Number(l.unitPrice ?? l.price ?? 0),
              discount_percent: Number(l.discountPercent ?? 0),
              discount_amount: Number(l.discountAmount ?? 0),
              tax_rate: Number(l.taxRate ?? 15),
              tax_amount: Number(l.taxAmount ?? 0),
              line_total: Number(l.total ?? l.lineTotal ?? 0),
              meta: {},
            }));
            const { error: lErr } = await (supabase.from("document_lines") as any).insert(rowsIns);
            if (lErr) throw lErr;
          }

          imported++;
          details.push({ key: legacy.key, docNumber: doc_number, outcome: "imported" });
        } catch (e: any) {
          failed++;
          details.push({ key: legacy.key, docNumber: doc_number, outcome: "failed", error: e?.message ?? String(e) });
        }
      }
    }

    const rep: Report = { scope: "documents", imported, failed, skipped, duplicate, details, finished_at: new Date().toISOString() };
    setReport(rep);
    try {
      await (supabase.from("migration_reports") as any).insert({
        org_id: currentOrgId,
        user_id: (await supabase.auth.getUser()).data.user?.id,
        scope: "documents",
        imported, failed, skipped, duplicate,
        details,
      });
    } catch {}
    setProgress("");
    setBusy(false);
  }, [currentOrgId]);

  const download = () => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `migration-report-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };

  const total = Object.values(totals).reduce((a, b) => a + b, 0);
  if (!currentOrgId) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-xs px-3 py-2 rounded-lg border border-[#eceae2] bg-white hover:bg-[#f7f5ec] inline-flex items-center gap-1.5"
      >
        <UploadCloud className="w-3.5 h-3.5" /> ترحيل المستندات القديمة
      </button>
      {open && (
        <div className="fixed inset-0 z-[1000] bg-black/50 flex items-center justify-center p-4" dir="rtl">
          <div className="bg-white rounded-2xl w-full max-w-lg p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold text-[#0f2a1d]">ترحيل المستندات إلى السحابة</h2>
              <button onClick={() => setOpen(false)}><X className="w-4 h-4" /></button>
            </div>
            {!report ? (
              <>
                <div className="bg-[#f7f5ec] rounded-lg p-3 text-sm mb-3">
                  <div className="font-semibold mb-1">إجمالي: {total} مستند</div>
                  <ul className="text-xs space-y-0.5">
                    {LEGACY.map((l) => (
                      <li key={l.key} className="flex justify-between">
                        <span>{l.key}</span>
                        <span>{totals[l.key] ?? 0}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <p className="text-xs text-[#0f2a1d]/70 mb-3">سيتم التحقق من التكرارات حسب (النوع + رقم المستند).</p>
                {busy ? (
                  <div className="text-sm text-center py-4">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
                    {progress}
                  </div>
                ) : (
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setOpen(false)} className="text-xs px-3 py-2 rounded-lg border">إغلاق</button>
                    <button onClick={run} disabled={total === 0} className="text-xs px-3 py-2 rounded-lg bg-[#0f2a1d] text-[#d4f24a] font-semibold disabled:opacity-50">
                      بدء الترحيل
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-green-700">
                  <CheckCircle2 className="w-5 h-5" />
                  <span className="font-semibold text-sm">اكتمل الترحيل</span>
                </div>
                <div className="grid grid-cols-4 gap-2 text-center text-xs">
                  <Stat label="مُرحّل" value={report.imported} tone="green" />
                  <Stat label="مكرر" value={report.duplicate} tone="amber" />
                  <Stat label="متجاوز" value={report.skipped} tone="slate" />
                  <Stat label="فشل" value={report.failed} tone="red" />
                </div>
                <div className="max-h-52 overflow-auto border border-[#eceae2] rounded-lg text-xs">
                  <table className="w-full">
                    <thead className="bg-[#f7f5ec]">
                      <tr><th className="p-1.5 text-right">النوع</th><th className="p-1.5 text-right">الرقم</th><th className="p-1.5">النتيجة</th></tr>
                    </thead>
                    <tbody>
                      {report.details.map((d, i) => (
                        <tr key={i} className="border-t border-[#eceae2]/60">
                          <td className="p-1.5">{d.key}</td>
                          <td className="p-1.5">{d.docNumber}</td>
                          <td className="p-1.5 text-center">{d.outcome}{d.error ? ` — ${d.error}` : ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex justify-end gap-2">
                  <button onClick={download} className="text-xs px-3 py-2 rounded-lg border inline-flex items-center gap-1"><Download className="w-3.5 h-3.5" /> تصدير التقرير</button>
                  <button onClick={() => { setOpen(false); setReport(null); }} className="text-xs px-3 py-2 rounded-lg bg-[#0f2a1d] text-[#d4f24a] font-semibold">تم</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "green" | "amber" | "red" | "slate" }) {
  const cls = {
    green: "bg-green-50 text-green-700",
    amber: "bg-amber-50 text-amber-700",
    red: "bg-red-50 text-red-700",
    slate: "bg-slate-50 text-slate-700",
  }[tone];
  return (
    <div className={`rounded-lg p-2 ${cls}`}>
      <div className="text-lg font-bold">{value}</div>
      <div className="text-[10px]">{label}</div>
    </div>
  );
}
