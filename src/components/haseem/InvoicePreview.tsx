import { useMemo } from "react";
import { buildDocHtml, type PrintDocData } from "@/lib/haseem/printDoc";

// The live on-screen preview renders the exact same HTML string used for
// printing (buildDocHtml) instead of a hand-maintained parallel JSX tree.
// Two independent implementations of the same document previously drifted
// out of sync (the print table once had 8 header columns but only 6 data
// cells) — rendering one shared source eliminates that class of bug and
// guarantees screen/print match by construction, not by careful editing.
export function InvoicePreview(props: any) {
  const {
    tpl, org, party, partyAddress, ref_, date, dueDate, issuedAtIso,
    lines, lineCalcs, subtotal, tax, total, notes, branding, qrDataUrl,
    usesZatcaQr, docTitle, currency, layoutVariant, progressBilling,
    partyLabel, structure,
  } = props;

  const html = useMemo(() => {
    const data: PrintDocData = {
      kind: "invoice",
      title: docTitle?.ar ?? "",
      titleEn: docTitle?.en,
      variant: docTitle?.variant,
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
      qrDataUrl: usesZatcaQr ? qrDataUrl : undefined,
      branding,
      tpl,
      layoutVariant,
      progressBilling,
      structure,
    };
    return buildDocHtml(data);
  }, [
    tpl, org, party, partyAddress, ref_, date, dueDate, issuedAtIso,
    lines, lineCalcs, subtotal, tax, total, notes, branding, qrDataUrl,
    usesZatcaQr, docTitle, currency, layoutVariant, progressBilling,
    partyLabel, structure,
  ]);

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[720px]" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
