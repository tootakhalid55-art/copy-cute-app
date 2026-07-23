import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  Home, DollarSign, Package, ShoppingCart, Wallet, LayoutGrid,
  TrendingUp, Calculator, Settings, Plus, ChevronDown, Building2,
  Globe, MessageCircle, PanelRight, LogOut, User as UserIcon,
  Building, Users, ShieldCheck, UserCog, Receipt, FileText, Plug, CreditCard,
  Repeat, FileMinus, BookOpen, BookText, ScrollText, PieChart, BarChart3,
  ClipboardList, ArrowLeftRight, Coins, Hash, History, Download, ScanLine,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/haseem/auth";
import { useOrg } from "@/lib/db/org";
import { useKV } from "@/lib/haseem/store";
import { GlobalSearch } from "./GlobalSearch";

type NavChild = { label: string; to: string; icon?: LucideIcon };
type NavItem = {
  icon: LucideIcon;
  label: string;
  to?: string;
  children?: NavChild[];
};

const NAV: NavItem[] = [
  {
    icon: Home, label: "لوحة المعلومات",
    children: [
      { label: "نظرة عامة", to: "/dashboard" },
      { label: "الأرباح والخسائر", to: "/dashboard/profit-and-loss" },
      { label: "التدفق النقدي", to: "/dashboard/cash-flow" },
    ],
  },
  {
    icon: DollarSign, label: "المبيعات",
    children: [
      { label: "عروض الأسعار", to: "/sales/quotations" },
      { label: "فواتير المبيعات", to: "/sales/invoices" },
      { label: "الفواتير المتكررة", to: "/sales/recurring", icon: Repeat },
      { label: "الإشعارات الدائنة", to: "/sales/credit-notes" },
      { label: "كشوف حساب العملاء", to: "/sales/statements", icon: ScrollText },
      { label: "العملاء", to: "/sales/customers" },
    ],
  },
  {
    icon: Package, label: "المنتجات والخدمات",
    children: [
      { label: "الاصناف", to: "/inventory/items" },
      { label: "المستودعات", to: "/inventory/warehouses" },
      { label: "تسويات المخزون", to: "/inventory/adjustments" },
      { label: "تقارير المخزون", to: "/inventory/reports" },
    ],
  },
  {
    icon: ShoppingCart, label: "المشتريات والمصروفات",
    children: [
      { label: "فواتير المشتريات", to: "/purchases/bills" },
      { label: "مسح الفواتير بالذكاء الاصطناعي", to: "/purchases/scan", icon: ScanLine },
      { label: "صندوق المستندات الواردة", to: "/purchases/inbox" },
      { label: "مراجعة فواتير AI", to: "/purchases/ap-review" },
     { label: "لوحة معالجة الفواتير", to: "/purchases/ap-dashboard" },
     { label: "سجل مساعد الذكاء", to: "/purchases/ap-copilot" },
      { label: "أوامر الشراء", to: "/purchases/purchase-orders" },
      { label: "الإشعارات المدينة", to: "/purchases/debit-notes", icon: FileMinus },
      { label: "الموردون", to: "/purchases/suppliers" },
      { label: "المصروفات", to: "/expenses" },
    ],
  },
  {
    icon: Wallet, label: "النقد والبنوك",
    children: [
      { label: "البنوك والخزائن", to: "/cash/banks" },
      { label: "التحويلات", to: "/cash/transfers" },
      { label: "المعاملات", to: "/cash/transactions" },
      { label: "التسويات البنكية", to: "/cash/reconciliation", icon: ArrowLeftRight },
      { label: "سندات القبض", to: "/cash/receipts" },
      { label: "سندات الصرف", to: "/cash/payments" },
    ],
  },
  { icon: LayoutGrid, label: "المشاريع", to: "/projects" },
  {
    icon: Calculator, label: "المحاسبة",
    children: [
      { label: "نظرة عامة", to: "/accounting", icon: Calculator },
      { label: "دليل الحسابات", to: "/accounting/chart-of-accounts", icon: BookOpen },
      { label: "القيود اليومية", to: "/accounting/journal-entries", icon: BookText },
      { label: "الأستاذ العام", to: "/accounting/general-ledger", icon: ClipboardList },
    ],
  },
  {
    icon: TrendingUp, label: "التقارير",
    children: [
      { label: "قائمة الدخل", to: "/reports/profit-and-loss", icon: PieChart },
      { label: "الميزانية العمومية", to: "/reports/balance-sheet", icon: BarChart3 },
      { label: "ميزان المراجعة", to: "/reports/trial-balance", icon: ClipboardList },
      { label: "إقرار ضريبة القيمة المضافة", to: "/reports/vat-return", icon: Receipt },
      { label: "أعمار الذمم المدينة", to: "/reports/aged-receivables" },
      { label: "أعمار الذمم الدائنة", to: "/reports/aged-payables" },
      { label: "المبيعات حسب العميل", to: "/reports/sales-by-customer" },
      { label: "المبيعات حسب الصنف", to: "/reports/sales-by-item" },
      { label: "المشتريات حسب المورد", to: "/reports/purchases-by-supplier" },
      { label: "تقرير المبيعات", to: "/reports/sales-report" },
    ],
  },
  {
    icon: Settings, label: "الإعدادات",
    children: [
      { label: "إعدادات المنشأة", to: "/settings/organization", icon: Building2 },
      { label: "الفروع", to: "/settings/branches", icon: Building },
      { label: "المستخدمون", to: "/settings/users", icon: Users },
      { label: "الأدوار", to: "/settings/roles", icon: ShieldCheck },
      { label: "مناديب المبيعات", to: "/settings/sales-reps", icon: UserCog },
      { label: "الضرائب والربط", to: "/settings/taxes", icon: Receipt },
      { label: "العملات وأسعار الصرف", to: "/settings/currencies", icon: Coins },
      { label: "طرق الدفع", to: "/settings/payment-methods", icon: CreditCard },
      { label: "الترقيم التلقائي", to: "/settings/numbering", icon: Hash },
      { label: "قوالب الفواتير", to: "/settings/templates", icon: FileText },
      { label: "الاستيراد والتصدير", to: "/settings/import-export", icon: Download },
      { label: "سجل التدقيق", to: "/settings/audit-log", icon: History },
      { label: "التكاملات", to: "/settings/integrations", icon: Plug },
      { label: "الاشتراك والفوترة", to: "/settings/billing", icon: CreditCard },
    ],
  },
];

export function Shell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user, ready, logout } = useAuth();
  const navigate = useNavigate();
  const { currentOrg, orgs, ready: orgReady } = useOrg();
  const org = {
    name: currentOrg?.name ?? "بدون منشأة",
    taxNumber: currentOrg?.vat_number ?? "",
  };
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useKV<boolean>("sidebar-collapsed", false);

  useEffect(() => {
    if (ready && !user) navigate({ to: "/auth" });
  }, [ready, user, navigate]);

  useEffect(() => {
    if (ready && user && orgReady && orgs.length === 0 && pathname !== "/select-organization") {
      navigate({ to: "/select-organization" });
    }
  }, [ready, user, orgReady, orgs.length, pathname, navigate]);

  const initialOpen = NAV.reduce<Record<string, boolean>>((acc, s) => {
    if (s.children?.some((c) => pathname.startsWith(c.to))) acc[s.label] = true;
    return acc;
  }, {});
  const [open, setOpen] = useState<Record<string, boolean>>(initialOpen);

  if (!ready || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fafaf7] text-[#0f2a1d]/50 text-sm">
        جاري التحميل...
      </div>
    );
  }

  const initials = (user.name || user.email)
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("") || "U";

  return (
    <div dir="rtl" lang="ar" className="min-h-screen bg-[#fafaf7] text-[#0f2a1d] font-[Cairo,system-ui,sans-serif]">
      <div className="bg-[#f5a524] text-[#0f2a1d] text-center text-sm py-2 px-4 font-medium">
        14 يوم متبقي · <Link to="/settings/billing" className="underline mx-1">اشترك الآن</Link> وحلّ أمورك المالية تحت السيطرة.
      </div>

      <header className="flex items-center justify-between px-6 py-3 bg-white border-b border-[#eceae2] sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <Link to="/dashboard" className="w-10 h-10 rounded-lg bg-[#0f2a1d] flex items-center justify-center">
            <span className="text-[#d4f24a] font-black text-lg">ح</span>
          </Link>
          <Link to="/select-organization" className="hidden md:flex items-center gap-2 border border-[#eceae2] rounded-lg px-3 py-1.5 hover:bg-[#f7f6f0]">
            <Building2 className="w-4 h-4 text-[#0f2a1d]" />
            <div className="text-right leading-tight">
              <div className="text-sm font-semibold">{org.name}</div>
              <div className="text-[11px] text-[#0f2a1d]/60">الرقم الضريبي: {org.taxNumber}</div>
            </div>
            <ChevronDown className="w-4 h-4 text-[#0f2a1d]/60" />
          </Link>
        </div>

        <div className="flex items-center gap-2 relative">
          <GlobalSearch />
          <Link to="/sales/invoices/new">
            <button className="flex items-center gap-2 bg-[#0f2a1d] text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-[#163a29]">
              <Plus className="w-4 h-4" />
              إضافة سريعة
            </button>
          </Link>
          <button
            onClick={() => setMenuOpen((m) => !m)}
            className="w-9 h-9 rounded-full bg-[#0f2a1d] text-white text-xs font-bold flex items-center justify-center"
            aria-label="حساب المستخدم"
          >
            {initials}
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
              <div className="absolute top-full left-0 mt-1 w-56 bg-white border border-[#eceae2] rounded-lg shadow-lg z-50 py-1 text-right">
                <div className="px-3 py-2 border-b border-[#eceae2]">
                  <div className="text-sm font-semibold truncate">{user.name}</div>
                  <div className="text-[11px] text-[#0f2a1d]/60 truncate">{user.email}</div>
                </div>
                <Link to="/profile" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-[#f7f6f0]">
                  <UserIcon className="w-4 h-4" /> ملفي الشخصي
                </Link>
                <Link to="/settings/organization" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-[#f7f6f0]">
                  <Settings className="w-4 h-4" /> الإعدادات
                </Link>
                <button
                  onClick={() => {
                    logout();
                    setMenuOpen(false);
                    navigate({ to: "/auth" });
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-red-50 text-red-600 border-t border-[#eceae2]"
                >
                  <LogOut className="w-4 h-4" /> تسجيل الخروج
                </button>
              </div>
            </>
          )}
        </div>
      </header>

      <div className="flex">
        <aside
          className={`${
            sidebarCollapsed ? "w-16" : "w-64"
          } shrink-0 bg-white border-l border-[#eceae2] min-h-[calc(100vh-105px)] p-3 sticky top-[65px] self-start transition-all duration-200`}
        >
          <nav className="space-y-1">
            {NAV.map((s) => {
              const Icon = s.icon;
              const isActive = s.to ? pathname === s.to || pathname.startsWith(s.to + "/") : false;
              const anyChildActive = s.children?.some((c) => pathname === c.to || pathname.startsWith(c.to + "/"));
              const isOpen = !sidebarCollapsed && (open[s.label] ?? anyChildActive);
              const activeStyle = (isActive || anyChildActive) ? "bg-[#f2f0e8] text-[#0f2a1d] font-semibold" : "text-[#0f2a1d]/85 hover:bg-[#f7f6f0]";

              if (s.children) {
                return (
                  <div key={s.label}>
                    <button
                      onClick={() => {
                        if (sidebarCollapsed) setSidebarCollapsed(false);
                        setOpen((o) => ({ ...o, [s.label]: !isOpen }));
                      }}
                      title={sidebarCollapsed ? s.label : undefined}
                      className={`w-full flex items-center ${
                        sidebarCollapsed ? "justify-center" : "justify-between"
                      } px-3 py-2.5 rounded-lg text-sm transition-colors ${activeStyle}`}
                    >
                      <span className={`flex items-center ${sidebarCollapsed ? "" : "gap-3"}`}>
                        <Icon className="w-[18px] h-[18px]" />
                        {!sidebarCollapsed && s.label}
                      </span>
                      {!sidebarCollapsed && (
                        <ChevronDown className={`w-4 h-4 opacity-60 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                      )}
                    </button>
                    {isOpen && !sidebarCollapsed && (
                      <div className="mt-1 mr-8 space-y-0.5">
                        {s.children.map((c) => {
                          const active = pathname === c.to;
                          const CIcon = c.icon;
                          return (
                            <Link
                              key={c.to}
                              to={c.to}
                              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] transition-colors ${
                                active ? "bg-[#eaf5ee] text-[#0f2a1d] font-semibold" : "text-[#0f2a1d]/75 hover:bg-[#f7f6f0]"
                              }`}
                            >
                              {CIcon && <CIcon className="w-3.5 h-3.5 opacity-70" />}
                              {c.label}
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              }
              return (
                <Link
                  key={s.label}
                  to={s.to!}
                  title={sidebarCollapsed ? s.label : undefined}
                  className={`w-full flex items-center ${
                    sidebarCollapsed ? "justify-center" : "justify-between"
                  } px-3 py-2.5 rounded-lg text-sm transition-colors ${activeStyle}`}
                >
                  <span className={`flex items-center ${sidebarCollapsed ? "" : "gap-3"}`}>
                    <Icon className="w-[18px] h-[18px]" />
                    {!sidebarCollapsed && s.label}
                  </span>
                </Link>
              );
            })}
          </nav>

          {!sidebarCollapsed && (
            <div className="mt-6 flex items-center gap-2 text-xs text-[#0f2a1d]/60 px-3">
              <Globe className="w-4 h-4" />
              العربية
            </div>
          )}
        </aside>

        <main className="flex-1 p-6 space-y-5 min-w-0">{children}</main>
      </div>

      <button className="fixed bottom-5 left-5 w-12 h-12 rounded-full bg-[#25D366] text-white flex items-center justify-center shadow-lg" aria-label="whatsapp">
        <MessageCircle className="w-6 h-6" />
      </button>
      <button
        onClick={() => setSidebarCollapsed((c) => !c)}
        className="fixed bottom-5 right-5 w-11 h-11 rounded-lg bg-white border border-[#eceae2] flex items-center justify-center shadow hover:bg-[#f7f6f0]"
        aria-label={sidebarCollapsed ? "إظهار القائمة الجانبية" : "إخفاء القائمة الجانبية"}
        title={sidebarCollapsed ? "إظهار القائمة الجانبية" : "إخفاء القائمة الجانبية"}
      >
        <PanelRight className={`w-5 h-5 text-[#0f2a1d] transition-transform ${sidebarCollapsed ? "rotate-180" : ""}`} />
      </button>
    </div>
  );
}

export function PageHeader({
  title, subtitle, action,
}: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <div className="text-right">
        <h1 className="text-xl font-bold">{title}</h1>
        {subtitle && <p className="text-xs text-[#0f2a1d]/60 mt-1">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function PrimaryBtn({ children, className = "", ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...rest} className={`inline-flex items-center gap-2 bg-[#0f2a1d] text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-[#163a29] ${className}`}>
      {children}
    </button>
  );
}

export function OutlineBtn({ children, className = "", ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...rest} className={`inline-flex items-center gap-2 bg-white border border-[#eceae2] text-[#0f2a1d] rounded-lg px-4 py-2 text-sm hover:bg-[#f7f6f0] ${className}`}>
      {children}
    </button>
  );
}

export function EmptyState({ icon: Icon, title, description, action }: { icon?: typeof Home; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="rounded-xl bg-white border border-[#eceae2] py-16 flex flex-col items-center text-center px-6">
      {Icon && (
        <div className="w-12 h-12 rounded-full bg-[#f2f0e8] flex items-center justify-center mb-3">
          <Icon className="w-6 h-6 text-[#0f2a1d]/70" />
        </div>
      )}
      <div className="font-semibold">{title}</div>
      {description && <p className="text-xs text-[#0f2a1d]/60 mt-1 max-w-md">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function FiltersBar({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-end gap-3">{children}</div>;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 text-xs text-[#0f2a1d]/70">
      <span>{label}</span>
      {children}
    </div>
  );
}

export function Select({ placeholder }: { placeholder: string }) {
  return (
    <select className="border border-[#eceae2] rounded-lg px-3 py-2 text-sm bg-white min-w-[160px]" defaultValue="">
      <option value="" disabled>{placeholder}</option>
    </select>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`border border-[#eceae2] rounded-lg px-3 py-2 text-sm bg-white ${props.className ?? ""}`} />;
}

export function StatCard({ label, value, valueClass = "" }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="rounded-xl bg-white border border-[#eceae2] p-4">
      <div className="text-xs text-[#0f2a1d]/60">{label}</div>
      <div className={`text-xl font-bold mt-1 ${valueClass}`}>{value} <span className="text-xs font-normal">﷼</span></div>
    </div>
  );
}

export function money(n: number) {
  return `${(n ?? 0).toLocaleString("ar-SA", { maximumFractionDigits: 2 })} ﷼`;
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "green" | "amber" | "red" | "blue" }) {
  const tones: Record<string, string> = {
    neutral: "bg-[#f2f0e8] text-[#0f2a1d]",
    green: "bg-[#eaf5ee] text-[#0f6b3a]",
    amber: "bg-[#fef3c7] text-[#92400e]",
    red: "bg-red-50 text-red-700",
    blue: "bg-blue-50 text-blue-700",
  };
  return <span className={`inline-block text-[11px] px-2 py-0.5 rounded-full ${tones[tone]}`}>{children}</span>;
}

export function statusTone(status: string): "green" | "amber" | "red" | "neutral" | "blue" {
  if (["مؤكد", "مدفوع", "مغلق", "نشط"].includes(status)) return "green";
  if (["مسودة", "قيد الانتظار", "جديد"].includes(status)) return "amber";
  if (["ملغي", "مرفوض", "متأخر"].includes(status)) return "red";
  return "neutral";
}
