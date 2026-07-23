import { ChevronDown, ChevronUp, ShieldCheck, FileText, Users, BookText, Wallet, Package, Bot } from "lucide-react";
import { useState, type ReactNode } from "react";

export type ExplainabilityCitation = {
  kind: string;
  id: string;
  label: string;
  subtitle?: string | null;
  amount?: number | null;
  href?: string | null;
};

export type ExplainabilityStep = {
  label: string;
  status?: "ok" | "warn" | "fail" | "info";
  detail?: string;
  confidence?: number | null;
};

export type ExplainabilityProps = {
  language?: "ar" | "en";
  confidence?: number | null;
  recommendation?: string | null;
  citations?: ExplainabilityCitation[];
  rules?: string[];
  steps?: ExplainabilityStep[];
  reasoning?: string | null;
  compact?: boolean;
};

const T = {
  ar: { title: "لوحة الشفافية", records: "السجلات المستند إليها", rules: "قواعد العمل المطبقة", steps: "خطوات التحقق", reasoning: "منطق القرار", confidence: "درجة الثقة", recommendation: "التوصية", show: "عرض التفاصيل", hide: "إخفاء" },
  en: { title: "Explainability", records: "Supporting records", rules: "Business rules applied", steps: "Validation steps", reasoning: "Decision reasoning", confidence: "Confidence", recommendation: "Recommendation", show: "Show details", hide: "Hide" },
};

const KIND_ICON: Record<string, any> = {
  documents: FileText, parties: Users, journal_entries: BookText,
  cash_bank_transactions: Wallet, items: Package,
};

const STATUS_STYLE: Record<string, string> = {
  ok: "bg-emerald-50 text-emerald-700 border-emerald-200",
  warn: "bg-amber-50 text-amber-700 border-amber-200",
  fail: "bg-rose-50 text-rose-700 border-rose-200",
  info: "bg-sky-50 text-sky-700 border-sky-200",
};

export function ExplainabilityPanel({
  language = "ar", confidence, recommendation,
  citations = [], rules = [], steps = [], reasoning, compact,
}: ExplainabilityProps): ReactNode {
  const t = T[language];
  const [open, setOpen] = useState(!compact);
  const dir = language === "ar" ? "rtl" : "ltr";
  const nothing = !citations.length && !rules.length && !steps.length && !reasoning;
  if (nothing && confidence == null && !recommendation) return null;

  return (
    <div dir={dir} className="rounded-lg border border-[#eceae2] bg-[#fafaf5] text-[13px]">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-[#0f2a1d]">
        <span className="inline-flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          {t.title}
          {confidence != null && (
            <span className="px-1.5 py-0.5 rounded-full bg-white border border-[#eceae2] text-[10px]">
              {t.confidence} {Math.round(confidence)}%
            </span>
          )}
          {recommendation && (
            <span className="px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] uppercase">
              {recommendation}
            </span>
          )}
        </span>
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-3">
          {steps.length > 0 && (
            <section>
              <div className="text-[11px] uppercase text-[#0f2a1d]/60 mb-1">{t.steps}</div>
              <ul className="space-y-1">
                {steps.map((s, i) => (
                  <li key={i} className={`px-2 py-1 rounded border text-xs ${STATUS_STYLE[s.status || "info"]}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{s.label}</span>
                      {s.confidence != null && <span className="text-[10px] opacity-70">{Math.round(s.confidence)}%</span>}
                    </div>
                    {s.detail && <div className="text-[11px] opacity-80 mt-0.5">{s.detail}</div>}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {rules.length > 0 && (
            <section>
              <div className="text-[11px] uppercase text-[#0f2a1d]/60 mb-1">{t.rules}</div>
              <ul className="list-disc ms-4 space-y-0.5 text-xs">
                {rules.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </section>
          )}
          {reasoning && (
            <section>
              <div className="text-[11px] uppercase text-[#0f2a1d]/60 mb-1">{t.reasoning}</div>
              <div className="text-xs whitespace-pre-wrap leading-relaxed bg-white border border-[#eceae2] rounded p-2">{reasoning}</div>
            </section>
          )}
          {citations.length > 0 && (
            <section>
              <div className="text-[11px] uppercase text-[#0f2a1d]/60 mb-1">{t.records}</div>
              <div className="space-y-1">
                {citations.map((c) => {
                  const Icon = KIND_ICON[c.kind] || Bot;
                  return (
                    <div key={c.kind + c.id}
                      className="flex items-center gap-2 px-2 py-1.5 bg-white rounded border border-[#eceae2] text-xs">
                      <Icon className="w-3.5 h-3.5 text-[#0f2a1d]/60" />
                      <div className="flex-1 min-w-0">
                        <div className="truncate font-medium">{c.label}</div>
                        {c.subtitle && <div className="truncate text-[11px] text-[#0f2a1d]/60">{c.subtitle}</div>}
                      </div>
                      {c.amount != null && (
                        <div className="text-[11px] tabular-nums font-medium">
                          {c.amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
