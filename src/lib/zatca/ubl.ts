// UBL 2.1 e-invoice XML builder for ZATCA Phase 2 (KSA).
// Generates the unsigned invoice XML with the KSA-mandated fields:
// UUID, ICV (invoice counter), PIH (previous invoice hash), invoice type
// codes, seller identity, per-rate tax subtotals and the Phase-2 TLV QR
// (tags 1..7 minus the cryptographic-stamp tags that require the CSID).
//
// Signing (XAdES B-B with the production CSID) and Fatoora
// clearance/reporting are activated after ZATCA onboarding — see
// docs/ZATCA_PHASE2.md.

export type ZatcaSellerConfig = {
  sellerName: string;
  vatNumber: string; // 15 digits, starts/ends with 3
  crNumber?: string;
  street?: string;
  building?: string;
  city?: string;
  district?: string;
  postalCode?: string;
  countryCode?: string; // default SA
  invoiceType?: "simplified" | "standard"; // 0200000 vs 0100000
};

export type ZatcaDocLine = {
  description: string;
  qty: number;
  price: number; // unit price excl. VAT
  discount?: number;
  taxRate: number; // percent
};

export type ZatcaDocInput = {
  id: string;
  uuid: string;
  icv: number;
  pih: string;
  docNumber: string;
  issueDate: string; // YYYY-MM-DD
  issueTime?: string; // HH:mm:ss
  kind: string; // documents.kind
  currency: string;
  buyerName?: string;
  buyerVat?: string;
  subtotal: number;
  vatTotal: number;
  grandTotal: number;
  lines: ZatcaDocLine[];
};

const esc = (s: unknown) =>
  String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const n2 = (v: number) => (Math.round((v + Number.EPSILON) * 100) / 100).toFixed(2);

/** 388 invoice, 381 credit note, 383 debit note */
function typeCode(kind: string): string {
  if (kind === "credit_note") return "381";
  if (kind === "debit_note") return "383";
  return "388";
}

export function buildZatcaXml(cfg: ZatcaSellerConfig, doc: ZatcaDocInput): string {
  const subtype = cfg.invoiceType === "standard" ? "0100000" : "0200000";
  const time = doc.issueTime ?? "00:00:00";
  const cur = esc(doc.currency || "SAR");

  // Group lines by VAT rate for the tax subtotals.
  const byRate = new Map<number, { taxable: number; tax: number }>();
  for (const l of doc.lines) {
    const net = l.qty * l.price - (l.discount ?? 0);
    const tax = (net * l.taxRate) / 100;
    const acc = byRate.get(l.taxRate) ?? { taxable: 0, tax: 0 };
    acc.taxable += net;
    acc.tax += tax;
    byRate.set(l.taxRate, acc);
  }
  if (byRate.size === 0) byRate.set(15, { taxable: doc.subtotal, tax: doc.vatTotal });

  const lineXml = doc.lines
    .map((l, i) => {
      const net = l.qty * l.price - (l.discount ?? 0);
      const tax = (net * l.taxRate) / 100;
      return `
  <cac:InvoiceLine>
    <cbc:ID>${i + 1}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="PCE">${l.qty}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="${cur}">${n2(net)}</cbc:LineExtensionAmount>
    <cac:TaxTotal>
      <cbc:TaxAmount currencyID="${cur}">${n2(tax)}</cbc:TaxAmount>
      <cbc:RoundingAmount currencyID="${cur}">${n2(net + tax)}</cbc:RoundingAmount>
    </cac:TaxTotal>
    <cac:Item>
      <cbc:Name>${esc(l.description)}</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>${l.taxRate > 0 ? "S" : "Z"}</cbc:ID>
        <cbc:Percent>${l.taxRate.toFixed(2)}</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="${cur}">${n2(l.price)}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>`;
    })
    .join("");

  const taxSubtotals = [...byRate.entries()]
    .map(
      ([rate, v]) => `
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="${cur}">${n2(v.taxable)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="${cur}">${n2(v.tax)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>${rate > 0 ? "S" : "Z"}</cbc:ID>
        <cbc:Percent>${rate.toFixed(2)}</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>`,
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ProfileID>reporting:1.0</cbc:ProfileID>
  <cbc:ID>${esc(doc.docNumber)}</cbc:ID>
  <cbc:UUID>${esc(doc.uuid)}</cbc:UUID>
  <cbc:IssueDate>${esc(doc.issueDate)}</cbc:IssueDate>
  <cbc:IssueTime>${esc(time)}</cbc:IssueTime>
  <cbc:InvoiceTypeCode name="${subtype}">${typeCode(doc.kind)}</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>${cur}</cbc:DocumentCurrencyCode>
  <cbc:TaxCurrencyCode>SAR</cbc:TaxCurrencyCode>
  <cac:AdditionalDocumentReference>
    <cbc:ID>ICV</cbc:ID>
    <cbc:UUID>${doc.icv}</cbc:UUID>
  </cac:AdditionalDocumentReference>
  <cac:AdditionalDocumentReference>
    <cbc:ID>PIH</cbc:ID>
    <cac:Attachment>
      <cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">${esc(doc.pih)}</cbc:EmbeddedDocumentBinaryObject>
    </cac:Attachment>
  </cac:AdditionalDocumentReference>
  <cac:AccountingSupplierParty>
    <cac:Party>
      ${cfg.crNumber ? `<cac:PartyIdentification><cbc:ID schemeID="CRN">${esc(cfg.crNumber)}</cbc:ID></cac:PartyIdentification>` : ""}
      <cac:PostalAddress>
        <cbc:StreetName>${esc(cfg.street || "غير محدد")}</cbc:StreetName>
        <cbc:BuildingNumber>${esc(cfg.building || "0000")}</cbc:BuildingNumber>
        <cbc:CitySubdivisionName>${esc(cfg.district || "غير محدد")}</cbc:CitySubdivisionName>
        <cbc:CityName>${esc(cfg.city || "غير محدد")}</cbc:CityName>
        <cbc:PostalZone>${esc(cfg.postalCode || "00000")}</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>${esc(cfg.countryCode || "SA")}</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>${esc(cfg.vatNumber)}</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${esc(cfg.sellerName)}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      ${doc.buyerVat ? `<cac:PartyTaxScheme><cbc:CompanyID>${esc(doc.buyerVat)}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>` : ""}
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${esc(doc.buyerName || "عميل نقدي")}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${cur}">${n2(doc.vatTotal)}</cbc:TaxAmount>${taxSubtotals}
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${cur}">${n2(doc.subtotal)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${cur}">${n2(doc.subtotal)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${cur}">${n2(doc.grandTotal)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${cur}">${n2(doc.grandTotal)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>${lineXml}
</Invoice>
`;
}

/** Phase-2 TLV QR: tags 1-5 (phase 1) + 6 invoice hash + 7 ICV. */
export function buildZatcaQr(
  cfg: ZatcaSellerConfig,
  doc: ZatcaDocInput,
  invoiceHashB64: string,
): string {
  const iso = `${doc.issueDate}T${doc.issueTime ?? "00:00:00"}Z`;
  const fields: Array<[number, string]> = [
    [1, cfg.sellerName],
    [2, cfg.vatNumber],
    [3, iso],
    [4, n2(doc.grandTotal)],
    [5, n2(doc.vatTotal)],
    [6, invoiceHashB64],
    [7, String(doc.icv)],
  ];
  const enc = new TextEncoder();
  const chunks: number[] = [];
  for (const [tag, val] of fields) {
    const bytes = enc.encode(val);
    chunks.push(tag, bytes.length, ...bytes);
  }
  return Buffer.from(Uint8Array.from(chunks)).toString("base64");
}
