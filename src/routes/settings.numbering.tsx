import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Shell, PageHeader, PrimaryBtn } from "@/components/haseem/Shell";
import { useKV } from "@/lib/haseem/store";
import { Save } from "lucide-react";

export const Route = createFileRoute("/settings/numbering")({
  head: () => ({ meta: [{ title: "الترقيم التلقائي — حسيم" }] }),
  component: NumberingPage,
});

type Config = Record<string, { prefix: string; nextNumber: number; padding: number }>;
const DEFAULTS: Config = {
  invoice: { prefix: "INV", nextNumber: 100, padding: 6 },
  quotation: { prefix: "QT", nextNumber: 100, padding: 6 },
  "credit-note": { prefix: "CN", nextNumber: 100, padding: 6 },
  "debit-note": { prefix: "DN", nextNumber: 100, padding: 6 },
  bill: { prefix: "BILL", nextNumber: 100, padding: 6 },
  "purchase-order": { prefix: "PO", nextNumber: 100, padding: 6 },
  receipt: { prefix: "REC", nextNumber: 100, padding: 6 },
  payment: { prefix: "PAY", nextNumber: 100, padding: 6 },
  "journal-entry": { prefix: "JE", nextNumber: 100, padding: 5 },
};
const LABELS: Record<string, string> = {
  invoice: "فواتير المبيعات", quotation: "عروض الأسعار",
  "credit-note": "الإشعارات الدائنة", "debit-note": "الإشعارات المدينة",
  bill: "فواتير المشتريات", "purchase-order": "أوامر الشراء",
  receipt: "سندات القبض", payment: "سندات الصرف",
  "journal-entry": "القيود اليومية",
};

function NumberingPage() {
  const [config, setConfig] = useKV<Config>("numbering-config", DEFAULTS);
  const [draft, setDraft] = useState<Config>(config);
  const [saved, setSaved] = useState(false);
  const update = (k: string, patch: Partial<Config[string]>) => setDraft((c) => ({ ...c, [k]: { ...c[k], ...patch } }));
  return (
    <Shell>
      <PageHeader title="الترقيم التلقائي" subtitle="تحكم في بادئة الترقيم والرقم التالي لكل نوع مستند" action={
        <PrimaryBtn onClick={() => { setConfig(draft); setSaved(true); setTimeout(() => setSaved(false), 1500); }}>
          <Save className="w-4 h-4" /> حفظ
        </PrimaryBtn>
      } />
      {saved && <div className="text-xs text-[#0f6b3a] bg-[#eaf5ee] rounded px-3 py-2">تم الحفظ</div>}
      <div className="rounded-xl bg-white border border-[#eceae2] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[#f7f6f0] text-xs">
            <tr className="text-right"><th className="p-3">النوع</th><th className="p-3">البادئة</th><th className="p-3">الرقم التالي</th><th className="p-3">عدد الخانات</th><th className="p-3">معاينة</th></tr>
          </thead>
          <tbody className="divide-y divide-[#eceae2]">
            {Object.entries(draft).map(([k, v]) => (
              <tr key={k} className="text-right">
                <td className="p-3 font-medium">{LABELS[k] || k}</td>
                <td className="p-3"><input value={v.prefix} onChange={(e) => update(k, { prefix: e.target.value })} className="border border-[#eceae2] rounded px-2 py-1 w-24 text-center" /></td>
                <td className="p-3"><input type="number" value={v.nextNumber} onChange={(e) => update(k, { nextNumber: Number(e.target.value) })} className="border border-[#eceae2] rounded px-2 py-1 w-28 text-center" /></td>
                <td className="p-3"><input type="number" min={1} max={10} value={v.padding} onChange={(e) => update(k, { padding: Number(e.target.value) })} className="border border-[#eceae2] rounded px-2 py-1 w-20 text-center" /></td>
                <td className="p-3 font-mono text-[#0f6b3a]">{v.prefix}-{String(v.nextNumber).padStart(v.padding, "0")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
