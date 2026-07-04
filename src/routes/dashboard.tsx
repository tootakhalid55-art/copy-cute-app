import { createFileRoute } from "@tanstack/react-router";
import { Shell, EmptyState, PrimaryBtn, OutlineBtn } from "@/components/haseem/Shell";
import { Plus, TrendingUp, FileText, Receipt } from "lucide-react";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "لوحة المعلومات — حسيم" }] }),
  component: DashboardPage,
});

function DashboardPage() {
  return (
    <Shell>
      <section className="rounded-xl bg-[#eaf5ee] border border-[#cfe6d7] p-6">
        <div className="text-right">
          <h1 className="text-2xl font-bold">هلا، <span className="text-[#0f2a1d]">HISHAM</span></h1>
          <p className="text-sm text-[#0f2a1d]/70 mt-1">لوحة مؤشرات مباشرة من بياناتك المالية</p>
          <p className="text-xs text-[#0f2a1d]/60 mt-3">السبت، ١٩ محرم ١٤٤٨ هـ</p>
        </div>
        <div className="flex flex-wrap gap-2 mt-4 justify-start">
          {["دفاترك متوازنة حالياً","التزامات أوامر الشراء: ٠","فواتير المشتريات المستحقة: ٠","فواتير المبيعات المستحقة: ٠"].map((t) => (
            <span key={t} className="text-xs bg-white/70 border border-[#cfe6d7] rounded-full px-3 py-1.5">{t}</span>
          ))}
        </div>
      </section>

      <section className="rounded-xl bg-[#fdfcf4] border border-dashed border-[#d9d3b8] p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold flex items-center gap-2"><TrendingUp className="w-4 h-4" /> ابدأ لوحة المتابعة بثلاث خطوات بسيطة</h2>
            <p className="text-xs text-[#0f2a1d]/60 mt-1">لا توجد بيانات كافية بعد، لذا نعرض شكل اللوحة المتوقّع فور بدء الاستخدام.</p>
          </div>
          <div className="w-24 h-24 border-2 border-dashed border-[#d9d3b8] rounded-lg flex flex-col items-center justify-center text-[#0f2a1d]/50 text-[11px]">
            <Plus className="w-5 h-5 mb-1" />رفع الشعار
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            { t:"النقد", v:"0", d:"سيظهر النقد الفعلي من حساباتك البنكية والصندوق." },
            { t:"المبالغ المستحقة", v:"0", d:"ستعرف فوراً كم لك على العملاء وما المتأخر." },
            { t:"صافي الربح هذا الشهر", v:"0", d:"الربح" },
          ].map((k) => (
            <div key={k.t} className="bg-white border border-[#eceae2] rounded-lg p-4">
              <div className="text-xs text-[#0f2a1d]/60">{k.t}</div>
              <div className="text-2xl font-bold mt-1">{k.v} <span className="text-sm font-normal">﷼</span></div>
              <div className="text-[11px] text-[#0f2a1d]/50 mt-2">{k.d}</div>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <PrimaryBtn className="w-full justify-center py-3"><Plus className="w-4 h-4" /> أنشئ أول فاتورة</PrimaryBtn>
          <OutlineBtn className="w-full justify-center py-3"><Receipt className="w-4 h-4" /> سجّل أول فاتورة شراء</OutlineBtn>
          <OutlineBtn className="w-full justify-center py-3"><FileText className="w-4 h-4" /> سجّل أول حركة نقدية</OutlineBtn>
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="اتجاه الحركة النقدية" subtitle="تطور صافي الحركة النقدية خلال الفترة" action="عرض">
          <div className="h-40 flex items-center justify-center text-xs text-[#0f2a1d]/50 border border-dashed border-[#eceae2] rounded-lg">لا توجد بيانات كافية لعرض الرسم البياني بعد.</div>
        </Card>
        <Card title="تغطية السيولة" subtitle="قدرة النقد الحالي على تغطية الالتزامات">
          <div className="text-center py-4">
            <div className="text-4xl font-bold">100%</div>
            <div className="text-xs text-[#0f2a1d]/60 mt-1">نسبة التغطية</div>
            <div className="h-2 bg-[#eceae2] rounded-full mt-4 overflow-hidden"><div className="h-full w-full bg-[#0f2a1d]" /></div>
            <div className="flex justify-between text-xs mt-3 text-[#0f2a1d]/70"><span>النقد: 0 ﷼</span><span>إجمالي الالتزامات: 0 ﷼</span></div>
          </div>
        </Card>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="مزيج الالتزامات والمستحقات" subtitle="توزيع فوري بين ما لك، ما عليك، والالتزامات القادمة">
          <div className="h-32 flex items-center justify-center text-xs text-[#0f2a1d]/50 border border-dashed border-[#eceae2] rounded-lg">لا توجد بيانات كافية.</div>
        </Card>
        <Card title="تقادم المستحقات" subtitle="يعرض أين تتأخر المدفوعات عبر شرائح زمنية">
          <div className="h-32 flex items-end gap-2 pt-4">
            {["حالي","1 - 30 يوم","31 - 60 يوم","أكثر من 60 يوم"].map((label, i) => (
              <div key={label} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full bg-[#f2f0e8] rounded-t" style={{ height: `${20 + i * 8}%` }} />
                <span className="text-[10px] text-[#0f2a1d]/60">{label}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card title="النقد الداخل مقابل الخارج" subtitle="ملخص حركات المقبوضات والمدفوعات">
          <div className="space-y-3 mt-2">
            <div className="flex items-center justify-between"><span className="text-sm text-[#0f2a1d]/80">نقد داخل</span><span className="text-sm font-semibold">0 ﷼</span></div>
            <div className="flex items-center justify-between"><span className="text-sm text-[#0f2a1d]/80">نقد خارج</span><span className="text-sm font-semibold text-[#c65b3c]">0 ﷼</span></div>
          </div>
        </Card>
      </section>

      <section className="rounded-xl bg-white border border-[#eceae2] p-6">
        <div className="flex items-center justify-between">
          <div><h3 className="font-semibold">النشاط الأخير</h3><p className="text-xs text-[#0f2a1d]/60 mt-0.5">آخر الحركات المالية</p></div>
          <button className="text-xs border border-[#eceae2] rounded-lg px-3 py-1.5">عرض الكل</button>
        </div>
        <div className="mt-4 border border-dashed border-[#eceae2] rounded-lg py-8 text-center text-xs text-[#0f2a1d]/50">لا توجد حركات بعد. عند إنشاء فواتير أو تسجيل مدفوعات ستظهر هنا.</div>
      </section>
    </Shell>
  );
}

function Card({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-white border border-[#eceae2] p-5">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-sm">{title}</h3>
          {subtitle && <p className="text-xs text-[#0f2a1d]/60 mt-0.5">{subtitle}</p>}
        </div>
        {action && <button className="text-xs border border-[#eceae2] rounded-lg px-3 py-1">{action}</button>}
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}
