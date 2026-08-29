import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Shell, PageHeader, PrimaryBtn, OutlineBtn } from "@/components/haseem/Shell";
import { Download, Upload, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { useCollection } from "@/lib/haseem/store";

export const Route = createFileRoute("/settings/import-export")({
  head: () => ({ meta: [{ title: "الاستيراد والتصدير — كنار المحاسبية" }] }),
  component: IEPage,
});

const COLLECTION_LABELS: Array<{ key: string; label: string }> = [
  { key: "customers", label: "العملاء" },
  { key: "suppliers", label: "الموردون" },
  { key: "items", label: "الأصناف" },
  { key: "invoices", label: "فواتير المبيعات" },
  { key: "quotations", label: "عروض الأسعار" },
  { key: "credit-notes", label: "الإشعارات الدائنة" },
  { key: "bills", label: "فواتير المشتريات" },
  { key: "purchase-orders", label: "أوامر الشراء" },
  { key: "expenses", label: "المصروفات" },
  { key: "receipts", label: "سندات القبض" },
  { key: "payments", label: "سندات الصرف" },
  { key: "accounts", label: "دليل الحسابات" },
  { key: "journal-entries", label: "القيود اليومية" },
];

// ---- tiny CSV parser (quotes + escaped quotes + CRLF) ----
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else inQ = false;
      } else cell += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((v) => v.trim() !== "")) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((v) => v.trim() !== "")) rows.push(row);
  return rows;
}

// Header aliases (Arabic/English) -> record field
const HEADER_MAP: Record<string, string> = {
  "name": "name", "الاسم": "name", "اسم": "name", "اسم العميل": "name", "اسم المورد": "name", "اسم الصنف": "name",
  "taxnumber": "taxNumber", "vat": "taxNumber", "الرقم الضريبي": "taxNumber",
  "phone": "phone", "الجوال": "phone", "الهاتف": "phone",
  "email": "email", "البريد": "email", "البريد الإلكتروني": "email",
  "address": "address", "العنوان": "address",
  "openingbalance": "openingBalance", "الرصيد الافتتاحي": "openingBalance",
  "sku": "sku", "رمز الصنف": "sku", "الرمز": "sku",
  "unit": "unit", "الوحدة": "unit",
  "price": "price", "السعر": "price", "سعر البيع": "price",
  "cost": "cost", "التكلفة": "cost", "سعر الشراء": "cost",
  "stock": "stock", "الكمية": "stock", "المخزون": "stock",
  "taxrate": "taxRate", "نسبة الضريبة": "taxRate",
  "type": "type", "النوع": "type",
  "notes": "notes", "ملاحظات": "notes",
};

const CSV_TARGETS = [
  { key: "customers", label: "العملاء", hint: "الأعمدة: الاسم، الرقم الضريبي، الجوال، البريد، العنوان، الرصيد الافتتاحي" },
  { key: "suppliers", label: "الموردون", hint: "الأعمدة: الاسم، الرقم الضريبي، الجوال، البريد، العنوان، الرصيد الافتتاحي" },
  { key: "items", label: "الأصناف", hint: "الأعمدة: الاسم، الرمز، الوحدة، السعر، التكلفة، الكمية، نسبة الضريبة" },
] as const;

function CsvImportSection() {
  const [target, setTarget] = useState<(typeof CSV_TARGETS)[number]["key"]>("customers");
  const [busy, setBusy] = useState(false);
  const { addAsync: addCustomer } = useCollection<any>("customers");
  const { addAsync: addSupplier } = useCollection<any>("suppliers");
  const { addAsync: addItem } = useCollection<any>("items");
  const adders: Record<string, (r: any) => Promise<any>> = useMemo(
    () => ({ customers: addCustomer, suppliers: addSupplier, items: addItem }),
    [addCustomer, addSupplier, addItem],
  );

  const importCsv = async (file: File) => {
    setBusy(true);
    let ok = 0, failed = 0;
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      if (rows.length < 2) throw new Error("الملف فارغ أو بلا صفوف بيانات");
      const headers = rows[0].map((h) => HEADER_MAP[h.trim().toLowerCase()] ?? HEADER_MAP[h.trim()] ?? h.trim());
      if (!headers.includes("name")) throw new Error("عمود الاسم مطلوب (name / الاسم)");
      for (const raw of rows.slice(1)) {
        const rec: Record<string, any> = {};
        headers.forEach((h, i) => { if (raw[i] !== undefined && raw[i] !== "") rec[h] = raw[i].trim(); });
        if (!rec.name) { failed++; continue; }
        try {
          await adders[target](rec);
          ok++;
        } catch {
          failed++;
        }
      }
      toast[failed ? "warning" : "success"](`استيراد CSV: نجح ${ok}${failed ? ` وفشل ${failed}` : ""}`);
    } catch (e: any) {
      toast.error(e?.message ?? "فشل الاستيراد");
    } finally {
      setBusy(false);
    }
  };

  const hint = CSV_TARGETS.find((t) => t.key === target)?.hint;
  return (
    <div className="rounded-xl bg-white border border-[#eceae2] p-5 space-y-3">
      <div className="flex items-center gap-2">
        <FileSpreadsheet className="w-4 h-4 text-[#0f6b3a]" />
        <h3 className="font-semibold text-sm">استيراد من ملف CSV / Excel</h3>
      </div>
      <p className="text-xs text-[#0f2a1d]/60">
        احفظ الجدول من Excel بصيغة CSV (UTF-8) ثم ارفعه هنا. الصف الأول عناوين الأعمدة بالعربية أو الإنجليزية. {hint}
      </p>
      <div className="flex items-center gap-3 flex-wrap">
        <select value={target} onChange={(e) => setTarget(e.target.value as any)}
          className="border border-[#eceae2] rounded-lg px-3 py-2 text-sm">
          {CSV_TARGETS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
        <label className={`inline-flex items-center gap-2 bg-[#0f2a1d] text-white rounded-lg px-4 py-2 text-sm cursor-pointer ${busy ? "opacity-60 pointer-events-none" : "hover:bg-[#163a29]"}`}>
          <Upload className="w-4 h-4" /> {busy ? "جارٍ الاستيراد…" : "اختر ملف CSV"}
          <input type="file" accept=".csv,text/csv" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) importCsv(f); e.target.value = ""; }} />
        </label>
      </div>
    </div>
  );
}

function IEPage() {
  // One hook per exportable collection (fixed order keeps the Rules of Hooks).
  const colls: Record<string, any[]> = {
    customers: useCollection<any>("customers").items,
    suppliers: useCollection<any>("suppliers").items,
    items: useCollection<any>("items").items,
    invoices: useCollection<any>("invoices").items,
    quotations: useCollection<any>("quotations").items,
    "credit-notes": useCollection<any>("credit-notes").items,
    bills: useCollection<any>("bills").items,
    "purchase-orders": useCollection<any>("purchase-orders").items,
    expenses: useCollection<any>("expenses").items,
    receipts: useCollection<any>("receipts").items,
    payments: useCollection<any>("payments").items,
    accounts: useCollection<any>("accounts").items,
    "journal-entries": useCollection<any>("journal-entries").items,
  };
  const [msg, setMsg] = useState("");

  const downloadBlob = (content: string, name: string, type = "application/json") => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
  };

  const exportOne = (key: string) => {
    downloadBlob(JSON.stringify(colls[key] ?? [], null, 2), `${key}.json`);
  };

  const exportOneCsv = (key: string) => {
    const rows = colls[key] ?? [];
    if (!rows.length) { toast.info("لا توجد بيانات للتصدير"); return; }
    const headers = Array.from(new Set(rows.flatMap((r: any) => Object.keys(r)))).filter((h) => h !== "lines");
    const esc = (v: any) => `"${String(v ?? "").replaceAll('"', '""')}"`;
    const csv = [headers.join(","), ...rows.map((r: any) => headers.map((h) => esc(typeof r[h] === "object" ? JSON.stringify(r[h]) : r[h])).join(","))].join("\n");
    downloadBlob("﻿" + csv, `${key}.csv`, "text/csv;charset=utf-8");
  };

  const exportAll = () => {
    const bundle = Object.fromEntries(COLLECTION_LABELS.map((c) => [c.key, colls[c.key] ?? []]));
    downloadBlob(JSON.stringify(bundle, null, 2), `canar-backup-${new Date().toISOString().slice(0, 10)}.json`);
    setMsg("تم تصدير جميع البيانات ✓"); setTimeout(() => setMsg(""), 2000);
  };

  return (
    <Shell>
      <PageHeader title="الاستيراد والتصدير" subtitle="نسخ احتياطية من قاعدة البيانات واستيراد جماعي" action={
        <PrimaryBtn onClick={exportAll}><Download className="w-4 h-4" /> تصدير الكل</PrimaryBtn>
      } />
      {msg && <div className="text-xs text-[#0f6b3a] bg-[#eaf5ee] rounded px-3 py-2">{msg}</div>}

      <CsvImportSection />

      <div className="rounded-xl bg-white border border-[#eceae2] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[#f7f6f0] text-xs">
            <tr className="text-right"><th className="p-3">المجموعة</th><th className="p-3">السجلات</th><th className="p-3">تصدير</th></tr>
          </thead>
          <tbody className="divide-y divide-[#eceae2]">
            {COLLECTION_LABELS.map((c) => (
              <tr key={c.key} className="text-right">
                <td className="p-3">{c.label}</td>
                <td className="p-3 tabular-nums text-xs text-[#0f2a1d]/60">{(colls[c.key] ?? []).length}</td>
                <td className="p-3 flex gap-2">
                  <OutlineBtn onClick={() => exportOne(c.key)}><Download className="w-3.5 h-3.5" /> JSON</OutlineBtn>
                  <OutlineBtn onClick={() => exportOneCsv(c.key)}><Download className="w-3.5 h-3.5" /> CSV</OutlineBtn>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
