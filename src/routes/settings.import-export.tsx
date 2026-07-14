import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Shell, PageHeader, PrimaryBtn, OutlineBtn } from "@/components/haseem/Shell";
import { Download, Upload } from "lucide-react";

export const Route = createFileRoute("/settings/import-export")({
  head: () => ({ meta: [{ title: "الاستيراد والتصدير — حسيم" }] }),
  component: IEPage,
});

const COLLECTIONS = [
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

function IEPage() {
  const [msg, setMsg] = useState("");

  const exportOne = (key: string) => {
    const data = localStorage.getItem(`haseem:${key}`) || "[]";
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `${key}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  const exportAll = () => {
    const bundle: Record<string, any> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      if (k.startsWith("haseem:")) bundle[k] = JSON.parse(localStorage.getItem(k) || "null");
    }
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `haseem-backup-${new Date().toISOString().slice(0,10)}.json`; a.click();
    URL.revokeObjectURL(url);
    setMsg("تم تصدير جميع البيانات ✓"); setTimeout(() => setMsg(""), 2000);
  };

  const importAll = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const bundle = JSON.parse(String(reader.result));
        if (!bundle || typeof bundle !== "object") throw new Error();
        if (!confirm("سيتم استبدال البيانات الحالية. المتابعة؟")) return;
        Object.entries(bundle).forEach(([k, v]) => {
          if (k.startsWith("haseem:")) localStorage.setItem(k, JSON.stringify(v));
        });
        setMsg("تم الاستيراد. أعد تحميل الصفحة لرؤية التغييرات."); setTimeout(() => setMsg(""), 3000);
      } catch { alert("ملف غير صالح"); }
    };
    reader.readAsText(file);
  };

  return (
    <Shell>
      <PageHeader title="الاستيراد والتصدير" subtitle="نسخ احتياطية واستعادة لبيانات النظام" action={
        <div className="flex gap-2">
          <label className="cursor-pointer">
            <OutlineBtn as="span" onClick={() => {}}><Upload className="w-4 h-4" /> استيراد نسخة كاملة</OutlineBtn>
            <input type="file" accept=".json" className="hidden" onChange={(e) => e.target.files?.[0] && importAll(e.target.files[0])} />
          </label>
          <PrimaryBtn onClick={exportAll}><Download className="w-4 h-4" /> تصدير الكل</PrimaryBtn>
        </div>
      } />
      {msg && <div className="text-xs text-[#0f6b3a] bg-[#eaf5ee] rounded px-3 py-2">{msg}</div>}
      <div className="rounded-xl bg-white border border-[#eceae2] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[#f7f6f0] text-xs">
            <tr className="text-right"><th className="p-3">المجموعة</th><th className="p-3">الإجراء</th></tr>
          </thead>
          <tbody className="divide-y divide-[#eceae2]">
            {COLLECTIONS.map((c) => (
              <tr key={c.key} className="text-right"><td className="p-3">{c.label}</td>
                <td className="p-3"><OutlineBtn onClick={() => exportOne(c.key)}><Download className="w-3.5 h-3.5" /> تصدير JSON</OutlineBtn></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
