// Global command-palette style search. Ctrl/Cmd+K to open.
import { useEffect, useMemo, useState } from "react";
import { Search, X, FileText, Tag, Users, Paperclip } from "lucide-react";
import { globalSearch, type SearchHit } from "@/lib/db/search";
import { useOrg } from "@/lib/db/org";
import { useNavigate } from "@tanstack/react-router";

export function GlobalSearch() {
  const { currentOrgId } = useOrg();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open || !currentOrgId || !q.trim()) {
      setHits([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        setHits(await globalSearch(currentOrgId, q));
      } catch {
        // Search is best-effort; keep the previous results when the request fails.
      }
    }, 200);
    return () => clearTimeout(t);
  }, [q, open, currentOrgId]);

  const icon = useMemo(
    () => ({
      document: <FileText className="w-4 h-4 text-[#0f2a1d]" />,
      tag: <Tag className="w-4 h-4 text-[#0f2a1d]" />,
      party: <Users className="w-4 h-4 text-[#0f2a1d]" />,
      attachment: <Paperclip className="w-4 h-4 text-[#0f2a1d]" />,
    }),
    [],
  );

  if (!open) return (
    <button
      onClick={() => setOpen(true)}
      className="flex items-center gap-2 text-xs text-[#0f2a1d]/70 hover:text-[#0f2a1d] border border-[#eceae2] rounded-lg px-3 py-1.5 bg-white"
    >
      <Search className="w-4 h-4" /> بحث سريع
      <kbd className="text-[10px] bg-[#f7f5ec] px-1.5 py-0.5 rounded">Ctrl K</kbd>
    </button>
  );

  return (
    <div className="fixed inset-0 z-[1200] bg-black/40 flex items-start justify-center pt-24 p-4" onClick={() => setOpen(false)} dir="rtl">
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden">
        <div className="flex items-center gap-2 border-b border-[#eceae2] px-3">
          <Search className="w-4 h-4 text-[#0f2a1d]/60" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ابحث في المستندات، الوسوم، العملاء، المرفقات..."
            className="flex-1 py-3 text-sm outline-none"
          />
          <button onClick={() => setOpen(false)}>
            <X className="w-4 h-4 text-[#0f2a1d]/60" />
          </button>
        </div>
        <ul className="max-h-96 overflow-auto">
          {hits.length === 0 && (
            <li className="p-6 text-center text-xs text-[#0f2a1d]/60">
              {q ? "لا نتائج" : "ابدأ بكتابة كلمة للبحث"}
            </li>
          )}
          {hits.map((h, i) => (
            <li key={`${h.type}-${h.id}-${i}`}>
              <button
                onClick={() => {
                  setOpen(false);
                  const kind = (h.title.split("·")[1] || "").trim();
                  const docRoute: Record<string, string> = {
                    sales_invoice: "/sales/invoices",
                    simplified_tax_invoice: "/sales/invoices",
                    standard_tax_invoice: "/sales/invoices",
                    sales_quotation: "/sales/quotations",
                    sales_order: "/sales/quotations",
                    delivery_note: "/sales/delivery-notes",
                    credit_note: "/sales/credit-notes",
                    purchase_invoice: "/purchases/bills",
                    purchase_order: "/purchases/purchase-orders",
                    debit_note: "/purchases/debit-notes",
                    goods_receipt: "/purchases/purchase-orders",
                    grn: "/purchases/purchase-orders",
                  };
                  if (h.type === "document") navigate({ to: (docRoute[kind] ?? "/sales/invoices") as any });
                  else if (h.type === "party") navigate({ to: "/sales/customers" as any });
                  else if (h.type === "attachment") {
                    const eid = (h.meta as any)?.entity_id;
                    if (eid) navigate({ to: "/sales/invoices" as any, search: { doc: eid } as any });
                  } else if (h.type === "tag") navigate({ to: "/settings/tags" as any });
                }}
                className="w-full flex items-center gap-3 p-3 text-right hover:bg-[#f7f5ec] border-b border-[#eceae2]/50"
              >
                <span className="w-8 h-8 rounded-lg bg-[#f7f5ec] flex items-center justify-center">{icon[h.type]}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{h.title}</div>
                  {h.subtitle && <div className="text-[11px] text-[#0f2a1d]/60 truncate">{h.subtitle}</div>}
                </div>
                <span className="text-[10px] uppercase text-[#0f2a1d]/40">{h.type}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
