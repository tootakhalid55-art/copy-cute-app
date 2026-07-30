import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Download, FileBarChart, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, OutlineBtn, PageHeader, Shell, StatCard, money } from "@/components/haseem/Shell";
import { getAssetReportsData } from "@/lib/assets/reports.functions";
import { useOrg } from "@/lib/db/org";

export const Route = createFileRoute("/assets/reports")({
  head: () => ({ meta: [{ title: "تقارير الأصول — كنار المحاسبية" }] }),
  component: AssetReports,
});

type Asset = {
  id: string; code: string; name: string; status: string; is_cip: boolean;
  category: { name: string } | null;
  acquisition_cost: number; accumulated_depreciation: number; revaluation_surplus: number;
  impairment_loss: number; acquisition_date: string | null; in_service_date: string | null;
  disposed_at: string | null; disposal_method: string | null; branch_id: string | null;
  cost_center_id: string | null; department: string | null; custodian_name: string | null;
  location_text: string | null; currency: string; health_score: number | null; health_tier: string | null;
};
type AssetEvent = {
  id: string; asset_id: string; event_type: string; status: string; effective_date: string;
  amount: number; payload: Record<string, unknown>; journal_id: string | null; notes: string | null;
};
type ReportKey = "register" | "rollforward" | "disposal" | "revaluation" | "impairment" | "transfer" | "cip" | "history" | "movement" | "nbv_category";

const REPORTS: Array<{ key: ReportKey; label: string }> = [
  { key: "register", label: "سجل الأصول" },
  { key: "rollforward", label: "حركة الإهلاك" },
  { key: "disposal", label: "الاستبعادات" },
  { key: "revaluation", label: "إعادة التقييم" },
  { key: "impairment", label: "الاضمحلال" },
  { key: "transfer", label: "النقل" },
  { key: "cip", label: "أصول تحت الإنشاء" },
  { key: "history", label: "تاريخ الأصل" },
  { key: "movement", label: "دفتر حركة الأصول" },
  { key: "nbv_category", label: "القيمة الدفترية حسب الفئة" },
];

const EVENT_LABELS: Record<string, string> = {
  acquisition: "اقتناء", capitalization: "رسملة", depreciation: "إهلاك",
  improvement_capital: "تحسين رأسمالي", improvement_expense: "تحسين مصروفي",
  partial_disposal: "استبعاد جزئي", full_disposal: "استبعاد كامل", sale: "بيع",
  transfer: "نقل", revaluation_up: "إعادة تقييم بالزيادة", revaluation_down: "إعادة تقييم بالنقص",
  impairment: "اضمحلال", impairment_reversal: "عكس اضمحلال", restoration: "استعادة",
  split: "تقسيم", merge: "دمج", write_off: "شطب", retirement: "إحالة", reactivation: "إعادة تنشيط",
};

function AssetReports() {
  const { currentOrg: org } = useOrg();
  const fetchReports = useServerFn(getAssetReportsData);
  const [report, setReport] = useState<ReportKey>("register");
  const [from, setFrom] = useState(`${new Date().getFullYear()}-01-01`);
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [assets, setAssets] = useState<Asset[]>([]);
  const [events, setEvents] = useState<AssetEvent[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!org?.id) return;
    setLoading(true);
    try {
      const result = await fetchReports({ data: { orgId: org.id, from, to } }) as { assets: Asset[]; events: AssetEvent[] };
      setAssets(result.assets);
      setEvents(result.events);
    } finally { setLoading(false); }
  }, [fetchReports, from, org?.id, to]);
  useEffect(() => { load(); }, [load]);

  const byId = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);
  const nbv = (asset: Asset) => Number(asset.acquisition_cost || 0) + Number(asset.revaluation_surplus || 0) - Number(asset.accumulated_depreciation || 0) - Number(asset.impairment_loss || 0);
  const active = assets.filter((asset) => asset.status === "active");
  const totals = {
    cost: assets.reduce((sum, asset) => sum + Number(asset.acquisition_cost || 0), 0),
    depreciation: assets.reduce((sum, asset) => sum + Number(asset.accumulated_depreciation || 0), 0),
    nbv: assets.reduce((sum, asset) => sum + nbv(asset), 0),
  };
  const filteredEvents = useMemo(() => {
    const kinds: Partial<Record<ReportKey, string[]>> = {
      disposal: ["partial_disposal", "full_disposal", "sale", "write_off", "retirement"],
      revaluation: ["revaluation_up", "revaluation_down"],
      impairment: ["impairment", "impairment_reversal"],
      transfer: ["transfer"],
    };
    return kinds[report] ? events.filter((event) => kinds[report]!.includes(event.event_type)) : events;
  }, [events, report]);

  const exportCsv = () => {
    const rows = report === "register"
      ? assets.map((asset) => [asset.code, asset.name, asset.status, asset.acquisition_cost, asset.accumulated_depreciation, asset.revaluation_surplus, asset.impairment_loss, nbv(asset)])
      : filteredEvents.map((event) => [event.effective_date, byId.get(event.asset_id)?.code || "", byId.get(event.asset_id)?.name || "", EVENT_LABELS[event.event_type] || event.event_type, event.status, event.amount, event.journal_id || "", event.notes || ""]);
    const header = report === "register"
      ? ["Code", "Asset", "Status", "Cost", "Accumulated depreciation", "Revaluation", "Impairment", "NBV"]
      : ["Date", "Code", "Asset", "Event", "Status", "Amount", "Journal", "Notes"];
    const csv = [header, ...rows].map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll("\"", "\"\"")}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `asset-${report}-${from}-${to}.csv`; anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Shell>
      <PageHeader
        title="مركز تقارير الأصول"
        subtitle="تقارير موحدة للقيمة الدفترية، الإهلاك، الحركات والأحداث خلال الفترة."
        action={<div className="flex gap-2"><Link to="/assets"><OutlineBtn>سجل الأصول</OutlineBtn></Link><OutlineBtn onClick={exportCsv}><Download className="w-4 h-4" /> تصدير CSV</OutlineBtn></div>}
      />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="الأصول النشطة" value={active.length.toLocaleString("ar-SA")} />
        <StatCard label="التكلفة الإجمالية" value={money(totals.cost)} />
        <StatCard label="مجمع الإهلاك" value={money(totals.depreciation)} valueClass="text-amber-700" />
        <StatCard label="صافي القيمة الدفترية" value={money(totals.nbv)} valueClass="text-emerald-700" />
      </div>
      <div className="rounded-xl border border-[#eceae2] bg-white">
        <div className="p-3 border-b border-[#eceae2] flex flex-wrap gap-2 items-center">
          <select value={report} onChange={(event) => setReport(event.target.value as ReportKey)} className="border border-[#eceae2] rounded-lg px-3 py-2 text-sm bg-white">
            {REPORTS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
          </select>
          <label className="text-xs">من <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="border border-[#eceae2] rounded-lg px-2 py-2 mr-1" /></label>
          <label className="text-xs">إلى <input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="border border-[#eceae2] rounded-lg px-2 py-2 mr-1" /></label>
          <OutlineBtn onClick={load}><RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> تحديث</OutlineBtn>
        </div>
        <div className="p-4">
          <div className="flex items-center gap-2 mb-4"><FileBarChart className="w-5 h-5 text-[#0f5132]" /><h2 className="font-semibold">{REPORTS.find((item) => item.key === report)?.label}</h2></div>
          {report === "register" && <AssetRegister assets={assets} nbv={nbv} />}
          {report === "rollforward" && <Rollforward assets={assets} events={events} />}
          {report === "cip" && <AssetRegister assets={assets.filter((asset) => asset.is_cip)} nbv={nbv} />}
          {report === "nbv_category" && <NbvByCategory assets={assets} nbv={nbv} />}
          {(["disposal", "revaluation", "impairment", "transfer", "history", "movement"] as ReportKey[]).includes(report) && <EventLedger events={filteredEvents} byId={byId} />}
        </div>
      </div>
    </Shell>
  );
}

function AssetRegister({ assets, nbv }: { assets: Asset[]; nbv: (asset: Asset) => number }) {
  return <Table headers={["الكود", "الأصل", "الحالة", "التكلفة", "الإهلاك", "إعادة التقييم", "الاضمحلال", "القيمة الدفترية", "الصحة"]}>
    {assets.map((asset) => <tr key={asset.id}>
      <td className="p-2 font-mono text-xs">{asset.code}</td><td className="p-2">{asset.name}</td>
      <td className="p-2"><Badge tone={asset.status === "active" ? "green" : "neutral"}>{asset.status}</Badge></td>
      <td className="p-2">{money(asset.acquisition_cost)}</td><td className="p-2">{money(asset.accumulated_depreciation)}</td>
      <td className="p-2">{money(asset.revaluation_surplus)}</td><td className="p-2">{money(asset.impairment_loss)}</td>
      <td className="p-2 font-semibold">{money(nbv(asset))}</td><td className="p-2">{asset.health_score ?? "—"}</td>
    </tr>)}
  </Table>;
}

function EventLedger({ events, byId }: { events: AssetEvent[]; byId: Map<string, Asset> }) {
  return <Table headers={["التاريخ", "الأصل", "الحدث", "الحالة", "القيمة", "القيد", "الملاحظات"]}>
    {events.map((event) => <tr key={event.id}>
      <td className="p-2">{event.effective_date}</td><td className="p-2">{byId.get(event.asset_id)?.code || "—"} — {byId.get(event.asset_id)?.name || "أصل غير متاح"}</td>
      <td className="p-2">{EVENT_LABELS[event.event_type] || event.event_type}</td><td className="p-2"><Badge tone={event.status === "posted" ? "green" : "neutral"}>{event.status}</Badge></td>
      <td className="p-2">{money(event.amount)}</td><td className="p-2 font-mono text-xs">{event.journal_id || "—"}</td><td className="p-2">{event.notes || "—"}</td>
    </tr>)}
  </Table>;
}

function Rollforward({ assets, events }: { assets: Asset[]; events: AssetEvent[] }) {
  const additions = events.filter((event) => ["acquisition", "capitalization", "improvement_capital"].includes(event.event_type)).reduce((sum, event) => sum + Number(event.amount || 0), 0);
  const depreciation = events.filter((event) => event.event_type === "depreciation").reduce((sum, event) => sum + Number(event.amount || 0), 0);
  const closingCost = assets.reduce((sum, asset) => sum + Number(asset.acquisition_cost || 0), 0);
  const closingDepreciation = assets.reduce((sum, asset) => sum + Number(asset.accumulated_depreciation || 0), 0);
  return <div className="grid md:grid-cols-2 gap-3">
    <StatCard label="رصيد التكلفة الختامي" value={money(closingCost)} />
    <StatCard label="إضافات الفترة" value={money(additions)} valueClass="text-emerald-700" />
    <StatCard label="إهلاك الفترة" value={money(depreciation)} valueClass="text-amber-700" />
    <StatCard label="مجمع الإهلاك الختامي" value={money(closingDepreciation)} />
  </div>;
}

function NbvByCategory({ assets, nbv }: { assets: Asset[]; nbv: (asset: Asset) => number }) {
  const groups = [...assets.reduce((map, asset) => {
    const key = asset.category?.name || (asset.is_cip ? "أصول تحت الإنشاء" : "غير مصنف");
    const current = map.get(key) || { count: 0, cost: 0, nbv: 0 };
    current.count += 1; current.cost += Number(asset.acquisition_cost || 0); current.nbv += nbv(asset); map.set(key, current);
    return map;
  }, new Map<string, { count: number; cost: number; nbv: number }>())];
  return <Table headers={["التصنيف", "عدد الأصول", "التكلفة", "القيمة الدفترية"]}>{groups.map(([name, values]) => <tr key={name}><td className="p-2">{name}</td><td className="p-2">{values.count}</td><td className="p-2">{money(values.cost)}</td><td className="p-2 font-semibold">{money(values.nbv)}</td></tr>)}</Table>;
}

function Table({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return <div className="overflow-x-auto"><table className="w-full text-sm text-right"><thead className="bg-[#faf9f4] text-xs text-[#0f2a1d]/65"><tr>{headers.map((header) => <th key={header} className="p-2 whitespace-nowrap">{header}</th>)}</tr></thead><tbody className="divide-y divide-[#eceae2]">{children}</tbody></table></div>;
}

