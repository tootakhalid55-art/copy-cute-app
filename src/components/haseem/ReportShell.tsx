import { Shell, PageHeader, OutlineBtn, money } from "./Shell";
import { Download, Printer } from "lucide-react";
import { useRef, type ReactNode } from "react";

export function ReportShell({
  title, subtitle, filters, children, exportRows,
}: {
  title: string;
  subtitle?: string;
  filters?: ReactNode;
  children: ReactNode;
  exportRows?: () => { headers: string[]; rows: (string | number)[][] };
}) {
  const ref = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    const html = ref.current?.innerHTML;
    if (!html) return;
    const w = window.open("", "_blank", "width=900,height=1000");
    if (!w) return;
    w.document.write(`<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${title}</title>
      <style>
        body{font-family:Cairo,system-ui,sans-serif;padding:20px;color:#111}
        table{width:100%;border-collapse:collapse;font-size:12px}
        th,td{border:1px solid #d4d0c4;padding:6px 8px;text-align:right}
        thead th{background:#0f2a1d;color:#fff}
        h1,h2,h3{margin:8px 0}
        .totals{font-weight:bold;background:#f7f6f0}
      </style></head><body><h1>${title}</h1>${html}</body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  const handleExport = () => {
    if (!exportRows) return;
    const { headers, rows } = exportRows();
    const esc = (v: any) => {
      const s = String(v ?? "").replace(/"/g, '""');
      return /[",\n]/.test(s) ? `"${s}"` : s;
    };
    const csv = "\uFEFF" + [headers, ...rows].map((r) => r.map(esc).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${title.replace(/\s+/g, "_")}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Shell>
      <PageHeader
        title={title}
        subtitle={subtitle}
        action={
          <div className="flex gap-2">
            {exportRows && (
              <OutlineBtn onClick={handleExport}><Download className="w-4 h-4" /> تصدير CSV</OutlineBtn>
            )}
            <OutlineBtn onClick={handlePrint}><Printer className="w-4 h-4" /> طباعة</OutlineBtn>
          </div>
        }
      />
      {filters && <div className="flex flex-wrap gap-3 items-end bg-white border border-[#eceae2] rounded-xl p-3">{filters}</div>}
      <div ref={ref} className="space-y-4">{children}</div>
    </Shell>
  );
}

export function DateRange({ from, to, setFrom, setTo }: { from: string; to: string; setFrom: (v: string) => void; setTo: (v: string) => void }) {
  return (
    <>
      <label className="text-xs text-[#0f2a1d]/70 flex flex-col gap-1">من
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="border border-[#eceae2] rounded-lg px-3 py-2 text-sm" />
      </label>
      <label className="text-xs text-[#0f2a1d]/70 flex flex-col gap-1">إلى
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="border border-[#eceae2] rounded-lg px-3 py-2 text-sm" />
      </label>
    </>
  );
}

export function ReportTable({ headers, rows, totalsRow }: {
  headers: string[];
  rows: ReactNode[][];
  totalsRow?: ReactNode[];
}) {
  return (
    <div className="rounded-xl bg-white border border-[#eceae2] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[#0f2a1d] text-white text-xs">
            <tr className="text-right">
              {headers.map((h, i) => <th key={i} className="py-2.5 px-3 font-medium whitespace-nowrap">{h}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#eceae2]">
            {rows.length === 0 ? (
              <tr><td colSpan={headers.length} className="py-8 text-center text-[#0f2a1d]/50 text-xs">لا توجد بيانات</td></tr>
            ) : rows.map((r, i) => (
              <tr key={i} className="text-right hover:bg-[#fafaf7]">
                {r.map((c, j) => <td key={j} className="py-2 px-3">{c}</td>)}
              </tr>
            ))}
            {totalsRow && (
              <tr className="bg-[#f7f6f0] font-bold text-right">
                {totalsRow.map((c, j) => <td key={j} className="py-2.5 px-3">{c}</td>)}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export { money };
