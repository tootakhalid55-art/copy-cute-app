import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Bot, Sparkles, Loader2, Send, ShieldCheck, AlertTriangle, Users, Copy, Calculator, FileText, TrendingUp, MessageSquare } from "lucide-react";
import {
  explainSupplierMatch, explainDuplicate, explainVat, suggestPosting,
  explainConfidence, summarizeInvoice, detectAnomalies, recommendApproval,
  copilotChat,
} from "@/lib/ap/copilot.functions";

type Lang = "ar" | "en";
type Msg = { role: "user" | "assistant"; content: string; kind?: string; ts?: number };

const T = {
  ar: {
    title: "مساعد الذكاء المالي",
    subtitle: "افهم قرارات الذكاء الاصطناعي واحصل على توصيات محاسبية.",
    supplier: "لماذا هذا المورد؟",
    duplicate: "لماذا اعتُبر مكرراً؟",
    vat: "شرح فحص الضريبة",
    posting: "اقتراح الحساب والمركز",
    conf: "شرح درجات الثقة",
    summary: "ملخص الفاتورة",
    anomalies: "اكتشاف الشذوذ",
    recommend: "توصية الاعتماد",
    ask: "اسأل المساعد…",
    send: "إرسال",
    empty: "اختر إجراءً سريعاً أو اكتب سؤالك.",
  },
  en: {
    title: "AI Finance Copilot",
    subtitle: "Understand AI decisions and get accounting guidance.",
    supplier: "Why this supplier?",
    duplicate: "Why flagged as duplicate?",
    vat: "Explain VAT check",
    posting: "Suggest GL & Cost Center",
    conf: "Explain confidence",
    summary: "Invoice summary",
    anomalies: "Detect anomalies",
    recommend: "Approval recommendation",
    ask: "Ask the copilot…",
    send: "Send",
    empty: "Pick a quick action or type your question.",
  },
} as const;

export function CopilotPanel({
  orgId, intakeId, defaultLang = "ar",
}: {
  orgId: string;
  intakeId?: string | null;
  defaultLang?: Lang;
}) {
  const [lang, setLang] = useState<Lang>(defaultLang);
  const [busy, setBusy] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const scroller = useRef<HTMLDivElement>(null);

  const t = T[lang];

  const supplierFn = useServerFn(explainSupplierMatch);
  const dupFn = useServerFn(explainDuplicate);
  const vatFn = useServerFn(explainVat);
  const postFn = useServerFn(suggestPosting);
  const confFn = useServerFn(explainConfidence);
  const sumFn = useServerFn(summarizeInvoice);
  const anomFn = useServerFn(detectAnomalies);
  const recFn = useServerFn(recommendApproval);
  const chatFn = useServerFn(copilotChat);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const push = (m: Msg) => setMessages((prev) => [...prev, { ...m, ts: Date.now() }]);

  async function run(kind: string, label: string, fn: () => Promise<{ answer: string }>) {
    if (!intakeId) return;
    setBusy(kind);
    push({ role: "user", content: label, kind });
    try {
      const res = await fn();
      push({ role: "assistant", content: res.answer || "—", kind });
    } catch (e: any) {
      push({ role: "assistant", content: (lang === "ar" ? "تعذر التنفيذ: " : "Failed: ") + (e?.message || String(e)), kind });
    } finally {
      setBusy(null);
    }
  }

  async function sendChat() {
    const q = input.trim();
    if (!q || busy) return;
    setInput("");
    const next: Msg[] = [...messages, { role: "user", content: q, ts: Date.now() }];
    setMessages(next);
    setBusy("chat");
    try {
      const res = await chatFn({
        data: {
          orgId, intakeId: intakeId ?? null, language: lang,
          messages: next.map((m) => ({ role: m.role, content: m.content })),
        },
      });
      push({ role: "assistant", content: res.answer || "—" });
    } catch (e: any) {
      push({ role: "assistant", content: (lang === "ar" ? "تعذر التنفيذ: " : "Failed: ") + (e?.message || String(e)) });
    } finally {
      setBusy(null);
    }
  }

  const actions: Array<{ key: string; icon: any; label: string; fn: () => Promise<any> }> = intakeId ? [
    { key: "supplier", icon: Users, label: t.supplier, fn: () => supplierFn({ data: { orgId, intakeId, language: lang } }) },
    { key: "duplicate", icon: Copy, label: t.duplicate, fn: () => dupFn({ data: { orgId, intakeId, language: lang } }) },
    { key: "vat", icon: Calculator, label: t.vat, fn: () => vatFn({ data: { orgId, intakeId, language: lang } }) },
    { key: "posting", icon: FileText, label: t.posting, fn: () => postFn({ data: { orgId, intakeId, language: lang } }) },
    { key: "conf", icon: ShieldCheck, label: t.conf, fn: () => confFn({ data: { orgId, intakeId, language: lang } }) },
    { key: "summary", icon: MessageSquare, label: t.summary, fn: () => sumFn({ data: { orgId, intakeId, language: lang } }) },
    { key: "anomalies", icon: AlertTriangle, label: t.anomalies, fn: () => anomFn({ data: { orgId, intakeId, language: lang } }) },
    { key: "recommend", icon: TrendingUp, label: t.recommend, fn: () => recFn({ data: { orgId, intakeId, language: lang } }) },
  ] : [];

  return (
    <div className="rounded-lg border border-[#eceae2] bg-white flex flex-col h-full min-h-[400px]">
      <div className="p-3 border-b border-[#eceae2] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-[#0f2a1d] text-white flex items-center justify-center">
            <Bot className="w-4 h-4" />
          </div>
          <div>
            <div className="text-sm font-semibold flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" /> {t.title}
            </div>
            <div className="text-[11px] text-[#0f2a1d]/60">{t.subtitle}</div>
          </div>
        </div>
        <div className="inline-flex rounded-md border border-[#eceae2] text-xs overflow-hidden">
          <button onClick={() => setLang("ar")}
            className={`px-2 py-1 ${lang === "ar" ? "bg-[#0f2a1d] text-white" : "bg-white"}`}>AR</button>
          <button onClick={() => setLang("en")}
            className={`px-2 py-1 ${lang === "en" ? "bg-[#0f2a1d] text-white" : "bg-white"}`}>EN</button>
        </div>
      </div>

      {actions.length > 0 && (
        <div className="p-2 border-b border-[#eceae2] grid grid-cols-2 gap-1.5">
          {actions.map(({ key, icon: Icon, label, fn }) => (
            <button key={key} disabled={!!busy}
              onClick={() => run(key, label, fn)}
              className="inline-flex items-center gap-1.5 text-xs px-2 py-1.5 rounded border border-[#eceae2] hover:bg-[#f7f6f0] disabled:opacity-50 text-right">
              {busy === key ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Icon className="w-3.5 h-3.5" />}
              <span className="truncate">{label}</span>
            </button>
          ))}
        </div>
      )}

      <div ref={scroller} className="flex-1 overflow-y-auto p-3 space-y-2 text-sm" dir={lang === "ar" ? "rtl" : "ltr"}>
        {messages.length === 0 && (
          <div className="text-center text-xs text-[#0f2a1d]/50 py-6">{t.empty}</div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-lg px-3 py-2 whitespace-pre-wrap leading-relaxed ${
              m.role === "user" ? "bg-[#0f2a1d] text-white" : "bg-[#f7f6f0] text-[#0f2a1d]"
            }`}>
              {m.content}
            </div>
          </div>
        ))}
        {busy && busy !== "chat" && (
          <div className="flex items-center gap-2 text-xs text-[#0f2a1d]/60">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> {lang === "ar" ? "جاري التفكير…" : "Thinking…"}
          </div>
        )}
      </div>

      <div className="p-2 border-t border-[#eceae2] flex gap-2">
        <input
          value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
          placeholder={t.ask}
          className="flex-1 border border-[#eceae2] rounded-lg px-3 py-2 text-sm"
          dir={lang === "ar" ? "rtl" : "ltr"}
        />
        <button onClick={sendChat} disabled={!input.trim() || !!busy}
          className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-[#0f2a1d] text-white text-sm hover:opacity-90 disabled:opacity-40">
          {busy === "chat" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          {t.send}
        </button>
      </div>
    </div>
  );
}
