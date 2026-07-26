import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Search, Package, Layers, Wrench, Settings as SettingsIcon, RefreshCw } from "lucide-react";
import {
  Shell, PageHeader, PrimaryBtn, OutlineBtn, EmptyState, StatCard, Badge, money,
} from "@/components/haseem/Shell";
import { useOrg } from "@/lib/db/org";
import {
  listAssets, deleteAsset, upsertAsset, listCategories, listCapitalizableBills, capitalizeFromBill,
} from "@/lib/assets/registry.functions";

export const Route = createFileRoute("/assets")({
  head: () => ({
    meta: [
      { title: "الأصول الثابتة — حسيم" },
      { name: "description", content: "سجل الأصول الثابتة: تسجيل، تصنيف، رسملة من الفواتير، وربط بالمحاسبة." },
      { property: "og:title", content: "الأصول الثابتة — حسيم" },
      { property: "og:description", content: "إدارة الأصول الثابتة وربطها بالمحاسبة والمشتريات." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

type AssetRow = {
  id: string; code: string; name: string; status: string; is_cip: boolean;
  category_name: string | null; group_name: string | null;
  acquisition_cost: number; accumulated_depreciation: number; net_book_value: number;
  serial_number: string | null; supplier_name: string | null;
  in_service_date: string | null; currency: string;
};

const STATUS_LABEL: Record<string, string> = {
  draft: "مسودة", cip: "تحت الإنشاء", active: "نشط",
  held_for_sale: "معد للبيع", disposed: "مُتخلَّص", retired: "مُستبعَد", written_off: "شطب",
};

function Page() {
  const { currentOrg: org } = useOrg();
  const orgId = org?.id;
  const listFn = useServerFn(listAssets);
  const catFn = useServerFn(listCategories);
  const delFn = useServerFn(deleteAsset);
  const saveFn = useServerFn(upsertAsset);
  const billsFn = useServerFn(listCapitalizableBills);
  const capFn = useServerFn(capitalizeFromBill);

  const [rows, setRows] = useState<AssetRow[]>([]);
  const [cats, setCats] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("");
  const [showForm, setShowForm] = useState(false);
  const [showCapitalize, setShowCapitalize] = useState(false);

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const [r, c] = await Promise.all([
        listFn({ data: { orgId, status: status || undefined, cip: false, search } }) as Promise<AssetRow[]>,
        catFn({ data: { orgId } }) as Promise<any[]>,
      ]);
      setRows(r);
      setCats(c.map((x) => ({ id: x.id, name: x.name })));
    } finally { setLoading(false); }
  }, [orgId, status, search, listFn, catFn]);

  useEffect(() => { load(); }, [load]);

  const stats = useMemo(() => {
    const gross = rows.reduce((s, r) => s + Number(r.acquisition_cost || 0), 0);
    const acc = rows.reduce((s, r) => s + Number(r.accumulated_depreciation || 0), 0);
    const nbv = rows.reduce((s, r) => s + Number(r.net_book_value || 0), 0);
    return { count: rows.length, gross, acc, nbv };
  }, [rows]);

  const onDelete = async (id: string) => {
    if (!confirm("حذف الأصل؟ لا يمكن التراجع.")) return;
    await delFn({ data: { id } });
    load();
  };

  return (
    <Shell>
      <PageHeader
        title="الأصول الثابتة"
        subtitle="سجل الأصول ومصنّفاتها، وإدارة الرسملة من فواتير الموردين."
        action={
          <div className="flex flex-wrap gap-2">
            <Link to="/assets/cip"><OutlineBtn><Wrench className="w-4 h-4" /> أصول تحت الإنشاء</OutlineBtn></Link>
            <Link to="/assets/categories"><OutlineBtn><Layers className="w-4 h-4" /> الفئات</OutlineBtn></Link>
            <Link to="/assets/settings"><OutlineBtn><SettingsIcon className="w-4 h-4" /> الإعدادات</OutlineBtn></Link>
            <OutlineBtn onClick={() => setShowCapitalize(true)}><Package className="w-4 h-4" /> رسملة من فاتورة</OutlineBtn>
            <PrimaryBtn onClick={() => setShowForm(true)}><Plus className="w-4 h-4" /> أصل جديد</PrimaryBtn>
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="عدد الأصول" value={stats.count.toLocaleString("ar-SA")} />
        <StatCard label="التكلفة الإجمالية" value={money(stats.gross)} />
        <StatCard label="مجمع الإهلاك" value={money(stats.acc)} valueClass="text-amber-700" />
        <StatCard label="القيمة الدفترية" value={money(stats.nbv)} valueClass="text-emerald-700" />
      </div>

      <div className="rounded-xl bg-white border border-[#eceae2]">
        <div className="p-3 flex flex-wrap items-center gap-2 border-b border-[#eceae2]">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-[#0f2a1d]/40" />
            <input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث بالاسم / الكود / الرقم التسلسلي"
              className="w-full border border-[#eceae2] rounded-lg pr-9 pl-3 py-2 text-sm"
            />
          </div>
          <select value={status} onChange={(e) => setStatus(e.target.value)}
            className="border border-[#eceae2] rounded-lg px-3 py-2 text-sm bg-white">
            <option value="">كل الحالات</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <OutlineBtn onClick={load}><RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> تحديث</OutlineBtn>
        </div>

        {loading ? (
          <div className="p-10 text-center text-sm text-[#0f2a1d]/60">جاري التحميل…</div>
        ) : rows.length === 0 ? (
          <div className="p-8">
            <EmptyState icon={Package} title="لا توجد أصول بعد"
              description="أضف أصلًا يدويًا أو ارسمل واحدًا من فاتورة مورد."
              action={<PrimaryBtn onClick={() => setShowForm(true)}><Plus className="w-4 h-4" /> أصل جديد</PrimaryBtn>} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#faf9f4] text-xs text-[#0f2a1d]/70">
                <tr className="text-right">
                  <th className="p-3">الكود</th>
                  <th className="p-3">الاسم</th>
                  <th className="p-3">الفئة</th>
                  <th className="p-3">المورد</th>
                  <th className="p-3">التكلفة</th>
                  <th className="p-3">مجمع الإهلاك</th>
                  <th className="p-3">القيمة الدفترية</th>
                  <th className="p-3">الحالة</th>
                  <th></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eceae2]">
                {rows.map((r) => (
                  <tr key={r.id} className="text-right hover:bg-[#faf9f4]">
                    <td className="p-3 font-mono text-xs">{r.code}</td>
                    <td className="p-3">
                      <Link to="/assets/$id" params={{ id: r.id }} className="font-medium text-[#0f5132] hover:underline">
                        {r.name}
                      </Link>
                      {r.serial_number && <div className="text-[10px] text-[#0f2a1d]/50 font-mono">SN: {r.serial_number}</div>}
                    </td>
                    <td className="p-3">{r.category_name || "—"}</td>
                    <td className="p-3">{r.supplier_name || "—"}</td>
                    <td className="p-3 tabular-nums">{money(r.acquisition_cost)}</td>
                    <td className="p-3 tabular-nums text-amber-700">{money(r.accumulated_depreciation)}</td>
                    <td className="p-3 tabular-nums font-semibold">{money(r.net_book_value)}</td>
                    <td className="p-3">
                      <Badge tone={r.status === "active" ? "green" : r.status === "cip" ? "amber" : r.status === "disposed" || r.status === "written_off" ? "red" : "neutral"}>
                        {STATUS_LABEL[r.status] || r.status}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <button onClick={() => onDelete(r.id)} className="text-xs text-red-700 hover:underline">حذف</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && orgId && (
        <AssetForm
          orgId={orgId}
          cats={cats}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load(); }}
          save={(payload) => saveFn({ data: { orgId, ...payload } })}
        />
      )}

      {showCapitalize && orgId && (
        <CapitalizeModal
          orgId={orgId}
          cats={cats}
          fetchBills={() => billsFn({ data: { orgId } })}
          onCapitalize={(billId, payload) => capFn({ data: { orgId, billId, payload } })}
          onClose={() => setShowCapitalize(false)}
          onDone={() => { setShowCapitalize(false); load(); }}
        />
      )}
    </Shell>
  );
}

function AssetForm({
  orgId: _orgId, cats, onClose, onSaved, save,
}: {
  orgId: string;
  cats: Array<{ id: string; name: string }>;
  onClose: () => void;
  onSaved: () => void;
  save: (p: any) => Promise<any>;
}) {
  const [form, setForm] = useState<any>({
    name: "", name_en: "", code: "",
    category_id: "", serial_number: "", manufacturer: "", model: "",
    acquisition_cost: 0, residual_value: 0, useful_life_months: 60,
    method: "straight_line", acquisition_date: new Date().toISOString().slice(0, 10),
    in_service_date: "", currency: "SAR", is_cip: false, status: "draft",
    location_text: "", custodian_name: "", notes: "",
    barcode: "", warranty_from: "", warranty_to: "",
  });
  const [busy, setBusy] = useState(false);

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) return;
    setBusy(true);
    try {
      const payload = { ...form, status: form.is_cip ? "cip" : (form.in_service_date ? "active" : "draft") };
      await save(payload);
      onSaved();
    } catch (err: any) {
      alert("تعذر الحفظ: " + (err?.message || "خطأ"));
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center overflow-y-auto p-4">
      <form onSubmit={submit} className="bg-white rounded-xl w-full max-w-2xl mt-8 shadow-lg">
        <div className="px-4 py-3 border-b border-[#eceae2] flex items-center justify-between">
          <div className="font-semibold">أصل ثابت جديد</div>
          <button type="button" onClick={onClose} className="text-sm text-[#0f2a1d]/60">إغلاق</button>
        </div>
        <div className="p-4 grid grid-cols-2 gap-3 text-sm">
          <FormField label="الاسم *"><input required value={form.name} onChange={(e) => set("name", e.target.value)} className="ip" /></FormField>
          <FormField label="Name (EN)"><input value={form.name_en} onChange={(e) => set("name_en", e.target.value)} className="ip" /></FormField>
          <FormField label="الكود (اختياري)"><input value={form.code} onChange={(e) => set("code", e.target.value)} className="ip" placeholder="يُولَّد تلقائيًا" /></FormField>
          <FormField label="الفئة">
            <select value={form.category_id} onChange={(e) => set("category_id", e.target.value)} className="ip">
              <option value="">—</option>
              {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </FormField>
          <FormField label="الرقم التسلسلي"><input value={form.serial_number} onChange={(e) => set("serial_number", e.target.value)} className="ip" /></FormField>
          <FormField label="الباركود / QR"><input value={form.barcode} onChange={(e) => set("barcode", e.target.value)} className="ip" /></FormField>
          <FormField label="المصنّع"><input value={form.manufacturer} onChange={(e) => set("manufacturer", e.target.value)} className="ip" /></FormField>
          <FormField label="الموديل"><input value={form.model} onChange={(e) => set("model", e.target.value)} className="ip" /></FormField>
          <FormField label="التكلفة"><input type="number" step="0.01" value={form.acquisition_cost} onChange={(e) => set("acquisition_cost", Number(e.target.value))} className="ip tabular-nums" /></FormField>
          <FormField label="القيمة المتبقية"><input type="number" step="0.01" value={form.residual_value} onChange={(e) => set("residual_value", Number(e.target.value))} className="ip tabular-nums" /></FormField>
          <FormField label="العمر الإنتاجي (شهور)"><input type="number" value={form.useful_life_months} onChange={(e) => set("useful_life_months", Number(e.target.value))} className="ip tabular-nums" /></FormField>
          <FormField label="طريقة الإهلاك">
            <select value={form.method} onChange={(e) => set("method", e.target.value)} className="ip">
              <option value="straight_line">قسط ثابت</option>
              <option value="declining_balance">متناقص</option>
              <option value="double_declining">متناقص مضاعف</option>
              <option value="units_of_production">وحدات إنتاج</option>
              <option value="manual">يدوي</option>
              <option value="none">بدون إهلاك</option>
            </select>
          </FormField>
          <FormField label="تاريخ الاقتناء"><input type="date" value={form.acquisition_date} onChange={(e) => set("acquisition_date", e.target.value)} className="ip" /></FormField>
          <FormField label="تاريخ التشغيل"><input type="date" value={form.in_service_date} onChange={(e) => set("in_service_date", e.target.value)} className="ip" /></FormField>
          <FormField label="بداية الضمان"><input type="date" value={form.warranty_from} onChange={(e) => set("warranty_from", e.target.value)} className="ip" /></FormField>
          <FormField label="نهاية الضمان"><input type="date" value={form.warranty_to} onChange={(e) => set("warranty_to", e.target.value)} className="ip" /></FormField>
          <FormField label="الموقع"><input value={form.location_text} onChange={(e) => set("location_text", e.target.value)} className="ip" /></FormField>
          <FormField label="العهدة (اسم)"><input value={form.custodian_name} onChange={(e) => set("custodian_name", e.target.value)} className="ip" /></FormField>
          <label className="col-span-2 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.is_cip} onChange={(e) => set("is_cip", e.target.checked)} />
            <span>أصل تحت الإنشاء (CIP) — لا يخضع للإهلاك حتى التشغيل</span>
          </label>
          <FormField label="ملاحظات" className="col-span-2">
            <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} className="ip min-h-[70px]" />
          </FormField>
        </div>
        <div className="px-4 py-3 border-t border-[#eceae2] flex justify-end gap-2 bg-[#faf9f4]">
          <OutlineBtn type="button" onClick={onClose}>إلغاء</OutlineBtn>
          <PrimaryBtn type="submit" disabled={busy}>{busy ? "يحفظ…" : "حفظ"}</PrimaryBtn>
        </div>
        <style>{`.ip{border:1px solid #eceae2;border-radius:8px;padding:6px 10px;font-size:13px;background:white;width:100%}`}</style>
      </form>
    </div>
  );
}

function FormField({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`flex flex-col gap-1 text-xs text-[#0f2a1d]/70 ${className}`}>
      <span>{label}</span>{children}
    </label>
  );
}

function CapitalizeModal({
  cats, fetchBills, onCapitalize, onClose, onDone,
}: {
  orgId: string;
  cats: Array<{ id: string; name: string }>;
  fetchBills: () => Promise<any>;
  onCapitalize: (billId: string, payload: any) => Promise<any>;
  onClose: () => void;
  onDone: () => void;
}) {
  const [bills, setBills] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [life, setLife] = useState(60);
  const [inService, setInService] = useState<string>("");
  const [isCip, setIsCip] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { fetchBills().then((r: any[]) => setBills(r || [])); }, [fetchBills]);

  const capitalize = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await onCapitalize(selected.id, {
        name: name || `أصل من ${selected.doc_number}`,
        category_id: categoryId || null,
        useful_life_months: life,
        in_service_date: inService || null,
        is_cip: isCip,
        acquisition_cost: selected.grand_total,
      });
      onDone();
    } catch (err: any) {
      alert("تعذرت الرسملة: " + (err?.message || "خطأ"));
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center overflow-y-auto p-4">
      <div className="bg-white rounded-xl w-full max-w-3xl mt-8 shadow-lg">
        <div className="px-4 py-3 border-b border-[#eceae2] flex items-center justify-between">
          <div className="font-semibold">رسملة أصل من فاتورة مورد</div>
          <button onClick={onClose} className="text-sm text-[#0f2a1d]/60">إغلاق</button>
        </div>
        <div className="grid md:grid-cols-2 gap-0">
          <div className="border-l border-[#eceae2] max-h-[70vh] overflow-y-auto">
            <div className="p-3 text-xs text-[#0f2a1d]/60">اختر فاتورة</div>
            {bills.length === 0 && <div className="p-6 text-center text-sm text-[#0f2a1d]/60">لا توجد فواتير قابلة للرسملة</div>}
            {bills.map((b) => (
              <button
                key={b.id}
                onClick={() => { setSelected(b); setName(`أصل من ${b.doc_number}`); }}
                className={`w-full text-right px-3 py-2 border-b border-[#eceae2] hover:bg-[#faf9f4] ${selected?.id === b.id ? "bg-[#f7f6f0]" : ""}`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">{b.doc_number}</span>
                  <span className="tabular-nums text-sm">{money(b.grand_total)}</span>
                </div>
                <div className="text-[11px] text-[#0f2a1d]/60 flex items-center justify-between">
                  <span>{(b.party_snapshot as any)?.name || "—"}</span>
                  <span>{b.issue_date}</span>
                </div>
              </button>
            ))}
          </div>
          <div className="p-4 space-y-3">
            {!selected ? (
              <div className="text-sm text-[#0f2a1d]/60">اختر فاتورة من القائمة لإتمام الرسملة.</div>
            ) : (
              <>
                <FormField label="اسم الأصل"><input value={name} onChange={(e) => setName(e.target.value)} className="ip" /></FormField>
                <FormField label="الفئة">
                  <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="ip">
                    <option value="">—</option>
                    {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </FormField>
                <FormField label="العمر الإنتاجي (شهور)"><input type="number" value={life} onChange={(e) => setLife(Number(e.target.value))} className="ip tabular-nums" /></FormField>
                <FormField label="تاريخ التشغيل"><input type="date" value={inService} onChange={(e) => setInService(e.target.value)} className="ip" /></FormField>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={isCip} onChange={(e) => setIsCip(e.target.checked)} />
                  <span>أصل تحت الإنشاء (CIP)</span>
                </label>
                <div className="pt-2 flex justify-end gap-2">
                  <OutlineBtn onClick={onClose}>إلغاء</OutlineBtn>
                  <PrimaryBtn onClick={capitalize} disabled={busy}>{busy ? "…" : "رسملة"}</PrimaryBtn>
                </div>
              </>
            )}
          </div>
        </div>
        <style>{`.ip{border:1px solid #eceae2;border-radius:8px;padding:6px 10px;font-size:13px;background:white;width:100%}`}</style>
      </div>
    </div>
  );
}
