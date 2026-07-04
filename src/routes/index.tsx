import { createFileRoute } from "@tanstack/react-router";
import {
  Home, DollarSign, Package, ShoppingCart, Wallet, LayoutGrid,
  TrendingUp, Calculator, Settings, Plus, ChevronDown, Building2,
  FileText, Receipt, Globe, MessageCircle, PanelRight,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "لوحة المعلومات — حسيم" },
      { name: "description", content: "برنامج محاسبة وفوترة إلكترونية بدون تعقيد" },
    ],
  }),
  component: Dashboard,
});

const navSections = [
  { icon: Home, label: "لوحة المعلومات", active: true },
  { icon: DollarSign, label: "المبيعات", chevron: true },
  { icon: Package, label: "المنتجات والخدمات", chevron: true },
  { icon: ShoppingCart, label: "المشتريات والمصروفات", chevron: true },
  { icon: Wallet, label: "النقد والبنوك", chevron: true },
  { icon: LayoutGrid, label: "المشاريع" },
  { icon: TrendingUp, label: "التقارير", chevron: true },
  { icon: Calculator, label: "المحاسبة", chevron: true },
  { icon: Settings, label: "الإعدادات", chevron: true },
];

function Dashboard() {
  return (
    <div dir="rtl" lang="ar" className="min-h-screen bg-[#fafaf7] text-[#0f2a1d] font-[Cairo,system-ui,sans-serif]">
      {/* Trial banner */}
      <div className="bg-[#f5a524] text-[#0f2a1d] text-center text-sm py-2 px-4 font-medium">
        14 يوم متبقي · <a className="underline mx-1">اشترك الآن</a> وحلّ أمورك المالية تحت السيطرة.
      </div>

      {/* Top bar */}
      <header className="flex items-center justify-between px-6 py-3 bg-white border-b border-[#eceae2]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#0f2a1d] flex items-center justify-center">
            <span className="text-[#d4f24a] font-black text-lg">ح</span>
          </div>
          <div className="hidden md:flex items-center gap-2 border border-[#eceae2] rounded-lg px-3 py-1.5">
            <Building2 className="w-4 h-4 text-[#0f2a1d]" />
            <div className="text-right leading-tight">
              <div className="text-sm font-semibold">شركة كنار الحديثة للمقاولات</div>
              <div className="text-[11px] text-[#c65b3c] flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#f5a524]" />
                غير مرتبط بمنصة فاتورة
              </div>
            </div>
            <ChevronDown className="w-4 h-4 text-[#0f2a1d]/60" />
          </div>
        </div>

        <button className="flex items-center gap-2 bg-[#0f2a1d] text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-[#163a29] transition-colors">
          <Plus className="w-4 h-4" />
          إضافة سريعة
        </button>
      </header>

      <div className="flex">
        {/* Sidebar (right in RTL) */}
        <aside className="w-64 shrink-0 bg-white border-l border-[#eceae2] min-h-[calc(100vh-105px)] p-3">
          <nav className="space-y-1">
            {navSections.map((s) => {
              const Icon = s.icon;
              return (
                <button
                  key={s.label}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-colors ${
                    s.active ? "bg-[#f2f0e8] text-[#0f2a1d] font-semibold" : "text-[#0f2a1d]/80 hover:bg-[#f7f6f0]"
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <Icon className="w-[18px] h-[18px]" />
                    {s.label}
                  </span>
                  {s.chevron && <ChevronDown className="w-4 h-4 opacity-60" />}
                </button>
              );
            })}
          </nav>

          <div className="absolute bottom-4 flex items-center gap-2 text-xs text-[#0f2a1d]/60">
            <Globe className="w-4 h-4" />
            English
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 p-6 space-y-5">
          {/* Welcome card */}
          <section className="rounded-xl bg-[#eaf5ee] border border-[#cfe6d7] p-6">
            <div className="text-right">
              <h1 className="text-2xl font-bold">هلا، <span className="text-[#0f2a1d]">HISHAM</span></h1>
              <p className="text-sm text-[#0f2a1d]/70 mt-1">لوحة مؤشرات مباشرة من بياناتك المالية</p>
              <p className="text-xs text-[#0f2a1d]/60 mt-3">السبت، ١٩ محرم ١٤٤٨ هـ</p>
            </div>
            <div className="flex flex-wrap gap-2 mt-4 justify-start">
              {[
                "دفاترك متوازنة حالياً",
                "التزامات أوامر الشراء: ٠",
                "فواتير المشتريات المستحقة: ٠",
                "فواتير المبيعات المستحقة: ٠",
              ].map((t) => (
                <span key={t} className="text-xs bg-white/70 border border-[#cfe6d7] rounded-full px-3 py-1.5">
                  {t}
                </span>
              ))}
            </div>
          </section>

          {/* Onboarding checklist */}
          <section className="rounded-xl bg-[#fdfcf4] border border-dashed border-[#d9d3b8] p-6 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-semibold flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" /> ابدأ لوحة المتابعة بثلاث خطوات بسيطة
                </h2>
                <p className="text-xs text-[#0f2a1d]/60 mt-1">
                  لا توجد بيانات كافية بعد، لذا نعرض شكل اللوحة المتوقّع فور بدء الاستخدام.
                </p>
              </div>
              <div className="w-24 h-24 border-2 border-dashed border-[#d9d3b8] rounded-lg flex flex-col items-center justify-center text-[#0f2a1d]/50 text-[11px]">
                <Plus className="w-5 h-5 mb-1" />
                رفع الشعار
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {[
                { t: "النقد", v: "0", d: "سيظهر النقد الفعلي من حساباتك البنكية والصندوق." },
                { t: "المبالغ المستحقة", v: "0", d: "ستعرف فوراً كم لك على العملاء وما المتأخر." },
                { t: "صافي الربح هذا الشهر", v: "0", d: "الربح" },
              ].map((k) => (
                <div key={k.t} className="bg-white border border-[#eceae2] rounded-lg p-4">
                  <div className="text-xs text-[#0f2a1d]/60">{k.t}</div>
                  <div className="text-2xl font-bold mt-1">{k.v} <span className="text-sm font-normal">﷼</span></div>
                  <div className="text-[11px] text-[#0f2a1d]/50 mt-2">{k.d}</div>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <button className="w-full bg-[#0f2a1d] text-white rounded-lg py-3 text-sm font-medium flex items-center justify-center gap-2">
                <Plus className="w-4 h-4" /> أنشئ أول فاتورة
              </button>
              <button className="w-full bg-white border border-[#eceae2] rounded-lg py-3 text-sm flex items-center justify-center gap-2">
                <Receipt className="w-4 h-4" /> سجّل أول فاتورة شراء
              </button>
              <button className="w-full bg-white border border-[#eceae2] rounded-lg py-3 text-sm flex items-center justify-center gap-2">
                <FileText className="w-4 h-4" /> سجّل أول حركة نقدية
              </button>
            </div>
          </section>

          {/* Two column: cash flow + liquidity */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card
              title="اتجاه الحركة النقدية"
              subtitle="تطور صافي الحركة النقدية خلال الفترة"
              action="عرض"
            >
              <div className="h-40 flex items-center justify-center text-xs text-[#0f2a1d]/50 border border-dashed border-[#eceae2] rounded-lg">
                لا توجد بيانات كافية لعرض الرسم البياني بعد.
              </div>
            </Card>

            <Card title="تغطية السيولة" subtitle="قدرة النقد الحالي على تغطية الالتزامات">
              <div className="text-center py-4">
                <div className="text-4xl font-bold">100%</div>
                <div className="text-xs text-[#0f2a1d]/60 mt-1">نسبة التغطية</div>
                <div className="h-2 bg-[#eceae2] rounded-full mt-4 overflow-hidden">
                  <div className="h-full w-full bg-[#0f2a1d]" />
                </div>
                <div className="flex justify-between text-xs mt-3 text-[#0f2a1d]/70">
                  <span>النقد: 0 ﷼</span>
                  <span>إجمالي الالتزامات: 0 ﷼</span>
                </div>
              </div>
            </Card>
          </section>

          {/* Bottom row */}
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card title="مزيج الالتزامات والمستحقات" subtitle="توزيع فوري بين ما لك، ما عليك، والالتزامات القادمة">
              <div className="h-32 flex items-center justify-center text-xs text-[#0f2a1d]/50 border border-dashed border-[#eceae2] rounded-lg">
                لا توجد بيانات كافية لعرض الرسم البياني بعد.
              </div>
              <p className="text-[11px] text-[#0f2a1d]/60 mt-3">
                استخدمها سريعاً لمعرفة هل السيولة الداخلة تغطي المصروفات الشهرية.
              </p>
            </Card>

            <Card title="تقادم المستحقات" subtitle="يعرض أين تتأخر المدفوعات عبر شرائح زمنية">
              <div className="h-32 flex items-end gap-2 pt-4">
                {["حالي", "1 - 30 يوم", "31 - 60 يوم", "أكثر من 60 يوم"].map((label, i) => (
                  <div key={label} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full bg-[#f2f0e8] rounded-t" style={{ height: `${20 + i * 8}%` }} />
                    <span className="text-[10px] text-[#0f2a1d]/60">{label}</span>
                  </div>
                ))}
              </div>
            </Card>

            <Card title="النقد الداخل مقابل الخارج" subtitle="ملخص حركات المقبوضات والمدفوعات للفترة الحالية">
              <div className="space-y-3 mt-2">
                <Row label="نقد داخل" value="0" color="text-[#0f2a1d]" />
                <Row label="نقد خارج" value="0" color="text-[#c65b3c]" />
              </div>
              <p className="text-[11px] text-[#0f2a1d]/60 mt-4">
                إذا ارتفعت الالتزامات قبل التحصيل، راقب السيولة والتمويل قصير الأجل.
              </p>
            </Card>
          </section>

          {/* Recent activity */}
          <section className="rounded-xl bg-white border border-[#eceae2] p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold">النشاط الأخير</h3>
                <p className="text-xs text-[#0f2a1d]/60 mt-0.5">آخر الحركات المالية</p>
              </div>
              <button className="text-xs border border-[#eceae2] rounded-lg px-3 py-1.5">عرض الكل</button>
            </div>
            <div className="mt-4 border border-dashed border-[#eceae2] rounded-lg py-8 text-center text-xs text-[#0f2a1d]/50">
              لا توجد حركات بعد. عند إنشاء فواتير أو تسجيل مدفوعات ستظهر هنا.
            </div>
          </section>
        </main>
      </div>

      {/* Floating buttons */}
      <button className="fixed bottom-5 left-5 w-12 h-12 rounded-full bg-[#25D366] text-white flex items-center justify-center shadow-lg">
        <MessageCircle className="w-6 h-6" />
      </button>
      <button className="fixed bottom-5 right-5 w-11 h-11 rounded-lg bg-white border border-[#eceae2] flex items-center justify-center shadow">
        <PanelRight className="w-5 h-5 text-[#0f2a1d]" />
      </button>
    </div>
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

function Row({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-[#0f2a1d]/80">{label}</span>
      <span className={`text-sm font-semibold ${color}`}>{value} ﷼</span>
    </div>
  );
}
