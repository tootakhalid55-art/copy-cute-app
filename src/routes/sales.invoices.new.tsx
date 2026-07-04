import { createFileRoute, Link } from "@tanstack/react-router";
import { Shell, PrimaryBtn, OutlineBtn } from "@/components/haseem/Shell";
import { ChevronDown, Pencil, Plus } from "lucide-react";

export const Route = createFileRoute("/sales/invoices/new")({
  head: () => ({ meta: [{ title: "إنشاء فاتورة مبيعات — حسيم" }] }),
  component: NewInvoice,
});

function NewInvoice() {
  return (
    <Shell>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold">إنشاء فاتورة مبيعات</h1>
          <p className="text-xs text-[#0f2a1d]/60 mt-1">إدارة الفواتير وتتبع المستحقات</p>
        </div>
        <div className="flex gap-2">
          <Link to="/sales/invoices"><OutlineBtn>رجوع</OutlineBtn></Link>
          <OutlineBtn>معاينة</OutlineBtn>
          <PrimaryBtn>حفظ كمسودة <ChevronDown className="w-4 h-4" /></PrimaryBtn>
        </div>
      </div>

      <div className="rounded-xl bg-white border border-[#eceae2] p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="text-right space-y-1 text-sm">
            <div className="flex items-center gap-2 justify-end"><Pencil className="w-3.5 h-3.5" /><span className="font-semibold">شركة كنار الحديثة للمقاولات العامة</span></div>
            <div>طريق الملك فهد</div>
            <div>جدة، حي مشرفة، 23336</div>
            <div>الرقم الضريبي: 312756062700003</div>
            <div>السجل التجاري / الرقم الموحد: 7043264105</div>
          </div>
          <div className="flex items-center justify-center">
            <div className="w-32 h-24 bg-white border border-[#eceae2] rounded flex items-center justify-center text-[#0f2a1d] font-bold">canar</div>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-[#eceae2] text-sm">
          <div className="space-y-2">
            <Row label="رقم الفاتورة" value="INV-845594" />
            <Row label="تاريخ الإصدار" value="2026-07-04" />
            <Row label="تاريخ الاستحقاق" value="2026-07-11" />
            <div className="text-xs text-[#0f2a1d]/60">حقول إضافية</div>
          </div>
        </div>
      </div>

      <div className="rounded-xl bg-white border border-[#eceae2] p-5">
        <div className="text-sm mb-2">العميل</div>
        <button className="w-full border border-dashed border-[#eceae2] rounded-lg py-3 text-sm text-[#0f2a1d]/70 hover:bg-[#f7f6f0]">+ اختر العميل</button>
      </div>

      <div className="rounded-xl bg-white border border-[#eceae2] p-5 space-y-3">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <button className="border border-[#eceae2] rounded-lg px-3 py-1.5"><Plus className="w-3.5 h-3.5 inline" /> إضافة بند</button>
            <button className="border border-[#eceae2] rounded-lg px-3 py-1.5">أعمدة البنود</button>
          </div>
          <div className="text-xs text-[#0f2a1d]/70">WH-216691 — Main</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-[#0f2a1d]/60">
              <tr className="text-right">
                <th className="py-2">#</th><th>الوصف</th><th>الكمية</th><th>سعر الوحدة</th><th>الضريبة</th><th>المبلغ</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-[#eceae2]">
                <td className="py-3">1</td>
                <td><input placeholder="الوصف" className="border border-[#eceae2] rounded px-2 py-1 w-full" /></td>
                <td>1</td><td>0.00</td><td>0.00%</td><td>0 ﷼</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-[#eceae2]">
          <div className="space-y-2 text-sm">
            <Row label="المجموع الفرعي" value="0 ﷼" />
            <Row label="إضافة خصم" value="—" />
            <Row label="الضريبة" value="0 ﷼" />
            <Row label="الإجمالي" value="0 ﷼" bold />
          </div>
          <div className="text-sm">
            <div className="text-xs text-[#0f2a1d]/60 mb-1">بيانات البنك</div>
            <button className="text-[#0f2a1d] text-sm">+ اختر الحساب البنكي</button>
          </div>
          <div className="text-center">
            <div className="w-28 h-28 mx-auto bg-[#eceae2] rounded" />
            <div className="text-xs text-[#0f2a1d]/60 mt-2">قيد الانتظار</div>
          </div>
        </div>
        <div className="text-sm text-[#0f2a1d]/70">+ ملاحظات...</div>
      </div>
    </Shell>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[#0f2a1d]/70">{label}</span>
      <span className={bold ? "font-bold" : ""}>{value}</span>
    </div>
  );
}
