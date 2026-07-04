import { createFileRoute, Link } from "@tanstack/react-router";
import { Shell, PrimaryBtn, OutlineBtn } from "@/components/haseem/Shell";
import { ChevronDown, Plus } from "lucide-react";

export const Route = createFileRoute("/purchases/bills/new")({
  head: () => ({ meta: [{ title: "إنشاء فاتورة مشتريات — حسيم" }] }),
  component: () => (
    <Shell>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold">إنشاء فاتورة مشتريات</h1>
          <p className="text-xs text-[#0f2a1d]/60 mt-1">إدارة الفواتير وتتبع المستحقات</p>
        </div>
        <div className="flex gap-2">
          <OutlineBtn>معاينة فاتورة المشتريات</OutlineBtn>
          <Link to="/purchases/bills"><OutlineBtn>إلغاء</OutlineBtn></Link>
          <PrimaryBtn>حفظ كمسودة <ChevronDown className="w-4 h-4" /></PrimaryBtn>
        </div>
      </div>

      <div className="rounded-xl bg-white border border-[#eceae2] p-5 grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
        <div className="text-right space-y-1">
          <div className="font-semibold">شركة كنار الحديثة للمقاولات العامة</div>
          <div>الفرع الرئيسي</div>
          <div>طريق الملك فهد</div>
          <div>جدة، حي مشرفة، 23336</div>
          <div>الرقم الضريبي: 312756062700003</div>
        </div>
        <div className="space-y-2">
          <Row label="رقم الفاتورة" value="BL-890721" />
          <Row label="تاريخ الإصدار" value="2026-07-04" />
          <Row label="تاريخ الاستحقاق" value="2026-07-11" />
          <Row label="رقم فاتورة المورد" value="—" />
        </div>
      </div>

      <div className="rounded-xl bg-white border border-[#eceae2] p-5">
        <div className="text-sm mb-2">المورّد</div>
        <button className="w-full border border-dashed border-[#eceae2] rounded-lg py-3 text-sm text-[#0f2a1d]/70 hover:bg-[#f7f6f0]">+ اختر موردًا</button>
      </div>

      <div className="rounded-xl bg-white border border-[#eceae2] p-5 space-y-3">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <button className="border border-[#eceae2] rounded-lg px-3 py-1.5"><Plus className="w-3.5 h-3.5 inline" /> إضافة بند</button>
            <button className="border border-[#eceae2] rounded-lg px-3 py-1.5">أعمدة البنود</button>
          </div>
          <div className="text-xs text-[#0f2a1d]/70">WH-216691 — الرئيسي</div>
        </div>
        <table className="w-full text-sm">
          <thead className="text-xs text-[#0f2a1d]/60">
            <tr className="text-right"><th className="py-2">#</th><th>الوصف</th><th>الكمية</th><th>سعر الوحدة</th><th>الضريبة</th><th>إجمالي السطر</th></tr>
          </thead>
          <tbody>
            <tr className="border-t border-[#eceae2]"><td className="py-3">1</td><td><input placeholder="الوصف" className="border border-[#eceae2] rounded px-2 py-1 w-full" /></td><td>1</td><td>0.00</td><td>0.00%</td><td>0 ﷼</td></tr>
          </tbody>
        </table>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-[#eceae2]">
          <div className="space-y-2 text-sm">
            <Row label="المجموع الفرعي" value="0 ﷼" />
            <Row label="الخصم" value="—" />
            <Row label="الضريبة" value="0 ﷼" />
            <Row label="الإجمالي" value="0 ﷼" bold />
          </div>
        </div>
      </div>
    </Shell>
  ),
});

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (<div className="flex items-center justify-between"><span className="text-[#0f2a1d]/70">{label}</span><span className={bold ? "font-bold" : ""}>{value}</span></div>);
}
