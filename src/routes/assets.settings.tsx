import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { Shell, PageHeader, PrimaryBtn, OutlineBtn } from "@/components/haseem/Shell";
import { useOrg } from "@/lib/db/org";
import { getAssetSettings, updateAssetSettings } from "@/lib/assets/registry.functions";

export const Route = createFileRoute("/assets/settings")({
  head: () => ({ meta: [
    { title: "إعدادات الأصول الثابتة — كنار المحاسبية" },
    { name: "description", content: "حد الرسملة، اتفاقية الإهلاك، والافتراضات على مستوى المنشأة." },
    { property: "og:title", content: "إعدادات الأصول الثابتة — كنار المحاسبية" },
    { property: "og:description", content: "حد الرسملة والافتراضات." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ]}),
  component: Page,
});

function Page() {
  const { currentOrg: org } = useOrg();
  const orgId = org?.id;
  const getFn = useServerFn(getAssetSettings);
  const saveFn = useServerFn(updateAssetSettings);
  const [form, setForm] = useState<any>({
    capitalization_threshold: 5000, default_currency: "SAR",
    default_convention: "full_month", default_method: "straight_line",
    default_useful_life_months: 60,
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!orgId) return;
    getFn({ data: { orgId } }).then((r: any) => { if (r) setForm(r); });
  }, [orgId, getFn]);

  const save = async () => {
    if (!orgId) return;
    setBusy(true);
    try {
      await saveFn({ data: { ...form, orgId } });
      alert("تم الحفظ");
    } finally { setBusy(false); }
  };

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  return (
    <Shell>
      <PageHeader
        title="إعدادات الأصول الثابتة"
        subtitle="الافتراضات على مستوى المنشأة — تنعكس على أي أصل جديد ما لم تُحدَّد فئة تتجاوزها."
        action={<Link to="/assets"><OutlineBtn>سجل الأصول</OutlineBtn></Link>}
      />
      <div className="rounded-xl bg-white border border-[#eceae2] p-4 grid grid-cols-2 gap-4 max-w-2xl text-sm">
        <label className="flex flex-col gap-1 text-xs text-[#0f2a1d]/70">
          <span>حد الرسملة (ريال)</span>
          <input type="number" value={form.capitalization_threshold} onChange={(e) => set("capitalization_threshold", Number(e.target.value))}
            className="border border-[#eceae2] rounded-lg px-3 py-2 tabular-nums" />
          <span className="text-[10px] text-[#0f2a1d]/50">أي مصروف مشتريات ≥ هذا الحد يُقترح رسملته كأصل ثابت.</span>
        </label>
        <label className="flex flex-col gap-1 text-xs text-[#0f2a1d]/70">
          <span>العملة الافتراضية</span>
          <input value={form.default_currency} onChange={(e) => set("default_currency", e.target.value)}
            className="border border-[#eceae2] rounded-lg px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-[#0f2a1d]/70">
          <span>اتفاقية الإهلاك</span>
          <select value={form.default_convention} onChange={(e) => set("default_convention", e.target.value)}
            className="border border-[#eceae2] rounded-lg px-3 py-2">
            <option value="full_month">شهر كامل (Full-month)</option>
            <option value="mid_month">منتصف الشهر</option>
            <option value="daily">يومي</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-[#0f2a1d]/70">
          <span>طريقة الإهلاك الافتراضية</span>
          <select value={form.default_method} onChange={(e) => set("default_method", e.target.value)}
            className="border border-[#eceae2] rounded-lg px-3 py-2">
            <option value="straight_line">قسط ثابت</option>
            <option value="declining_balance">متناقص</option>
            <option value="double_declining">متناقص مضاعف</option>
            <option value="units_of_production">وحدات إنتاج</option>
            <option value="manual">يدوي</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-[#0f2a1d]/70 col-span-2">
          <span>العمر الإنتاجي الافتراضي (شهور)</span>
          <input type="number" value={form.default_useful_life_months}
            onChange={(e) => set("default_useful_life_months", Number(e.target.value))}
            className="border border-[#eceae2] rounded-lg px-3 py-2 tabular-nums" />
        </label>
        <div className="col-span-2 flex justify-end">
          <PrimaryBtn onClick={save} disabled={busy}>
            <Save className="w-4 h-4" /> {busy ? "يحفظ…" : "حفظ الإعدادات"}
          </PrimaryBtn>
        </div>
      </div>
    </Shell>
  );
}

