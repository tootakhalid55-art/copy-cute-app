import { useState } from "react";
import { CheckCircle2, XCircle, Loader2, AlertTriangle, Sparkles } from "lucide-react";

export type ActionProposal = {
  id: string;
  action_kind: string;
  module: string | null;
  title: string;
  summary: string | null;
  status: "pending" | "confirmed" | "executed" | "rejected" | "failed" | "cancelled";
  risk_level: "low" | "medium" | "high";
  preview: any;
  language: "ar" | "en";
  error?: string | null;
};

const L = {
  ar: {
    proposal: "إجراء مقترح", confirm: "تأكيد وتنفيذ", reject: "رفض", note: "ملاحظة (اختياري)",
    executed: "تم التنفيذ", rejected: "مرفوض", failed: "فشل التنفيذ", cancelled: "ملغى", confirmed: "بانتظار التنفيذ",
    lowRisk: "مخاطر منخفضة", mediumRisk: "مخاطر متوسطة", highRisk: "مخاطر عالية",
    preview: "المعاينة",
  },
  en: {
    proposal: "Proposed action", confirm: "Confirm & execute", reject: "Reject", note: "Note (optional)",
    executed: "Executed", rejected: "Rejected", failed: "Execution failed", cancelled: "Cancelled", confirmed: "Awaiting",
    lowRisk: "Low risk", mediumRisk: "Medium risk", highRisk: "High risk",
    preview: "Preview",
  },
} as const;

export function ActionProposalCard({
  proposal, onConfirm, onReject,
}: {
  proposal: ActionProposal;
  onConfirm: (id: string, note?: string) => Promise<void>;
  onReject: (id: string, note?: string) => Promise<void>;
}) {
  const t = L[proposal.language];
  const [busy, setBusy] = useState<"confirm" | "reject" | null>(null);
  const [note, setNote] = useState("");
  const riskColor = proposal.risk_level === "high" ? "text-rose-700 bg-rose-50 border-rose-200"
    : proposal.risk_level === "medium" ? "text-amber-700 bg-amber-50 border-amber-200"
    : "text-emerald-700 bg-emerald-50 border-emerald-200";

  const isTerminal = ["executed", "rejected", "failed", "cancelled"].includes(proposal.status);

  return (
    <div className="border border-[#eceae2] rounded-xl bg-white shadow-sm overflow-hidden">
      <div className="px-3 py-2 border-b border-[#eceae2] bg-[#faf9f4] flex items-center gap-2">
        <Sparkles className="w-3.5 h-3.5 text-amber-500" />
        <div className="text-[10px] uppercase font-semibold text-[#0f2a1d]/70">{t.proposal}</div>
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${riskColor}`}>
          {proposal.risk_level === "high" ? t.highRisk : proposal.risk_level === "medium" ? t.mediumRisk : t.lowRisk}
        </span>
        <div className="ms-auto text-[10px] text-[#0f2a1d]/50 font-mono">{proposal.action_kind}</div>
      </div>

      <div className="px-3 py-2">
        <div className="text-sm font-semibold text-[#0f2a1d]">{proposal.title}</div>
        {proposal.summary && <div className="text-xs text-[#0f2a1d]/70 mt-0.5">{proposal.summary}</div>}
        {proposal.preview && Object.keys(proposal.preview).length > 0 && (
          <details className="mt-2">
            <summary className="text-[11px] text-[#0f2a1d]/60 cursor-pointer hover:text-[#0f2a1d]">
              {t.preview}
            </summary>
            <pre dir="ltr" className="text-[10px] mt-1 bg-[#faf9f4] border border-[#eceae2] rounded p-2 max-h-48 overflow-auto whitespace-pre-wrap">
              {JSON.stringify(proposal.preview, null, 2)}
            </pre>
          </details>
        )}
        {proposal.error && (
          <div className="mt-2 text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded p-2 flex gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <div>{proposal.error}</div>
          </div>
        )}
      </div>

      <div className="px-3 py-2 border-t border-[#eceae2] bg-white flex items-center gap-2">
        {isTerminal ? (
          <div className={`text-xs font-medium ${
            proposal.status === "executed" ? "text-emerald-700" :
            proposal.status === "failed" ? "text-rose-700" :
            "text-[#0f2a1d]/60"
          }`}>
            {proposal.status === "executed" && <CheckCircle2 className="w-3.5 h-3.5 inline me-1" />}
            {proposal.status === "failed" && <XCircle className="w-3.5 h-3.5 inline me-1" />}
            {t[proposal.status as "executed" | "rejected" | "failed" | "cancelled"]}
          </div>
        ) : (
          <>
            <input
              value={note} onChange={(e) => setNote(e.target.value)}
              placeholder={t.note}
              className="flex-1 text-xs border border-[#eceae2] rounded px-2 py-1"
            />
            <button
              disabled={!!busy}
              onClick={async () => { setBusy("reject"); try { await onReject(proposal.id, note); } finally { setBusy(null); } }}
              className="text-xs px-2 py-1 rounded border border-[#eceae2] text-[#0f2a1d] hover:bg-[#f7f6f0] disabled:opacity-50"
            >
              {busy === "reject" ? <Loader2 className="w-3 h-3 animate-spin inline" /> : <XCircle className="w-3 h-3 inline me-1" />}
              {t.reject}
            </button>
            <button
              disabled={!!busy}
              onClick={async () => { setBusy("confirm"); try { await onConfirm(proposal.id, note); } finally { setBusy(null); } }}
              className="text-xs px-2 py-1 rounded bg-[#0f2a1d] text-white hover:opacity-90 disabled:opacity-50"
            >
              {busy === "confirm" ? <Loader2 className="w-3 h-3 animate-spin inline" /> : <CheckCircle2 className="w-3 h-3 inline me-1" />}
              {t.confirm}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
