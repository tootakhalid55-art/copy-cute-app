import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowLeftRight,
  CircleDollarSign,
  Gauge,
  History,
  RefreshCw,
  Scissors,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  Wrench,
} from "lucide-react";
import {
  Badge,
  OutlineBtn,
  PageHeader,
  PrimaryBtn,
  Shell,
  StatCard,
  money,
} from "@/components/haseem/Shell";
import { getAsset } from "@/lib/assets/registry.functions";
import {
  disposeAsset,
  getAssetHealth,
  getAssetTimeline,
  impairAsset,
  improveAsset,
  reactivateAsset,
  refreshAssetHealth,
  retireAsset,
  reverseAssetImpairment,
  revalueAsset,
  splitAsset,
  transferAsset,
} from "@/lib/assets/lifecycle.functions";

export const Route = createFileRoute("/assets/$id")({
  head: () => ({ meta: [{ title: "دورة حياة الأصل — كنار المحاسبية" }] }),
  component: AssetLifecyclePage,
});

type Asset = {
  id: string;
  code: string;
  name: string;
  status: string;
  acquisition_cost: number;
  accumulated_depreciation: number;
  revaluation_surplus: number;
  impairment_loss: number;
  useful_life_months: number | null;
  acquisition_date: string | null;
  in_service_date: string | null;
  branch_id: string | null;
  cost_center_id: string | null;
  custodian_name: string | null;
  location_text: string | null;
  currency: string;
};

type TimelineRow = {
  event_id: string | null;
  event_date: string;
  event_kind: string;
  title: string;
  amount: number;
  journal_id: string | null;
  payload: Record<string, unknown>;
};

type Health = {
  score: number;
  tier: "excellent" | "good" | "aging" | "replace_soon";
  components: Record<string, number>;
  metrics: Record<string, number>;
};

type ActionKind =
  | "revalue"
  | "impair"
  | "reverse_impairment"
  | "improve"
  | "dispose"
  | "transfer"
  | "retire"
  | "reactivate";

const EVENT_LABELS: Record<string, string> = {
  acquisition: "اقتناء الأصل",
  capitalization: "رسملة",
  depreciation: "إهلاك",
  improvement_capital: "تحسين رأسمالي",
  improvement_expense: "تحسين مصروفي",
  transfer: "نقل الأصل",
  revaluation_up: "إعادة تقييم بالزيادة",
  revaluation_down: "إعادة تقييم بالنقص",
  impairment: "اضمحلال",
  impairment_reversal: "عكس اضمحلال",
  partial_disposal: "استبعاد جزئي",
  full_disposal: "استبعاد كامل",
  sale: "بيع",
  split: "تقسيم",
  merge: "دمج",
  write_off: "شطب",
  retirement: "إحالة",
  reactivation: "إعادة تنشيط",
};

const HEALTH_LABELS = {
  excellent: { label: "ممتاز", color: "bg-emerald-500", text: "text-emerald-700" },
  good: { label: "جيد", color: "bg-yellow-400", text: "text-yellow-700" },
  aging: { label: "متقادم", color: "bg-orange-500", text: "text-orange-700" },
  replace_soon: { label: "يُنصح باستبداله", color: "bg-red-500", text: "text-red-700" },
};

function AssetLifecyclePage() {
  const { id } = Route.useParams();
  const getAssetFn = useServerFn(getAsset);
  const timelineFn = useServerFn(getAssetTimeline);
  const healthFn = useServerFn(getAssetHealth);
  const refreshHealthFn = useServerFn(refreshAssetHealth);
  const revalueFn = useServerFn(revalueAsset);
  const impairFn = useServerFn(impairAsset);
  const reverseImpairFn = useServerFn(reverseAssetImpairment);
  const improveFn = useServerFn(improveAsset);
  const disposeFn = useServerFn(disposeAsset);
  const transferFn = useServerFn(transferAsset);
  const retireFn = useServerFn(retireAsset);
  const reactivateFn = useServerFn(reactivateAsset);
  const splitFn = useServerFn(splitAsset);

  const [asset, setAsset] = useState<Asset | null>(null);
  const [timeline, setTimeline] = useState<TimelineRow[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<ActionKind | null>(null);
  const [showSplit, setShowSplit] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [assetRow, events, healthResult] = await Promise.all([
        getAssetFn({ data: { id } }) as Promise<Asset | null>,
        timelineFn({ data: { assetId: id } }) as Promise<TimelineRow[]>,
        healthFn({ data: { assetId: id } }) as Promise<Health>,
      ]);
      setAsset(assetRow);
      setTimeline(events);
      setHealth(healthResult);
    } finally {
      setLoading(false);
    }
  }, [getAssetFn, healthFn, id, timelineFn]);

  useEffect(() => {
    load();
  }, [load]);

  const nbv = useMemo(() => {
    if (!asset) return 0;
    return (
      Number(asset.acquisition_cost || 0) +
      Number(asset.revaluation_surplus || 0) -
      Number(asset.accumulated_depreciation || 0) -
      Number(asset.impairment_loss || 0)
    );
  }, [asset]);

  const runAction = async (kind: ActionKind, values: Record<string, string | number>) => {
    const date = String(values.date);
    const notes = String(values.notes || "");
    if (kind === "revalue")
      await revalueFn({ data: { assetId: id, newFairValue: Number(values.amount), date, notes } });
    if (kind === "impair")
      await impairFn({ data: { assetId: id, recoverableAmount: Number(values.amount), date, reason: notes } });
    if (kind === "reverse_impairment")
      await reverseImpairFn({
        data: {
          assetId: id,
          recoverableAmount: Number(values.amount),
          date,
          reason: notes,
          idempotencyKey: crypto.randomUUID(),
        },
      });
    if (kind === "improve")
      await improveFn({
        data: {
          assetId: id,
          amount: Number(values.amount),
          extendLifeMonths: Number(values.months || 0),
          date,
          notes,
        },
      });
    if (kind === "dispose")
      await disposeFn({
        data: {
          assetId: id,
          method: String(values.method) as "sale" | "scrap" | "donation",
          proceeds: Number(values.amount || 0),
          date,
          notes,
        },
      });
    if (kind === "transfer")
      await transferFn({
        data: {
          assetId: id,
          toBranch: String(values.branch || "") || undefined,
          toCostCenter: String(values.costCenter || "") || undefined,
          custodianName: String(values.custodian || "") || undefined,
          location: String(values.location || "") || undefined,
          date,
          notes,
        },
      });
    if (kind === "retire") await retireFn({ data: { assetId: id, date, notes } });
    if (kind === "reactivate") await reactivateFn({ data: { assetId: id, date, notes } });
    setAction(null);
    await load();
  };

  if (loading) {
    return <Shell><div className="p-10 text-center text-sm">جاري تحميل دورة حياة الأصل…</div></Shell>;
  }
  if (!asset) {
    return <Shell><div className="p-10 text-center">الأصل غير موجود.</div></Shell>;
  }

  const healthMeta = HEALTH_LABELS[health?.tier || "good"];

  return (
    <Shell>
      <PageHeader
        title={`${asset.name} — ${asset.code}`}
        subtitle="محرك دورة حياة الأصل: الأحداث، التقييم، الاضمحلال، النقل والاستبعاد."
        action={<Link to="/assets"><OutlineBtn>العودة إلى سجل الأصول</OutlineBtn></Link>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="التكلفة" value={money(asset.acquisition_cost)} />
        <StatCard label="مجمع الإهلاك" value={money(asset.accumulated_depreciation)} valueClass="text-amber-700" />
        <StatCard label="الاضمحلال" value={money(asset.impairment_loss)} valueClass="text-red-700" />
        <StatCard label="القيمة الدفترية" value={money(nbv)} valueClass="text-emerald-700" />
      </div>

      <div className="grid lg:grid-cols-[1fr_1.4fr] gap-4">
        <div className="space-y-4">
          <section className="rounded-xl border border-[#eceae2] bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 font-semibold"><Gauge className="w-4 h-4" /> Asset Health Score</div>
                <p className="text-xs text-[#0f2a1d]/55 mt-1">درجة تفسيرية مبنية على العمر والقيمة والأعطال والصيانة والاستخدام.</p>
              </div>
              <button
                onClick={async () => {
                  const result = await refreshHealthFn({ data: { assetId: id } }) as Health;
                  setHealth(result);
                }}
                className="p-2 rounded-lg border border-[#eceae2]"
                title="إعادة الحساب"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-end gap-3 mt-4">
              <div className={`text-5xl font-bold tabular-nums ${healthMeta.text}`}>{health?.score ?? "—"}</div>
              <div className="pb-1">
                <div className={`font-semibold ${healthMeta.text}`}>{healthMeta.label}</div>
                <div className="text-xs text-[#0f2a1d]/50">من 100</div>
              </div>
            </div>
            <div className="h-2 rounded-full bg-[#eceae2] mt-4 overflow-hidden">
              <div className={`h-full ${healthMeta.color}`} style={{ width: `${health?.score || 0}%` }} />
            </div>
            <div className="grid grid-cols-2 gap-2 mt-4">
              {Object.entries(health?.components || {}).map(([key, value]) => (
                <div key={key} className="rounded-lg bg-[#faf9f4] px-3 py-2">
                  <div className="text-[10px] text-[#0f2a1d]/50">{componentLabel(key)}</div>
                  <div className="font-semibold tabular-nums">{Math.round(value)}%</div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-[#eceae2] bg-white p-4">
            <h2 className="font-semibold mb-3">عمليات دورة الحياة</h2>
            <div className="grid grid-cols-2 gap-2">
              <ActionButton icon={TrendingUp} label="إعادة تقييم" onClick={() => setAction("revalue")} />
              <ActionButton icon={ShieldAlert} label="اضمحلال" onClick={() => setAction("impair")} />
              <ActionButton icon={Sparkles} label="عكس الاضمحلال" onClick={() => setAction("reverse_impairment")} />
              <ActionButton icon={Wrench} label="تحسين رأسمالي" onClick={() => setAction("improve")} />
              <ActionButton icon={ArrowLeftRight} label="نقل الأصل" onClick={() => setAction("transfer")} />
              <ActionButton icon={CircleDollarSign} label="استبعاد / بيع" onClick={() => setAction("dispose")} />
              {asset.status === "active" && (
                <ActionButton icon={Scissors} label="تقسيم الأصل" onClick={() => setShowSplit(true)} />
              )}
              {asset.status === "retired" ? (
                <ActionButton icon={Activity} label="إعادة تنشيط" onClick={() => setAction("reactivate")} />
              ) : (
                <ActionButton icon={Activity} label="إحالة" onClick={() => setAction("retire")} />
              )}
            </div>
          </section>

          <section className="rounded-xl border border-[#eceae2] bg-white p-4 text-sm">
            <h2 className="font-semibold mb-3">الوضع الحالي</h2>
            <dl className="grid grid-cols-2 gap-y-3">
              <Info label="الحالة"><Badge tone={asset.status === "active" ? "green" : "neutral"}>{asset.status}</Badge></Info>
              <Info label="تاريخ التشغيل">{asset.in_service_date || "—"}</Info>
              <Info label="العهدة">{asset.custodian_name || "—"}</Info>
              <Info label="الموقع">{asset.location_text || "—"}</Info>
            </dl>
          </section>
        </div>

        <section className="rounded-xl border border-[#eceae2] bg-white">
          <div className="p-4 border-b border-[#eceae2]">
            <div className="flex items-center gap-2 font-semibold"><History className="w-4 h-4" /> Timeline الأصل</div>
            <p className="text-xs text-[#0f2a1d]/55 mt-1">جميع الحركات المحاسبية والتشغيلية بترتيب زمني.</p>
          </div>
          <div className="p-4">
            {timeline.length === 0 ? (
              <div className="py-12 text-center text-sm text-[#0f2a1d]/50">لا توجد أحداث مسجلة بعد.</div>
            ) : (
              <div className="relative border-r border-[#d8d5ca] mr-2 space-y-5">
                {timeline.map((event, index) => (
                  <div key={event.event_id || `${event.event_kind}-${index}`} className="relative pr-6">
                    <span className="absolute -right-[5px] top-1.5 w-2.5 h-2.5 rounded-full bg-[#0f5132] ring-4 ring-white" />
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium">{EVENT_LABELS[event.event_kind] || event.title}</div>
                        <div className="text-xs text-[#0f2a1d]/50 mt-0.5">{event.event_date}</div>
                      </div>
                      {Number(event.amount) !== 0 && <div className="font-semibold tabular-nums">{money(Number(event.amount))}</div>}
                    </div>
                    {event.journal_id && <div className="text-[10px] text-[#0f2a1d]/45 mt-1">قيد: {event.journal_id}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      {action && (
        <LifecycleActionDialog
          kind={action}
          asset={asset}
          nbv={nbv}
          onClose={() => setAction(null)}
          onSubmit={(values) => runAction(action, values)}
        />
      )}
      {showSplit && (
        <SplitWizard
          asset={asset}
          nbv={nbv}
          onClose={() => setShowSplit(false)}
          onSubmit={async (data) => {
            await splitFn({
              data: {
                assetId: asset.id,
                ...data,
                idempotencyKey: crypto.randomUUID(),
              },
            });
            setShowSplit(false);
            await load();
          }}
        />
      )}
    </Shell>
  );
}

function ActionButton({ icon: Icon, label, onClick }: { icon: typeof Activity; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-2 rounded-lg border border-[#eceae2] px-3 py-2 text-sm hover:bg-[#faf9f4]">
      <Icon className="w-4 h-4 text-[#0f5132]" /> {label}
    </button>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><dt className="text-xs text-[#0f2a1d]/50">{label}</dt><dd className="mt-1">{children}</dd></div>;
}

function componentLabel(key: string) {
  return {
    age: "العمر المتبقي",
    book_value: "القيمة الدفترية",
    failures: "الأعطال",
    maintenance: "تكلفة الصيانة",
    utilization: "الاستخدام",
  }[key] || key;
}

function LifecycleActionDialog({
  kind,
  asset,
  nbv,
  onClose,
  onSubmit,
}: {
  kind: ActionKind;
  asset: Asset;
  nbv: number;
  onClose: () => void;
  onSubmit: (values: Record<string, string | number>) => Promise<void>;
}) {
  const [values, setValues] = useState<Record<string, string | number>>({
    date: new Date().toISOString().slice(0, 10),
    amount: kind === "revalue" || kind === "impair" || kind === "reverse_impairment" ? nbv : 0,
    method: "sale",
    months: 0,
    notes: "",
  });
  const [busy, setBusy] = useState(false);
  const set = (key: string, value: string | number) => setValues((current) => ({ ...current, [key]: value }));
  const title = {
    revalue: "إعادة تقييم الأصل",
    impair: "اختبار وتسجيل الاضمحلال",
    reverse_impairment: "عكس الاضمحلال",
    improve: "تحسين رأسمالي",
    dispose: "معالج استبعاد الأصل",
    transfer: "معالج نقل الأصل",
    retire: "إحالة الأصل",
    reactivate: "إعادة تنشيط الأصل",
  }[kind];

  const disposalProceeds = Number(values.amount || 0);
  const gainLoss = disposalProceeds - nbv;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 p-4 flex items-start justify-center overflow-y-auto">
      <form
        className="bg-white rounded-xl shadow-xl w-full max-w-xl mt-10"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          try {
            await onSubmit(values);
          } catch (error) {
            alert(error instanceof Error ? error.message : "تعذر تنفيذ العملية");
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="p-4 border-b border-[#eceae2] flex items-center justify-between">
          <div><div className="font-semibold">{title}</div><div className="text-xs text-[#0f2a1d]/50">{asset.code} — {asset.name}</div></div>
          <button type="button" onClick={onClose}>إغلاق</button>
        </div>
        <div className="p-4 grid grid-cols-2 gap-3">
          <Field label="تاريخ الحدث"><input className="life-input" type="date" value={values.date} onChange={(e) => set("date", e.target.value)} required /></Field>
          {(kind === "revalue" || kind === "impair" || kind === "reverse_impairment") && (
            <Field label={kind === "revalue" ? "القيمة العادلة الجديدة" : "القيمة القابلة للاسترداد"}>
              <input className="life-input" type="number" step="0.01" value={values.amount} onChange={(e) => set("amount", Number(e.target.value))} required />
            </Field>
          )}
          {kind === "improve" && (
            <>
              <Field label="قيمة التحسين"><input className="life-input" type="number" step="0.01" value={values.amount} onChange={(e) => set("amount", Number(e.target.value))} required /></Field>
              <Field label="تمديد العمر (شهر)"><input className="life-input" type="number" value={values.months} onChange={(e) => set("months", Number(e.target.value))} /></Field>
            </>
          )}
          {kind === "dispose" && (
            <>
              <Field label="نوع الاستبعاد">
                <select className="life-input" value={values.method} onChange={(e) => set("method", e.target.value)}>
                  <option value="sale">بيع</option>
                  <option value="scrap">شطب / إتلاف</option>
                  <option value="donation">تبرع / إحالة</option>
                </select>
              </Field>
              <Field label="متحصلات البيع"><input className="life-input" type="number" step="0.01" value={values.amount} onChange={(e) => set("amount", Number(e.target.value))} /></Field>
              <div className="col-span-2 grid grid-cols-2 gap-2 rounded-lg bg-[#faf9f4] p-3 text-sm">
                <Info label="القيمة الدفترية">{money(nbv)}</Info>
                <Info label={gainLoss >= 0 ? "ربح متوقع" : "خسارة متوقعة"}>
                  <span className={gainLoss >= 0 ? "text-emerald-700" : "text-red-700"}>{money(Math.abs(gainLoss))}</span>
                </Info>
              </div>
            </>
          )}
          {kind === "transfer" && (
            <>
              <Field label="معرّف الفرع"><input className="life-input" value={values.branch || ""} onChange={(e) => set("branch", e.target.value)} /></Field>
              <Field label="معرّف مركز التكلفة"><input className="life-input" value={values.costCenter || ""} onChange={(e) => set("costCenter", e.target.value)} /></Field>
              <Field label="العهدة الجديدة"><input className="life-input" value={values.custodian || ""} onChange={(e) => set("custodian", e.target.value)} /></Field>
              <Field label="الموقع الجديد"><input className="life-input" value={values.location || ""} onChange={(e) => set("location", e.target.value)} /></Field>
            </>
          )}
          <Field label="السبب / الملاحظات" className="col-span-2">
            <textarea className="life-input min-h-20" value={values.notes} onChange={(e) => set("notes", e.target.value)} />
          </Field>
        </div>
        <div className="p-4 border-t border-[#eceae2] flex justify-end gap-2">
          <OutlineBtn type="button" onClick={onClose}>إلغاء</OutlineBtn>
          <PrimaryBtn type="submit" disabled={busy}>{busy ? "جاري الترحيل…" : "معاينة وترحيل"}</PrimaryBtn>
        </div>
        <style>{`.life-input{width:100%;border:1px solid #eceae2;border-radius:8px;padding:8px 10px;background:#fff;font-size:13px}`}</style>
      </form>
    </div>
  );
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return <label className={`flex flex-col gap-1 text-xs text-[#0f2a1d]/65 ${className}`}><span>{label}</span>{children}</label>;
}

type SplitPart = { name: string; code: string; pct: number };

function SplitWizard({
  asset,
  nbv,
  onClose,
  onSubmit,
}: {
  asset: Asset;
  nbv: number;
  onClose: () => void;
  onSubmit: (data: { splits: Array<{ name: string; code?: string; pct: number }>; date: string; notes?: string }) => Promise<void>;
}) {
  const [parts, setParts] = useState<SplitPart[]>([
    { name: "المكوّن 1", code: `${asset.code}-01`, pct: 50 },
    { name: "المكوّن 2", code: `${asset.code}-02`, pct: 50 },
  ]);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const total = parts.reduce((sum, part) => sum + Number(part.pct || 0), 0);
  const valid = parts.length >= 2 && parts.every((part) => part.name.trim() && part.pct > 0) && Math.abs(total - 100) < 0.001;
  const update = (index: number, key: keyof SplitPart, value: string | number) =>
    setParts((current) => current.map((part, i) => i === index ? { ...part, [key]: value } : part));

  return (
    <div className="fixed inset-0 z-50 bg-black/40 p-4 flex items-start justify-center overflow-y-auto">
      <form
        className="bg-white rounded-xl shadow-xl w-full max-w-3xl mt-8"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!valid) return;
          setBusy(true);
          try {
            await onSubmit({
              splits: parts.map((part) => ({ name: part.name.trim(), code: part.code.trim() || undefined, pct: Number(part.pct) })),
              date,
              notes: notes.trim() || undefined,
            });
          } catch (error) {
            alert(error instanceof Error ? error.message : "تعذر تقسيم الأصل");
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="p-4 border-b border-[#eceae2] flex items-center justify-between">
          <div>
            <div className="font-semibold">معالج تقسيم الأصل</div>
            <div className="text-xs text-[#0f2a1d]/50">{asset.code} — {asset.name}</div>
          </div>
          <button type="button" onClick={onClose}>إغلاق</button>
        </div>
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-3 gap-2 rounded-lg bg-[#faf9f4] p-3 text-sm">
            <Info label="التكلفة">{money(asset.acquisition_cost)}</Info>
            <Info label="مجمع الإهلاك">{money(asset.accumulated_depreciation)}</Info>
            <Info label="القيمة الدفترية">{money(nbv)}</Info>
          </div>
          <div className="grid grid-cols-[1fr_1fr_100px_88px] gap-2 text-xs text-[#0f2a1d]/55 px-1">
            <span>اسم الأصل الناتج</span><span>الكود</span><span>النسبة</span><span />
          </div>
          {parts.map((part, index) => (
            <div key={index} className="grid grid-cols-[1fr_1fr_100px_88px] gap-2 items-center">
              <input className="life-input" value={part.name} onChange={(e) => update(index, "name", e.target.value)} required />
              <input className="life-input" value={part.code} onChange={(e) => update(index, "code", e.target.value)} />
              <input className="life-input" type="number" min="0.01" max="100" step="0.01" value={part.pct} onChange={(e) => update(index, "pct", Number(e.target.value))} required />
              <button type="button" disabled={parts.length <= 2} onClick={() => setParts((current) => current.filter((_, i) => i !== index))} className="text-xs text-red-700 disabled:opacity-30">إزالة</button>
              <div className="col-span-4 grid grid-cols-3 gap-2 rounded-lg border border-[#eceae2] px-3 py-2 text-xs">
                <span>التكلفة: {money(asset.acquisition_cost * part.pct / 100)}</span>
                <span>الإهلاك: {money(asset.accumulated_depreciation * part.pct / 100)}</span>
                <span>القيمة الدفترية: {money(nbv * part.pct / 100)}</span>
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between">
            <OutlineBtn type="button" onClick={() => setParts((current) => [...current, { name: `المكوّن ${current.length + 1}`, code: `${asset.code}-${String(current.length + 1).padStart(2, "0")}`, pct: 0 }])}>إضافة مكوّن</OutlineBtn>
            <div className={`text-sm font-semibold ${valid ? "text-emerald-700" : "text-red-700"}`}>إجمالي التوزيع: {total.toFixed(2)}%</div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="تاريخ التقسيم"><input className="life-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></Field>
            <Field label="الملاحظات"><input className="life-input" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
          </div>
          <p className="text-xs text-amber-700">بعد الترحيل سيُحال الأصل الأصلي وتُنشأ الأصول الناتجة بالقيم الموزعة. لا يمكن أن يقل عدد المكونات عن اثنين.</p>
        </div>
        <div className="p-4 border-t border-[#eceae2] flex justify-end gap-2">
          <OutlineBtn type="button" onClick={onClose}>إلغاء</OutlineBtn>
          <PrimaryBtn type="submit" disabled={busy || !valid}>{busy ? "جاري الترحيل…" : "ترحيل التقسيم"}</PrimaryBtn>
        </div>
        <style>{`.life-input{width:100%;border:1px solid #eceae2;border-radius:8px;padding:8px 10px;background:#fff;font-size:13px}`}</style>
      </form>
    </div>
  );
}

