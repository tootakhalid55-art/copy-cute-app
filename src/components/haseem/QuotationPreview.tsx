import { useMemo } from "react";
import { buildDocHtml, type PrintDocData } from "@/lib/haseem/printDoc";

// Renders the exact same HTML string printDoc() prints — see InvoicePreview.tsx
// for the rationale. buildDocHtml's isQuotation block surfaces validity date
// and terms prominently already; no separate quotation-specific layout needed.
export function QuotationPreview(props: any) {
  const {
    tpl, org, party, partyAddress, ref_, date, dueDate, issuedAtIso,
    lines, lineCalcs, subtotal, tax, total, notes, terms, branding, currency,
    verify, structure,
  } = props;

  const html = useMemo(() => {
    const data: PrintDocData = {
      kind: "quotation",
      title: "عرض سعر",
      titleEn: "Quotation",
      issuedAtIso,
      ref: ref_,
      date,
      expiry: dueDate,
      org,
      party: party ? { ...party, address: partyAddress } : party,
      partyLabel: "العميل",
      lines,
      lineCalcs,
      subtotal,
      tax,
      total,
      notes,
      terms,
      currency,
      verify,
      branding,
      tpl,
      structure,
    };
    return buildDocHtml(data);
  }, [
    tpl, org, party, partyAddress, ref_, date, dueDate, issuedAtIso,
    lines, lineCalcs, subtotal, tax, total, notes, terms, branding, currency,
    verify, structure,
  ]);

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[720px]" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
