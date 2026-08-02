import { useMemo } from "react";
import { buildDocHtml, type PrintDocData } from "@/lib/haseem/printDoc";

// Renders the exact same HTML string printDoc() prints — see InvoicePreview.tsx
// for why (screen/print parity by construction, not by hand-syncing two
// implementations). Covers both purchase orders and purchase bills; buildDocHtml
// already reverses seller/buyer roles for bills (the supplier issues the bill).
export function PurchasePreview(props: any) {
  const {
    tpl, org, party, partyLabel, partyAddress, ref_, date, dueDate, issuedAtIso,
    lines, lineCalcs, subtotal, tax, total, notes, branding, currency, kind,
    qrDataUrl, usesZatcaQr, verify, layoutVariant, progressBilling, structure,
  } = props;

  const isBill = kind === "bill";

  const html = useMemo(() => {
    const data: PrintDocData = {
      kind: isBill ? "bill" : "purchase-order",
      title: isBill ? "فاتورة مشتريات" : "أمر شراء",
      titleEn: isBill ? "Purchase Invoice" : "Purchase Order",
      issuedAtIso,
      ref: ref_,
      date,
      dueDate,
      org,
      party: party ? { ...party, address: partyAddress } : party,
      partyLabel,
      lines,
      lineCalcs,
      subtotal,
      tax,
      total,
      notes,
      currency,
      qrDataUrl: isBill && usesZatcaQr ? qrDataUrl : undefined,
      verify: !isBill ? verify : undefined,
      branding,
      tpl,
      layoutVariant,
      progressBilling,
      structure,
    };
    return buildDocHtml(data);
  }, [
    tpl, org, party, partyLabel, partyAddress, ref_, date, dueDate, issuedAtIso,
    lines, lineCalcs, subtotal, tax, total, notes, branding, currency, kind,
    qrDataUrl, usesZatcaQr, verify, layoutVariant, progressBilling, structure, isBill,
  ]);

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[720px]" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
