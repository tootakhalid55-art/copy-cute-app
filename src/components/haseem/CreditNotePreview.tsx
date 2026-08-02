import { useMemo } from "react";
import { buildDocHtml, type PrintDocData } from "@/lib/haseem/printDoc";

// Renders the exact same HTML string printDoc() prints — see InvoicePreview.tsx
// for the rationale. Covers both credit and debit notes; buildDocHtml's
// isCreditOrDebitNote block surfaces the original invoice number and reason.
// ZATCA QR never applies here (invoices/bills only) — buildDocHtml enforces
// that itself regardless of what's passed.
export function CreditNotePreview(props: any) {
  const {
    tpl, org, party, partyAddress, ref_, date, issuedAtIso,
    lines, lineCalcs, subtotal, tax, total, notes, originalRef, reason,
    branding, currency, verify, structure, kind,
  } = props;

  const isDebitNote = kind === "debit-note";

  const html = useMemo(() => {
    const data: PrintDocData = {
      kind: isDebitNote ? "debit-note" : "credit-note",
      title: isDebitNote ? "إشعار مدين" : "إشعار دائن",
      titleEn: isDebitNote ? "Debit Note" : "Credit Note",
      issuedAtIso,
      ref: ref_,
      date,
      org,
      party: party ? { ...party, address: partyAddress } : party,
      partyLabel: "الطرف",
      lines,
      lineCalcs,
      subtotal,
      tax,
      total,
      notes,
      originalRef,
      reason,
      currency,
      verify,
      branding,
      tpl,
      structure,
    };
    return buildDocHtml(data);
  }, [
    tpl, org, party, partyAddress, ref_, date, issuedAtIso,
    lines, lineCalcs, subtotal, tax, total, notes, originalRef, reason,
    branding, currency, verify, structure, isDebitNote,
  ]);

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[720px]" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
