import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bot, Sparkles, Loader2, Send, Plus, Trash2, Edit3,
  Users, Copy as CopyIcon, FileText, BookText, TrendingUp,
  Calendar, Coins, AlertTriangle, Download, MessageSquare, Zap,
} from "lucide-react";
import { Shell } from "@/components/haseem/Shell";
import { useOrg } from "@/lib/db/org";
import { ExplainabilityPanel, type ExplainabilityCitation } from "@/components/haseem/ExplainabilityPanel";
import { ActionProposalCard, type ActionProposal } from "@/components/haseem/ActionProposalCard";
import { supabase } from "@/integrations/supabase/client";
import {
  listConversations, createConversation, renameConversation, deleteConversation,
  loadConversationMessages, erpChat,
  recommendCollectionPriorities, recommendPaymentPriorities,
  monthEndChecklist, executiveSummary, detectDuplicates, explainCashFlow,
} from "@/lib/copilot/erp-copilot.functions";
import {
  listProposals, confirmProposal, rejectProposal,
  proposeCollectionPlan, proposeBulkSupplierPayments,
} from "@/lib/copilot/actions.functions";

export const Route = createFileRoute("/copilot")({
  head: () => ({ meta: [
    { title: "مساعد الذكاء المالي — حسيم" },
    { name: "description", content: "مساعد ذكاء اصطناعي شامل لجميع وحدات النظام المحاسبي." },
  ]}),
  component: Page,
});

type Lang = "ar" | "en";
type Msg = {
  id?: string;
  role: "user" | "assistant";
  content: string;
  kind?: string;
  citations?: ExplainabilityCitation[];
  follow_ups?: string[];
  confidence?: number | null;
  recommendation?: string | null;
};

type Conv = { id: string; title: string; language: Lang; module: string | null; last_message_at: string };

const L = {
  ar: {
    title: "مساعد الذكاء المالي الشامل", subtitle: "اسأل عن أي شيء في نظامك المحاسبي — عملاء، فواتير، قيود، مخزون، تدفق نقدي.",
    convs: "المحادثات", newConv: "محادثة جديدة", empty: "ابدأ محادثة أو اختر إجراءً سريعاً.",
    ask: "اسأل المساعد…", send: "إرسال", export: "تصدير PDF",
    quick: "إجراءات سريعة",
    collect: "أولويات التحصيل", pay: "أولويات دفع الموردين", monthEnd: "قائمة إقفال الشهر",
    exec: "ملخص تنفيذي", dupParties: "تكرارات العملاء/الموردين", dupItems: "تكرارات الأصناف",
    cashFlow: "توقع التدفق النقدي",
    thinking: "جاري التفكير…",
    confirmDelete: "حذف هذه المحادثة؟",
    rename: "إعادة تسمية",
    delete: "حذف",
  },
  en: {
    title: "ERP Finance Copilot", subtitle: "Ask anything about your ERP — customers, invoices, journals, inventory, cash.",
    convs: "Conversations", newConv: "New chat", empty: "Start a chat or pick a quick action.",
    ask: "Ask the copilot…", send: "Send", export: "Export PDF",
    quick: "Quick actions",
    collect: "Collection priorities", pay: "Supplier payment priorities", monthEnd: "Month-end checklist",
    exec: "Executive summary", dupParties: "Duplicate customers/suppliers", dupItems: "Duplicate items",
    cashFlow: "Cash-flow forecast",
    thinking: "Thinking…",
    confirmDelete: "Delete this conversation?",
    rename: "Rename",
    delete: "Delete",
  },
} as const;

function Page() {
  const { currentOrgId: orgId } = useOrg();
  const [lang, setLang] = useState<Lang>("ar");
  const t = L[lang];
  const dir = lang === "ar" ? "rtl" : "ltr";

  const listConv = useServerFn(listConversations);
  const createConv = useServerFn(createConversation);
  const renameConv = useServerFn(renameConversation);
  const deleteConv = useServerFn(deleteConversation);
  const loadMsgs = useServerFn(loadConversationMessages);
  const chatFn = useServerFn(erpChat);

  const collectFn = useServerFn(recommendCollectionPriorities);
  const payFn = useServerFn(recommendPaymentPriorities);
  const monthFn = useServerFn(monthEndChecklist);
  const execFn = useServerFn(executiveSummary);
  const dupFn = useServerFn(detectDuplicates);
  const cashFn = useServerFn(explainCashFlow);

  const [convs, setConvs] = useState<Conv[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);

  async function refreshConvs() {
    if (!orgId) return;
    const rows = await listConv({ data: { orgId } }) as Conv[];
    setConvs(rows);
    if (!activeId && rows.length) setActiveId(rows[0].id);
  }
  useEffect(() => { refreshConvs(); /* eslint-disable-next-line */ }, [orgId]);

  useEffect(() => {
    if (!activeId) { setMessages([]); return; }
    (async () => {
      const rows = await loadMsgs({ data: { conversationId: activeId } }) as any[];
      const msgs: Msg[] = [];
      for (const r of rows) {
        if (r.question) msgs.push({ role: "user", content: r.question });
        msgs.push({
          role: "assistant", content: r.answer, kind: r.kind,
          citations: r.citations ?? [], follow_ups: r.follow_ups ?? [],
          confidence: r.confidence, recommendation: r.recommendation,
        });
      }
      setMessages(msgs);
    })();
  }, [activeId]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function ensureConv(): Promise<string> {
    if (activeId) return activeId;
    const c = await createConv({ data: { orgId: orgId!, language: lang } }) as Conv;
    setConvs((prev) => [c, ...prev]);
    setActiveId(c.id);
    return c.id;
  }

  async function newConv() {
    if (!orgId) return;
    const c = await createConv({ data: { orgId, language: lang } }) as Conv;
    setConvs((prev) => [c, ...prev]);
    setActiveId(c.id);
    setMessages([]);
  }

  async function onRename(c: Conv) {
    const title = window.prompt(t.rename, c.title);
    if (!title) return;
    await renameConv({ data: { conversationId: c.id, title } });
    refreshConvs();
  }
  async function onDelete(c: Conv) {
    if (!window.confirm(t.confirmDelete)) return;
    await deleteConv({ data: { conversationId: c.id } });
    if (activeId === c.id) { setActiveId(null); setMessages([]); }
    refreshConvs();
  }

  async function send(text?: string) {
    const q = (text ?? input).trim();
    if (!q || busy || !orgId) return;
    setInput("");
    const convId = await ensureConv();
    const nextMsgs: Msg[] = [...messages, { role: "user", content: q }];
    setMessages(nextMsgs);
    setBusy("chat");
    try {
      const res = await chatFn({ data: {
        orgId, conversationId: convId, language: lang,
        messages: nextMsgs.map((m) => ({ role: m.role, content: m.content })),
      }}) as { answer: string; citations: any[]; follow_ups: string[] };
      setMessages((prev) => [...prev, {
        role: "assistant", content: res.answer, kind: "chat",
        citations: res.citations, follow_ups: res.follow_ups,
      }]);
    } catch (e: any) {
      setMessages((prev) => [...prev, { role: "assistant", content: (lang === "ar" ? "تعذر: " : "Failed: ") + (e?.message || String(e)) }]);
    } finally { setBusy(null); refreshConvs(); }
  }

  async function runQuick(key: string, fn: () => Promise<any>, label: string) {
    if (!orgId) return;
    const convId = await ensureConv();
    setMessages((prev) => [...prev, { role: "user", content: label }]);
    setBusy(key);
    try {
      const res = await fn() as any;
      setMessages((prev) => [...prev, {
        role: "assistant", content: res.answer || "—", kind: key,
        citations: res.citations ?? [], follow_ups: res.follow_ups ?? [],
        confidence: res.confidence, recommendation: res.recommendation,
      }]);
      // no-op: conversation timestamp gets updated by recordDecision
      void convId;
    } catch (e: any) {
      setMessages((prev) => [...prev, { role: "assistant", content: (lang === "ar" ? "تعذر: " : "Failed: ") + (e?.message || String(e)) }]);
    } finally { setBusy(null); refreshConvs(); }
  }

  const today = new Date();
  const period = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const from = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
  const to = today.toISOString().slice(0, 10);

  const quick = useMemo(() => orgId ? [
    { key: "collect", icon: Users, label: t.collect, fn: () => collectFn({ data: { orgId, language: lang, conversationId: activeId ?? undefined } }) },
    { key: "pay", icon: FileText, label: t.pay, fn: () => payFn({ data: { orgId, language: lang, conversationId: activeId ?? undefined } }) },
    { key: "cash", icon: Coins, label: t.cashFlow, fn: () => cashFn({ data: { orgId, language: lang, conversationId: activeId ?? undefined } }) },
    { key: "monthEnd", icon: Calendar, label: t.monthEnd, fn: () => monthFn({ data: { orgId, period, language: lang, conversationId: activeId ?? undefined } }) },
    { key: "exec", icon: TrendingUp, label: t.exec, fn: () => execFn({ data: { orgId, from, to, language: lang, conversationId: activeId ?? undefined } }) },
    { key: "dupP", icon: CopyIcon, label: t.dupParties, fn: () => dupFn({ data: { orgId, scope: "parties" as const, language: lang, conversationId: activeId ?? undefined } }) },
    { key: "dupI", icon: CopyIcon, label: t.dupItems, fn: () => dupFn({ data: { orgId, scope: "items" as const, language: lang, conversationId: activeId ?? undefined } }) },
  ] : [], [orgId, lang, activeId, t]);

  function exportPDF() {
    const el = transcriptRef.current;
    if (!el) return;
    const html = `<!doctype html><html dir="${dir}" lang="${lang}"><head><meta charset="utf-8"><title>${t.title}</title>
      <style>body{font-family:system-ui,-apple-system,Segoe UI,Cairo,sans-serif;padding:24px;color:#0f2a1d}
      .msg{margin-bottom:16px}.role{font-size:11px;text-transform:uppercase;color:#777}
      .u{background:#0f2a1d;color:#fff;padding:8px 12px;border-radius:10px;display:inline-block;max-width:80%}
      .a{background:#f7f6f0;padding:8px 12px;border-radius:10px;display:inline-block;max-width:90%;white-space:pre-wrap}
      .cites{margin-top:6px;font-size:11px;color:#555}</style></head><body>
      <h2>${t.title}</h2>${el.innerHTML}</body></html>`;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(html); w.document.close();
    w.focus(); setTimeout(() => w.print(), 400);
  }

  return (
    <Shell>
      <div className="flex h-[calc(100vh-64px)] bg-[#faf9f4]" dir={dir}>
        {/* Sidebar */}
        <aside className="w-64 border-e border-[#eceae2] bg-white flex flex-col">
          <div className="p-3 border-b border-[#eceae2] flex items-center justify-between">
            <div className="text-sm font-semibold flex items-center gap-1.5">
              <MessageSquare className="w-4 h-4 text-[#0f2a1d]" /> {t.convs}
            </div>
            <button onClick={newConv} title={t.newConv}
              className="p-1.5 rounded hover:bg-[#f7f6f0] text-[#0f2a1d]">
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {convs.length === 0 && (
              <div className="text-xs text-[#0f2a1d]/50 text-center py-4">—</div>
            )}
            {convs.map((c) => (
              <div key={c.id}
                className={`group rounded-md px-2 py-1.5 text-xs cursor-pointer border ${activeId === c.id ? "bg-[#0f2a1d] text-white border-[#0f2a1d]" : "border-transparent hover:bg-[#f7f6f0]"}`}
                onClick={() => setActiveId(c.id)}>
                <div className="flex items-center justify-between gap-1">
                  <div className="truncate flex-1">{c.title}</div>
                  <div className="hidden group-hover:flex items-center gap-1">
                    <button onClick={(e) => { e.stopPropagation(); onRename(c); }} className="p-0.5"><Edit3 className="w-3 h-3" /></button>
                    <button onClick={(e) => { e.stopPropagation(); onDelete(c); }} className="p-0.5"><Trash2 className="w-3 h-3" /></button>
                  </div>
                </div>
                <div className={`text-[10px] mt-0.5 ${activeId === c.id ? "text-white/70" : "text-[#0f2a1d]/50"}`}>
                  {new Date(c.last_message_at).toLocaleString(lang === "ar" ? "ar-SA" : "en-US")}
                </div>
              </div>
            ))}
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 flex flex-col min-w-0">
          <header className="px-4 py-3 border-b border-[#eceae2] bg-white flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-[#0f2a1d] text-white flex items-center justify-center">
                <Bot className="w-4 h-4" />
              </div>
              <div>
                <div className="text-sm font-semibold flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" /> {t.title}
                </div>
                <div className="text-[11px] text-[#0f2a1d]/60">{t.subtitle}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="inline-flex rounded-md border border-[#eceae2] text-xs overflow-hidden">
                <button onClick={() => setLang("ar")} className={`px-2 py-1 ${lang === "ar" ? "bg-[#0f2a1d] text-white" : "bg-white"}`}>AR</button>
                <button onClick={() => setLang("en")} className={`px-2 py-1 ${lang === "en" ? "bg-[#0f2a1d] text-white" : "bg-white"}`}>EN</button>
              </div>
              <button onClick={exportPDF} disabled={!messages.length}
                className="inline-flex items-center gap-1 text-xs px-2 py-1.5 rounded border border-[#eceae2] hover:bg-[#f7f6f0] disabled:opacity-40">
                <Download className="w-3.5 h-3.5" /> {t.export}
              </button>
            </div>
          </header>

          {/* Quick actions */}
          <div className="px-4 py-2 border-b border-[#eceae2] bg-white">
            <div className="text-[10px] uppercase text-[#0f2a1d]/60 mb-1">{t.quick}</div>
            <div className="flex flex-wrap gap-1.5">
              {quick.map(({ key, icon: Icon, label, fn }) => (
                <button key={key} disabled={!!busy}
                  onClick={() => runQuick(key, fn, label)}
                  className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border border-[#eceae2] bg-white hover:bg-[#f7f6f0] disabled:opacity-50">
                  {busy === key ? <Loader2 className="w-3 h-3 animate-spin" /> : <Icon className="w-3 h-3" />}
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Transcript */}
          <div ref={scroller} className="flex-1 overflow-y-auto px-4 py-4">
            <div ref={transcriptRef} className="max-w-3xl mx-auto space-y-3">
              {messages.length === 0 && (
                <div className="text-center text-sm text-[#0f2a1d]/50 py-10">{t.empty}</div>
              )}
              {messages.map((m, i) => (
                <div key={i} className="msg">
                  <div className="role text-[10px] uppercase text-[#0f2a1d]/50 mb-1">{m.role === "user" ? "You" : "Copilot"}</div>
                  <div className={m.role === "user" ? "flex justify-end" : ""}>
                    <div className={m.role === "user"
                      ? "u bg-[#0f2a1d] text-white rounded-2xl px-3 py-2 text-sm max-w-[80%] whitespace-pre-wrap"
                      : "a bg-white border border-[#eceae2] rounded-2xl px-3 py-2 text-sm max-w-[90%] whitespace-pre-wrap leading-relaxed"}>
                      {m.content}
                    </div>
                  </div>
                  {m.role === "assistant" && (
                    <div className="mt-2 max-w-[90%] space-y-2">
                      {(m.citations?.length || m.confidence != null || m.recommendation) && (
                        <ExplainabilityPanel
                          language={lang}
                          compact
                          citations={m.citations}
                          confidence={m.confidence ?? null}
                          recommendation={m.recommendation ?? null}
                        />
                      )}
                      {m.follow_ups?.length ? (
                        <div className="flex flex-wrap gap-1.5">
                          {m.follow_ups.map((f, fi) => (
                            <button key={fi} onClick={() => send(f)}
                              className="text-xs px-2 py-1 rounded-full border border-[#eceae2] bg-white hover:bg-[#f7f6f0]">
                              {f}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              ))}
              {busy && (
                <div className="flex items-center gap-2 text-xs text-[#0f2a1d]/60">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> {t.thinking}
                </div>
              )}
            </div>
          </div>

          {/* Composer */}
          <div className="border-t border-[#eceae2] bg-white p-3">
            <div className="max-w-3xl mx-auto flex gap-2">
              <textarea
                value={input} onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder={t.ask} rows={1}
                className="flex-1 border border-[#eceae2] rounded-lg px-3 py-2 text-sm resize-none"
              />
              <button onClick={() => send()} disabled={!input.trim() || !!busy}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-[#0f2a1d] text-white text-sm hover:opacity-90 disabled:opacity-40">
                {busy === "chat" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {t.send}
              </button>
            </div>
          </div>
        </main>
      </div>
    </Shell>
  );
}

// Silence unused imports for icons kept for future use.
void AlertTriangle;
void BookText;
