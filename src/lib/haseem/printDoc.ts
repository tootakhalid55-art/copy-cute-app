// Self-contained printable document builder.
// Renders an HTML string with inline styles (no Tailwind dependency),
// then prints via a hidden iframe so popup blockers can't interfere.
import { formatTimestamp as formatTs } from "./zatca";
import { amountToWordsArabic } from "./amountWords";


export type PrintLine = { description: string; qty: number; price: number; tax: number; discount?: number; unit?: string };
export type ProgressBilling = {
  contractValue: number; previousCertified: number; retentionPct: number; advanceRecoveryPct: number;
  currentCertificate: number; cumulativeCompleted: number; cumulativePct: number;
  retentionAmt: number; advanceRecoveryAmt: number; netPayable: number;
};
export type PrintLineCalc = { net: number; taxAmt: number; gross: number };

export type PrintTpl = { name: string; accent: string; onAccent: string; soft: string };


export function makeZatcaQrPayload(input: {
  sellerName: string;
  vatNumber: string;
  issuedAtIso: string;
  totalWithVat: number;
  vatAmount: number;
}) {
  const enc = new TextEncoder();
  const encodeField = (tag: number, value: string) => {
    const bytes = enc.encode(value);
    return [tag, bytes.length, ...bytes];
  };
  const bytes = [
    ...encodeField(1, input.sellerName),
    ...encodeField(2, input.vatNumber),
    ...encodeField(3, input.issuedAtIso),
    ...encodeField(4, input.totalWithVat.toFixed(2)),
    ...encodeField(5, input.vatAmount.toFixed(2)),
  ];
  let bin = "";
  for (const byte of bytes) bin += String.fromCharCode(byte);
  return typeof btoa !== "undefined" ? btoa(bin) : Buffer.from(bin, "binary").toString("base64");
}

export type PrintDocData = {
  kind?: "invoice" | "quotation" | "credit-note" | "debit-note" | "purchase-order" | "bill";
  title: string;              // e.g. "فاتورة ضريبية"
  titleEn?: string;           // e.g. "Tax Invoice"
  variant?: "standard" | "simplified";  // ZATCA invoice type
  issuedAtIso?: string;       // exact ZATCA timestamp
  ref: string;
  date: string;
  dueDate?: string;
  expiry?: string;
  org: { name: string; taxNumber: string; address?: string; commercialReg?: string };
  party?: { name?: string; taxNumber?: string; phone?: string; email?: string; address?: string; commercialReg?: string } | null;
  partyLabel: string;
  lines: PrintLine[];
  lineCalcs: PrintLineCalc[];
  subtotal: number;
  tax: number;
  total: number;
  discAmt?: number;
  shipAmt?: number;
  notes?: string;
  terms?: string;
  reason?: string;
  originalRef?: string;
  currency: string;           // "ر.س" | "$" | ...
  qrDataUrl?: string;
  branding?: { logo?: string; stamp?: string };
  tpl: PrintTpl;
  poNumber?: string;
  reference?: string;
  project?: string;
  statusLabel?: string;
  approvalLabel?: string;
  partyRole?: string;
  bilingual?: boolean;        // show English secondary labels
  verify?: { qrDataUrl: string; url: string; label?: string };
  layoutVariant?: "standard" | "contracting" | "supply" | "services";
  progressBilling?: ProgressBilling;
  // Structural layout — a genuinely different arrangement of the same data,
  // not a color swap. Defaults to "boxed" (today's look, unchanged).
  structure?: "boxed" | "banner" | "minimal" | "corporate" | "thermal";
  // 80mm (default) or 57mm thermal roll width — only read when structure is "thermal".
  thermalWidth?: "80mm" | "57mm";
};

export const DOC_STRUCTURES: { id: NonNullable<PrintDocData["structure"]>; name: string; desc: string }[] = [
  { id: "boxed", name: "الشبكي الصندوقي", desc: "بطاقات منفصلة بحدود دائرية لكل قسم — التصميم الحالي." },
  { id: "banner", name: "البانوراما العلوي", desc: "شريط علوي ملوّن بعرض الصفحة يحمل هوية المُصدر والعنوان." },
  { id: "minimal", name: "الحد الأدنى النظيف", desc: "بلا صناديق أو ألوان خلفية، فواصل خطية رفيعة فقط." },
  { id: "corporate", name: "المؤسسي الكلاسيكي", desc: "إطار مزدوج رسمي، ترويسة مُوسّطة، وجدول تقليدي محدّد الخلايا، مع خانتي توقيع." },
  { id: "thermal", name: "الطولي الحراري (إيصال)", desc: "عرض ضيق ومركزي لطابعات نقاط البيع الحرارية 80mm/57mm — للفاتورة الضريبية المبسطة." },
];


const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const fmt = (n: number) =>
  (Math.round((Number(n) + Number.EPSILON) * 100) / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export function buildDocHtml(d: PrintDocData): string {
  const tpl = d.tpl ?? { name: "Default", accent: "#0f2a1d", onAccent: "#ffffff", soft: "#fafaf7" };
  const org = d.org ?? { name: "", taxNumber: "", address: "" };
  const party = d.party ?? null;
  const lines = Array.isArray(d.lines) ? d.lines : [];
  const lineCalcs = Array.isArray(d.lineCalcs) ? d.lineCalcs : [];
  const currency = d.currency ?? "SAR";
  const branding = d.branding ?? {};
  const bilingual = d.bilingual;
  const B = bilingual !== false;
  const en = (t: string) => (B ? `<span style="font-size:9px;opacity:.55;font-weight:400;margin-inline-start:6px">${esc(t)}</span>` : "");

  const accent = tpl.accent;
  const soft = tpl.soft;
  const ink = "#0f1a14";
  const muted = "#6b7469";
  const line = "#ececec";

  const simplified = d.variant === "simplified";
  const kind = d.kind ?? "invoice";
  const isInvoice = kind === "invoice";
  const isCreditNote = kind === "credit-note";
  const isDebitNote = kind === "debit-note";
  const isCreditOrDebitNote = isCreditNote || isDebitNote;
  const isQuotation = kind === "quotation";
  const isPurchase = kind === "purchase-order" || kind === "bill";
  const isBill = kind === "bill";
  // A purchase bill originates from the supplier: show the supplier as the
  // issuing party in the header (with its VAT/CR), and our own org as the
  // recipient — the reverse of every other document kind.
  const headerOrg = isBill && party
    ? { name: party.name || org.name, taxNumber: party.taxNumber || "", address: party.address || "", commercialReg: party.commercialReg }
    : org;
  const recipientParty = isBill
    ? { name: org.name, taxNumber: org.taxNumber, address: org.address, phone: undefined, email: undefined, commercialReg: org.commercialReg }
    : party;
  const useDetailedTaxTable = isInvoice || isBill;
  const isSupply = d.layoutVariant === "supply";
  const isServices = d.layoutVariant === "services";
  const isContracting = d.layoutVariant === "contracting" && d.progressBilling;

  const vatRate = 15;
  const lineTaxRows = lines.map((l, i) => {
    const c = lineCalcs[i] || { net: 0, taxAmt: 0, gross: 0 };
    const rate = Number.isFinite(Number(l.tax)) ? Number(l.tax) : vatRate;
    return { line: l, calc: c, rate };
  });
  const partyBlock = recipientParty && (recipientParty.name || recipientParty.taxNumber || recipientParty.phone)
    ? `<div style="font-size:14px;font-weight:700;color:${ink};margin-bottom:6px;letter-spacing:.01em">${esc(recipientParty.name || "—")}</div>
       <div style="display:grid;gap:3px;font-size:11px;color:${muted}">
         ${recipientParty.taxNumber ? `<div><span style="color:${accent};font-weight:600">الرقم الضريبي · VAT No. </span>${esc(recipientParty.taxNumber)}</div>` : ""}
         ${!simplified && recipientParty.address ? `<div><span style="color:${accent};font-weight:600">العنوان · Address </span>${esc(recipientParty.address)}</div>` : ""}
         ${recipientParty.phone ? `<div><span style="color:${accent};font-weight:600">الجوال · Phone </span>${esc(recipientParty.phone)}</div>` : ""}
         ${!simplified && recipientParty.email ? `<div><span style="color:${accent};font-weight:600">البريد · Email </span>${esc(recipientParty.email)}</div>` : ""}
       </div>`
    : `<span style="color:#b7bdb2">${simplified ? "عميل نقدي · Cash customer" : "—"}</span>`;

  const partyRole = d.partyRole || (isBill ? "العميل" : isPurchase ? "المورد" : "الطرف");
  const headerBadges = [
    d.statusLabel ? `<span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:999px;background:${soft};color:${accent};font-size:10px;font-weight:700;border:1px solid ${accent}33">${esc(d.statusLabel)}</span>` : "",
    d.approvalLabel ? `<span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:999px;background:#fff;color:${ink};font-size:10px;font-weight:700;border:1px solid ${line}">${esc(d.approvalLabel)}</span>` : "",
  ].filter(Boolean).join(" ");

  const metaCell = (label: string, enLabel: string, value: string) => `
    <div style="display:flex;flex-direction:column;gap:4px;padding:10px 14px;background:${soft};border-radius:8px;min-width:0">
      <div style="font-size:9.5px;color:${muted};font-weight:600;letter-spacing:.04em;text-transform:uppercase">${esc(label)}${B ? ` <span style="opacity:.6;font-weight:400;text-transform:none">· ${esc(enLabel)}</span>` : ""}</div>
      <div style="font-size:12px;color:${ink};font-weight:600;font-variant-numeric:tabular-nums;word-break:break-word">${value || "—"}</div>
    </div>`;

  const stamp = d.issuedAtIso ? formatTs(d.issuedAtIso) : "";

  const metaGrid = [
    metaCell("التاريخ", "Date", esc(d.date)),
    stamp ? metaCell("وقت الإصدار", "Timestamp", `<span style="direction:ltr;display:inline-block">${esc(stamp)}</span>`) : "",
    metaCell(d.expiry ? "الصلاحية" : "الاستحقاق", d.expiry ? "Expiry" : "Due", esc(d.expiry || d.dueDate || "—")),
    d.poNumber ? metaCell("أمر الشراء", "PO No.", esc(d.poNumber)) : "",
    d.reference ? metaCell("المرجع", "Reference", esc(d.reference)) : "",
    d.project ? metaCell("المشروع", "Project", esc(d.project)) : "",
  ].filter(Boolean).join("");


  const totalsRow = (label: string, enLabel: string, value: string, opts?: { strong?: boolean; dashed?: boolean }) => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:9px 0;${opts?.dashed === false || opts?.strong ? "" : `border-bottom:1px dashed ${line};`}">
      <span style="font-size:11px;color:${opts?.strong ? "#fff" : muted};font-weight:${opts?.strong ? 700 : 500}">${esc(label)}${B ? ` <span style="opacity:.7;font-weight:400;font-size:9.5px">· ${esc(enLabel)}</span>` : ""}</span>
      <span style="font-variant-numeric:tabular-nums;font-weight:${opts?.strong ? 800 : 600};font-size:${opts?.strong ? "15px" : "12px"};color:${opts?.strong ? "#fff" : ink}">${value} <span style="font-size:10px;opacity:.7">${esc(currency)}</span></span>
    </div>`;

  const totalsBlock = `
    <div style="background:#fff;border:1px solid ${line};border-radius:12px;overflow:hidden">
      <div style="padding:14px 18px 6px">
        ${totalsRow("المجموع الفرعي", "Subtotal", fmt(d.subtotal))}
        ${totalsRow("ضريبة القيمة المضافة", "VAT", fmt(d.tax))}
        ${d.discAmt && d.discAmt > 0 ? totalsRow("خصم", "Discount", `- ${fmt(d.discAmt)}`) : ""}
        ${d.shipAmt && d.shipAmt > 0 ? totalsRow("شحن", "Shipping", fmt(d.shipAmt)) : ""}
      </div>
      <div style="background:${accent};padding:14px 18px;color:${tpl.onAccent}">
        ${totalsRow("الإجمالي شامل الضريبة", "Grand Total", fmt(d.total), { strong: true })}
      </div>
      ${simplified ? `
      <div style="padding:10px 18px;border-top:1px dashed ${line};font-size:10.5px;color:${muted};line-height:1.6">
        <span style="font-weight:700;color:${ink}">المبلغ بالحروف: </span>${esc(amountToWordsArabic(d.total))}
      </div>` : ""}
    </div>`;

  const stampBlock = branding?.stamp
    ? `<img src="${esc(branding.stamp)}" alt="stamp" style="max-height:90px;object-fit:contain;opacity:.9" />`
    : "";
  // Defense in depth: ZATCA QR is exclusive to sales invoices and purchase
  // bills — ignore d.qrDataUrl for every other kind even if a caller passes
  // one by mistake, rather than trusting callers to gate it correctly.
  const showsZatcaQr = kind === "invoice" || kind === "bill";
  const qrBlock = showsZatcaQr && d.qrDataUrl
    ? `<div style="text-align:center;background:#fff;padding:10px;border:1px solid ${line};border-radius:12px;display:inline-block">
         <img src="${esc(d.qrDataUrl)}" alt="ZATCA QR" width="118" height="118" />
         <div style="font-size:9.5px;color:${muted};margin-top:4px;font-weight:600;letter-spacing:.04em">ZATCA · هيئة الزكاة</div>
       </div>`
    : "";

  // Our own uploaded logo belongs to org, not the supplier — never show it
  // in a reversed bill header, fall back to an initials badge instead.
  const logoBlock = branding?.logo && !isBill
    ? `<img src="${esc(branding.logo)}" alt="logo" style="max-height:56px;object-fit:contain;margin-bottom:10px" />`
    : `<div style="width:44px;height:44px;border-radius:10px;background:${accent};color:${tpl.onAccent};display:flex;align-items:center;justify-content:center;font-weight:800;font-size:18px;margin-bottom:10px">${esc((headerOrg.name || "H").trim().charAt(0))}</div>`;

  // ---- Shared content fragments (identical data across all 4 structures;
  // only their container/arrangement differs below). This is what guarantees
  // the QR/party/totals data always appears correctly no matter which
  // structure is picked — every structure renders these exact same strings.
  const extrasHtml = [
    isCreditOrDebitNote ? `
      <div style="border:1px solid ${line};border-radius:12px;padding:14px 18px;background:${soft}">
        <div style="font-size:9.5px;color:${muted};font-weight:700;letter-spacing:.08em;text-transform:uppercase;margin-bottom:8px">${isDebitNote ? "مرجع الإشعار المدين · Debit Note Reference" : "مرجع الإشعار الدائن · Credit Note Reference"}</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;font-size:12px;color:${ink}">
          <div><span style="color:${muted};font-size:10px">رقم الفاتورة الأصلية</span><div style="font-weight:700">${esc(d.originalRef || d.reference || "—")}</div></div>
          <div><span style="color:${muted};font-size:10px">سبب التعديل</span><div style="font-weight:700">${esc(d.reason || d.notes || "—")}</div></div>
        </div>
      </div>` : "",
    isQuotation ? `
      <div style="border:1px solid ${line};border-radius:12px;padding:14px 18px;background:${soft}">
        <div style="font-size:9.5px;color:${muted};font-weight:700;letter-spacing:.08em;text-transform:uppercase;margin-bottom:8px">تفاصيل العرض · Quote Terms</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;font-size:12px;color:${ink}">
          <div><span style="color:${muted};font-size:10px">صلاحية العرض</span><div style="font-weight:700">${esc(d.expiry || d.dueDate || "—")}</div></div>
          <div><span style="color:${muted};font-size:10px">الشروط</span><div style="font-weight:700">${esc(d.terms || d.notes || "—")}</div></div>
        </div>
      </div>` : "",
    isPurchase ? `
      <div style="border:1px solid ${line};border-radius:12px;padding:14px 18px;background:${soft}">
        <div style="font-size:9.5px;color:${muted};font-weight:700;letter-spacing:.08em;text-transform:uppercase;margin-bottom:8px">${kind === "bill" ? "بيانات فاتورة المورد · Supplier Bill" : "بيانات أمر الشراء · Purchase Order"}</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;font-size:12px;color:${ink}">
          <div><span style="color:${muted};font-size:10px">${kind === "bill" ? "المورد" : "الجهة الموردة"}</span><div style="font-weight:700">${esc(party?.name || d.partyLabel || "—")}</div></div>
          <div><span style="color:${muted};font-size:10px">المرجع</span><div style="font-weight:700">${esc(d.reference || d.poNumber || "—")}</div></div>
        </div>
      </div>` : "",
  ].filter(Boolean).map((h) => `<div style="padding:0 32px 22px">${h}</div>`).join("");

  const contractingHtml = isContracting ? (() => {
    const pb = d.progressBilling!;
    const row = (label: string, value: string, opts?: { strong?: boolean; negative?: boolean }) => `
      <div style="display:flex;justify-content:space-between;padding:6px 0;${opts?.strong ? "" : `border-bottom:1px dashed ${line};`}">
        <span style="font-size:11px;color:${opts?.strong ? "#fff" : muted}">${esc(label)}</span>
        <span style="font-variant-numeric:tabular-nums;font-weight:${opts?.strong ? 800 : 600};font-size:${opts?.strong ? "13px" : "12px"};color:${opts?.strong ? "#fff" : ink}">${opts?.negative ? "- " : ""}${fmt(value as any)} ${esc(currency)}</span>
      </div>`;
    return `
    <div style="padding:0 32px 22px">
      <div style="border:1px solid ${line};border-radius:12px;overflow:hidden">
        <div style="padding:10px 18px;background:${soft};font-size:9.5px;color:${muted};font-weight:700;letter-spacing:.08em;text-transform:uppercase">تفاصيل المستخلص · Progress Billing</div>
        <div style="padding:14px 18px 4px">
          ${row("قيمة العقد · Contract Value", String(pb.contractValue))}
          <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px dashed ${line}"><span style="font-size:11px;color:${muted}">نسبة الإنجاز التراكمية</span><span style="font-weight:700;font-size:12px;color:${ink}">${esc(pb.cumulativePct)}%</span></div>
          ${row("المستخلصات السابقة", String(pb.previousCertified))}
          ${row("المستخلص الحالي", String(pb.currentCertificate))}
          ${row(`الحجز الاحتياطي (${pb.retentionPct}%)`, String(pb.retentionAmt), { negative: true })}
          ${row(`استرداد الدفعة المقدمة (${pb.advanceRecoveryPct}%)`, String(pb.advanceRecoveryAmt), { negative: true })}
        </div>
        <div style="background:${accent};padding:12px 18px">
          ${row("الصافي المستحق", String(pb.netPayable), { strong: true })}
        </div>
      </div>
    </div>`;
  })() : "";

  const verifyHtml = d.verify ? `
    <div style="margin:0 32px 22px;padding:16px 18px;border:1px solid ${line};border-radius:12px;background:linear-gradient(135deg, ${soft} 0%, #fff 100%);display:flex;align-items:center;gap:16px;justify-content:space-between">
      <div style="display:flex;align-items:center;gap:14px">
        <img src="${esc(d.verify.qrDataUrl)}" alt="verify" width="86" height="86" style="background:#fff;padding:5px;border-radius:8px;border:1px solid ${line}" />
        <div style="font-size:11px;color:${ink};line-height:1.7">
          <div style="font-weight:800;color:${accent};margin-bottom:2px;font-size:12px">${esc(d.verify.label || "التوقيع الرقمي · Digital Signature")}</div>
          <div style="color:${muted}">يمكن التحقق من صحة هذا المستند بمسح الرمز</div>
          <div style="direction:ltr;text-align:left;font-size:9.5px;color:${muted};margin-top:3px;word-break:break-all;font-family:ui-monospace,monospace">${esc(d.verify.url)}</div>
        </div>
      </div>
      <div style="text-align:center;font-size:9.5px;color:${muted};min-width:110px;padding:8px 12px;background:#fff;border-radius:10px;border:1px solid ${line}">
        <div style="font-weight:800;color:${accent};font-size:11px">✓ مُوثَّق</div>
        <div style="opacity:.7;margin-top:2px">Verified · HMAC-SHA256</div>
      </div>
    </div>` : "";

  // Items table, parameterized by border treatment — content (columns/values)
  // is identical across variants; only the visual frame changes.
  const itemsTable = (variant: "boxed" | "lines" | "grid") => {
    const wrapStyle = variant === "grid"
      ? `width:100%;border-collapse:collapse;font-size:11px;background:#fff;border:1.5px solid ${ink}`
      : variant === "lines"
      ? `width:100%;border-collapse:collapse;font-size:11px;background:#fff`
      : `width:100%;border-collapse:collapse;font-size:11px;background:#fff;border:1px solid ${line};border-radius:12px;overflow:hidden`;
    const theadStyle = variant === "grid" ? `background:${accent};color:${tpl.onAccent}` : variant === "lines" ? `` : `background:${soft}`;
    const thBase = variant === "grid"
      ? `padding:9px 8px;text-align:center;font-size:9.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;border:1px solid ${tpl.onAccent}44`
      : variant === "lines"
      ? `padding:8px 6px;text-align:center;font-size:9.5px;color:${accent};font-weight:700;letter-spacing:.06em;text-transform:uppercase;border-bottom:1.5px solid ${ink}`
      : `padding:11px 8px;text-align:center;font-size:9.5px;color:${muted};font-weight:700;letter-spacing:.06em;text-transform:uppercase`;
    const th = (label: string, extra = "") => `<th style="${thBase}${extra}">${label}</th>`;
    const tdBorder = variant === "grid" ? `border:1px solid ${ink}66` : variant === "lines" ? `border-bottom:1px solid ${line}` : `border-bottom:1px solid ${line}`;
    const bodyRows = (useDetailedTaxTable ? lineTaxRows : lines.map((l, i) => ({ line: l, calc: lineCalcs[i] || { net: 0, taxAmt: 0, gross: 0 }, rate: Number(l.tax) })))
      .map((row: any, i: number) => `
        <tr class="avoid-break">
          <td style="${tdBorder};padding:9px 8px;text-align:center;color:${muted};font-variant-numeric:tabular-nums">${String(i + 1).padStart(2, "0")}</td>
          <td style="${tdBorder};padding:9px 10px;text-align:right;color:${ink};font-weight:600">${esc(row.line.description || "—")}</td>
          ${isSupply ? `<td style="${tdBorder};padding:9px 8px;text-align:center;color:${muted}">${esc(row.line.unit || "—")}</td>` : ""}
          <td style="${tdBorder};padding:9px 8px;text-align:center;font-variant-numeric:tabular-nums">${esc(row.line.qty)}</td>
          <td style="${tdBorder};padding:9px 8px;text-align:center;font-variant-numeric:tabular-nums">${fmt(row.line.price)}</td>
          <td style="${tdBorder};padding:9px 8px;text-align:center;font-variant-numeric:tabular-nums;color:${muted}">${fmt(row.line.discount ?? 0)}</td>
          <td style="${tdBorder};padding:9px 8px;text-align:center;font-variant-numeric:tabular-nums">${fmt(row.calc.net)}</td>
          ${useDetailedTaxTable ? `<td style="${tdBorder};padding:9px 8px;text-align:center;font-variant-numeric:tabular-nums">${(row.rate || vatRate).toFixed?.(0) ?? row.rate}% <span style="opacity:.6">(${fmt(row.calc.taxAmt)})</span></td>` : ""}
          <td style="${tdBorder};padding:9px 10px;text-align:center;font-variant-numeric:tabular-nums;font-weight:700">${fmt(row.calc.gross)}</td>
        </tr>`)
      .join("");
    const colCount = 6 + (isSupply ? 1 : 0) + (useDetailedTaxTable ? 1 : 0);
    return `
      <table style="${wrapStyle}">
        <thead><tr style="${theadStyle}">
          ${th("#", `;width:32px`)}
          ${th(`الوصف${en("Description")}`, `;text-align:right`)}
          ${isSupply ? th(`الوحدة${en("Unit")}`, `;width:56px`) : ""}
          ${th(isServices ? `الساعات${en("Hours")}` : `الكمية${en("Qty")}`, `;width:56px`)}
          ${th(isServices ? `الأجر/ساعة${en("Rate")}` : `السعر${en("Unit Price")}`, `;width:78px`)}
          ${th(`الخصم${en("Discount")}`, `;width:66px`)}
          ${th(useDetailedTaxTable ? `خاضع للضريبة${en("Taxable")}` : `المبلغ${en("Amount")}`, `;width:84px`)}
          ${useDetailedTaxTable ? th(`الضريبة${en("VAT")}`, `;width:92px`) : ""}
          ${th(`الإجمالي${en("Line Total")}`, `;width:96px`)}
        </tr></thead>
        <tbody>${bodyRows || `<tr><td colspan="${colCount}" style="padding:24px;text-align:center;color:#b7bdb2;font-size:11px">لا توجد بنود</td></tr>`}</tbody>
      </table>`;
  };

  const footerLine = (bg: string, fg: string) => `
    <div style="padding:16px 32px 22px;border-top:1px solid ${line};display:flex;justify-content:space-between;align-items:center;font-size:10.5px;color:${muted};background:${bg}">
      <span style="${fg ? `color:${fg}` : ""}">شكراً لتعاملكم معنا · Thank you for your business</span>
      <span style="font-weight:700;color:${fg || accent}">Canar Accounting · كنار المحاسبية</span>
      <span style="font-family:ui-monospace,monospace;font-weight:700;color:${fg || accent}">${esc(org.name)} · ${esc(d.ref)}</span>
    </div>`;

  // ---- Structure 1: Boxed Grid (default, unchanged look) ----
  const assembleBoxed = () => `
  <div class="doc" style="max-width:820px;margin:0 auto;color:${ink};background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 0 rgba(0,0,0,.02)">
    <div style="height:6px;background:linear-gradient(90deg, ${accent} 0%, ${accent} 60%, ${soft} 100%)"></div>
    <div style="padding:28px 32px 22px;display:flex;justify-content:space-between;align-items:flex-start;gap:24px">
      <div style="max-width:60%">
        ${logoBlock}
        <div style="font-size:19px;font-weight:800;color:${ink};letter-spacing:-.01em">${esc(headerOrg.name)}</div>
        <div style="font-size:11px;color:${muted};margin-top:4px">الرقم الضريبي · VAT No. ${esc(headerOrg.taxNumber)}</div>
        ${headerOrg.commercialReg ? `<div style="font-size:11px;color:${muted}">السجل التجاري · CR No. ${esc(headerOrg.commercialReg)}</div>` : ""}
        <div style="font-size:11px;color:${muted}">${esc(headerOrg.address || "المملكة العربية السعودية")}</div>
      </div>
      <div style="text-align:left;min-width:220px">
        <div style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:13px;color:${accent};font-weight:700;letter-spacing:.02em">${esc(d.ref)}</div>
        ${headerBadges ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:10px">${headerBadges}</div>` : ""}
      </div>
    </div>
    <div style="padding:0 32px 20px">
      <div style="border:1px solid ${line};border-radius:12px;padding:16px 18px;background:#fff">
        <div style="font-size:9.5px;color:${muted};font-weight:700;letter-spacing:.08em;text-transform:uppercase;margin-bottom:8px">${esc(d.partyLabel || partyRole)}${B ? " · Bill To" : ""}</div>
        ${partyBlock}
      </div>
    </div>
    <div style="padding:0 32px 22px;display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px">${metaGrid}</div>
    <div class="avoid-break" style="padding:0 32px 22px">${itemsTable("boxed")}</div>
    ${extrasHtml}
    <div class="avoid-break" style="padding:0 32px 22px;display:grid;grid-template-columns:170px 1fr 320px;gap:18px;align-items:start">
      <div>${qrBlock}${stampBlock ? `<div style="margin-top:10px;text-align:center">${stampBlock}</div>` : ""}</div>
      <div style="font-size:11px;color:${muted};padding:14px 16px;background:${soft};border-radius:12px;border-inline-start:3px solid ${accent};line-height:1.7;min-height:90px">
        ${d.notes ? `<div style="font-weight:700;color:${accent};font-size:10px;letter-spacing:.06em;text-transform:uppercase;margin-bottom:6px">ملاحظات · Notes</div>${esc(d.notes).replace(/\n/g, "<br/>")}` : `<span style="color:#b7bdb2">لا توجد ملاحظات</span>`}
      </div>
      ${totalsBlock}
    </div>
    ${contractingHtml}
    ${verifyHtml}
    ${footerLine("transparent", "")}
  </div>`;

  // ---- Structure 2: Top-Banner ----
  const assembleBanner = () => `
  <div class="doc" style="max-width:820px;margin:0 auto;color:${ink};background:#fff">
    <div style="background:${accent};color:${tpl.onAccent};padding:26px 32px;display:flex;justify-content:space-between;align-items:center;gap:24px">
      <div style="display:flex;align-items:center;gap:12px">
        ${branding?.logo && !isBill ? `<img src="${esc(branding.logo)}" alt="logo" style="max-height:48px;object-fit:contain;filter:brightness(0) invert(1);opacity:.95" />` : `<div style="width:40px;height:40px;border-radius:8px;background:${tpl.onAccent}22;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:16px">${esc((headerOrg.name || "H").trim().charAt(0))}</div>`}
        <div>
          <div style="font-size:18px;font-weight:800">${esc(headerOrg.name)}</div>
          <div style="font-size:10.5px;opacity:.85">VAT ${esc(headerOrg.taxNumber)}${headerOrg.commercialReg ? ` · CR ${esc(headerOrg.commercialReg)}` : ""}</div>
        </div>
      </div>
      <div style="text-align:left">
        <div style="font-family:ui-monospace,monospace;font-size:12px;opacity:.9">${esc(d.ref)}</div>
        ${headerBadges ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;justify-content:flex-end">${headerBadges}</div>` : ""}
      </div>
    </div>
    <div style="padding:22px 32px 0;display:grid;grid-template-columns:1fr 1fr;gap:16px">
      <div style="border-bottom:1px solid ${line};padding-bottom:14px">
        <div style="font-size:9.5px;color:${muted};font-weight:700;letter-spacing:.08em;text-transform:uppercase;margin-bottom:6px">${esc(d.partyLabel || partyRole)}</div>
        ${partyBlock}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;align-content:start;border-bottom:1px solid ${line};padding-bottom:14px">${metaGrid}</div>
    </div>
    <div class="avoid-break" style="padding:22px 32px 22px">${itemsTable("boxed")}</div>
    ${extrasHtml}
    <div class="avoid-break" style="padding:0 32px 22px;display:grid;grid-template-columns:170px 1fr 320px;gap:18px;align-items:start">
      <div>${qrBlock}${stampBlock ? `<div style="margin-top:10px;text-align:center">${stampBlock}</div>` : ""}</div>
      <div style="font-size:11px;color:${muted};padding:14px 0;border-top:1px solid ${line};line-height:1.7;min-height:90px">
        ${d.notes ? `<div style="font-weight:700;color:${accent};font-size:10px;letter-spacing:.06em;text-transform:uppercase;margin-bottom:6px">ملاحظات · Notes</div>${esc(d.notes).replace(/\n/g, "<br/>")}` : `<span style="color:#b7bdb2">لا توجد ملاحظات</span>`}
      </div>
      ${totalsBlock}
    </div>
    ${contractingHtml}
    ${verifyHtml}
    ${footerLine(accent, tpl.onAccent)}
  </div>`;

  // ---- Structure 3: Minimalist ----
  const assembleMinimal = () => `
  <div class="doc" style="max-width:820px;margin:0 auto;color:${ink};background:#fff">
    <div style="padding:30px 8px 20px;display:flex;justify-content:space-between;align-items:flex-start;gap:24px;border-bottom:2px solid ${ink}">
      <div>
        <div style="font-size:17px;font-weight:700;color:${ink}">${esc(headerOrg.name)}</div>
        <div style="font-size:10.5px;color:${muted};margin-top:3px">VAT ${esc(headerOrg.taxNumber)}${headerOrg.commercialReg ? ` · CR ${esc(headerOrg.commercialReg)}` : ""}</div>
        <div style="font-size:10.5px;color:${muted}">${esc(headerOrg.address || "")}</div>
      </div>
      <div style="text-align:left">
        <div style="font-family:ui-monospace,monospace;font-size:11px;color:${muted};margin-top:2px">${esc(d.ref)} · ${esc(d.date)}</div>
      </div>
    </div>
    <div style="padding:16px 8px;display:flex;justify-content:space-between;gap:24px;font-size:11px;color:${muted};border-bottom:1px solid ${line}">
      <div>${esc(d.partyLabel || partyRole)}: <strong style="color:${ink}">${esc(recipientParty?.name || "—")}</strong>${recipientParty?.taxNumber ? ` · VAT ${esc(recipientParty.taxNumber)}` : ""}</div>
      <div>${d.dueDate || d.expiry ? `${d.expiry ? "الصلاحية" : "الاستحقاق"}: <strong style="color:${ink}">${esc(d.expiry || d.dueDate)}</strong>` : ""}</div>
    </div>
    <div class="avoid-break" style="padding:20px 8px">${itemsTable("lines")}</div>
    ${extrasHtml.replace(/padding:0 32px 22px/g, "padding:0 8px 20px")}
    <div class="avoid-break" style="padding:8px 8px 20px;display:grid;grid-template-columns:1fr 240px;gap:24px;align-items:start">
      <div style="font-size:11px;color:${muted};line-height:1.7">
        ${d.notes ? `<div style="font-weight:700;color:${accent};font-size:10px;letter-spacing:.06em;text-transform:uppercase;margin-bottom:6px">ملاحظات</div>${esc(d.notes).replace(/\n/g, "<br/>")}` : ""}
        ${qrBlock ? `<div style="margin-top:14px">${qrBlock}</div>` : ""}
      </div>
      <div>
        ${[
          ["المجموع الفرعي", fmt(d.subtotal)],
          ["الضريبة", fmt(d.tax)],
        ].map(([l, v]) => `<div style="display:flex;justify-content:space-between;padding:5px 0;font-size:11px;color:${muted}"><span>${l}</span><span class="tabular-nums">${v} ${esc(currency)}</span></div>`).join("")}
        <div style="display:flex;justify-content:space-between;padding:10px 0 0;margin-top:6px;border-top:1.5px solid ${ink};font-weight:700;font-size:14px;color:${ink}"><span>الإجمالي</span><span>${fmt(d.total)} ${esc(currency)}</span></div>
      </div>
    </div>
    ${contractingHtml.replace(/padding:0 32px 22px/g, "padding:0 8px 20px")}
    ${verifyHtml}
    <div style="padding:16px 8px;border-top:1px solid ${line};font-size:10px;color:${muted};text-align:center">${esc(org.name)} · ${esc(d.ref)}</div>
  </div>`;

  // ---- Structure 4: Classic Corporate ----
  const assembleCorporate = () => `
  <div class="doc" style="max-width:820px;margin:0 auto;color:${ink};background:#fff;border:3px double ${ink};padding:4px">
    <div style="border:1px solid ${line};padding:26px 32px 20px;text-align:center">
      ${branding?.logo && !isBill ? `<img src="${esc(branding.logo)}" alt="logo" style="max-height:52px;object-fit:contain;margin:0 auto 8px" />` : ""}
      <div style="font-size:20px;font-weight:800;color:${ink}">${esc(headerOrg.name)}</div>
      <div style="font-size:10.5px;color:${muted};margin-top:4px">VAT ${esc(headerOrg.taxNumber)}${headerOrg.commercialReg ? ` · CR ${esc(headerOrg.commercialReg)}` : ""}</div>
      <div style="font-size:10.5px;color:${muted}">${esc(headerOrg.address || "المملكة العربية السعودية")}</div>
      <div style="margin:16px auto 0;width:64px;height:2px;background:${accent}"></div>
      <div style="font-family:ui-monospace,monospace;font-size:12px;color:${muted};margin-top:12px">${esc(d.ref)}</div>
    </div>
    <div style="padding:18px 32px;display:grid;grid-template-columns:1fr 1fr;border:1px solid ${line};border-top:0">
      <div style="padding-inline-end:16px;border-inline-end:1px solid ${line}">
        <div style="font-size:9.5px;color:${muted};font-weight:700;letter-spacing:.08em;text-transform:uppercase;margin-bottom:8px">${esc(d.partyLabel || partyRole)}</div>
        ${partyBlock}
      </div>
      <div style="padding-inline-start:16px;display:grid;gap:6px;font-size:11px;color:${ink}">
        <div>التاريخ: <strong>${esc(d.date)}</strong></div>
        <div>${d.expiry ? "الصلاحية" : "الاستحقاق"}: <strong>${esc(d.expiry || d.dueDate || "—")}</strong></div>
        ${d.poNumber ? `<div>أمر الشراء: <strong>${esc(d.poNumber)}</strong></div>` : ""}
      </div>
    </div>
    <div class="avoid-break" style="padding:20px 32px">${itemsTable("grid")}</div>
    ${extrasHtml}
    <div class="avoid-break" style="padding:0 32px 20px;display:grid;grid-template-columns:170px 1fr 320px;gap:18px;align-items:start">
      <div>${qrBlock}${stampBlock ? `<div style="margin-top:10px;text-align:center">${stampBlock}</div>` : ""}</div>
      <div style="font-size:11px;color:${muted};border:1px solid ${line};padding:14px 16px;line-height:1.7;min-height:90px">
        ${d.notes ? `<div style="font-weight:700;color:${accent};font-size:10px;letter-spacing:.06em;text-transform:uppercase;margin-bottom:6px">ملاحظات</div>${esc(d.notes).replace(/\n/g, "<br/>")}` : `<span style="color:#b7bdb2">لا توجد ملاحظات</span>`}
      </div>
      <div style="border:1px solid ${line}">${totalsBlock.replace(/border:1px solid[^;]+;border-radius:12px;overflow:hidden/, "border:0")}</div>
    </div>
    ${contractingHtml}
    ${verifyHtml}
    <div style="padding:24px 32px 8px;display:grid;grid-template-columns:1fr 1fr;gap:24px;font-size:10.5px;color:${muted}">
      <div style="text-align:center;border-top:1px solid ${ink};padding-top:6px">توقيع المُصدر · Issued By</div>
      <div style="text-align:center;border-top:1px solid ${ink};padding-top:6px">توقيع المستلم · Received By</div>
    </div>
    <div style="padding:12px 32px 18px;text-align:center;font-size:10px;color:${muted}">${esc(org.name)} · ${esc(d.ref)}</div>
  </div>`;

  // ---- Structure 5: Vertical Thermal Receipt (80mm/57mm POS rolls) ----
  // Narrow, centered, single-column — built independently of itemsTable()
  // since a thermal receipt lists items as stacked "qty × price" lines, not
  // a multi-column table. QR/party/totals data is still the same source.
  const assembleThermal = () => {
    const rollMm = d.thermalWidth === "57mm" ? 57 : 80;
    const contentMm = rollMm - 6; // ~3mm margin each side
    const itemRows = lines.map((l, i) => {
      const c = lineCalcs[i] || { net: 0, taxAmt: 0, gross: 0 };
      return `
        <div style="padding:6px 0;border-bottom:1px dashed ${line}">
          <div style="font-size:11px;font-weight:700;color:${ink}">${esc(l.description || "—")}</div>
          <div style="display:flex;justify-content:space-between;font-size:10px;color:${muted};margin-top:2px">
            <span>${esc(l.qty)} × ${fmt(l.price)}${isSupply && l.unit ? ` ${esc(l.unit)}` : ""}</span>
            <span style="font-weight:700;color:${ink}">${fmt(c.gross)}</span>
          </div>
        </div>`;
    }).join("");

    return `
    <div class="doc" style="max-width:${contentMm}mm;margin:0 auto;color:${ink};background:#fff;font-family:'Courier New',ui-monospace,monospace;padding:6mm 3mm">
      <div style="text-align:center;padding-bottom:8px;border-bottom:1px dashed ${ink}">
        ${branding?.logo ? `<img src="${esc(branding.logo)}" alt="logo" style="max-height:40px;object-fit:contain;margin:0 auto 6px" />` : ""}
        <div style="font-size:13px;font-weight:800;color:${ink}">${esc(headerOrg.name)}</div>
        <div style="font-size:9.5px;color:${muted};margin-top:3px">ض.ب: ${esc(headerOrg.taxNumber)}</div>
        ${headerOrg.commercialReg ? `<div style="font-size:9.5px;color:${muted}">س.ت: ${esc(headerOrg.commercialReg)}</div>` : ""}
        ${headerOrg.address ? `<div style="font-size:9px;color:${muted};margin-top:2px">${esc(headerOrg.address)}</div>` : ""}
      </div>

      <div style="text-align:center;padding:10px 0;border-bottom:1px dashed ${ink}">
        <div style="font-size:9.5px;color:${muted}">${esc(d.ref)}</div>
        <div style="font-size:9px;color:${muted};margin-top:2px;direction:ltr;display:inline-block">${esc(d.issuedAtIso ? formatTs(d.issuedAtIso) : d.date)}</div>
      </div>

      <div style="padding:8px 0">${itemRows || `<div style="text-align:center;padding:16px 0;color:#b7bdb2;font-size:10px">لا توجد بنود</div>`}</div>

      <div style="border-top:1px dashed ${ink};padding:8px 0;font-size:10.5px">
        <div style="display:flex;justify-content:space-between;padding:3px 0"><span style="color:${muted}">المجموع الفرعي</span><span>${fmt(d.subtotal)} ${esc(currency)}</span></div>
        <div style="display:flex;justify-content:space-between;padding:3px 0"><span style="color:${muted}">ضريبة القيمة المضافة 15%</span><span>${fmt(d.tax)} ${esc(currency)}</span></div>
        <div style="display:flex;justify-content:space-between;padding:6px 0;margin-top:4px;border-top:1px solid ${ink};font-weight:800;font-size:13px"><span>الإجمالي</span><span>${fmt(d.total)} ${esc(currency)}</span></div>
      </div>

      <div style="border-top:1px dashed ${line};padding:6px 0;font-size:9px;color:${muted};text-align:center;line-height:1.5">
        المبلغ بالحروف: ${esc(amountToWordsArabic(d.total))}
      </div>

      ${qrBlock ? `<div style="text-align:center;padding:10px 0">${qrBlock}</div>` : ""}

      ${d.notes ? `<div style="text-align:center;font-size:9px;color:${muted};padding:4px 0;border-top:1px dashed ${line}">${esc(d.notes)}</div>` : ""}

      <div style="text-align:center;padding-top:8px;border-top:1px dashed ${ink};font-size:9.5px;color:${muted}">
        شكراً لزيارتكم · Thank you
      </div>
    </div>`;
  };

  const structure = d.structure ?? "boxed";
  return structure === "banner" ? assembleBanner()
    : structure === "minimal" ? assembleMinimal()
    : structure === "corporate" ? assembleCorporate()
    : structure === "thermal" ? assembleThermal()
    : assembleBoxed();
}

/**
 * Rasterizes the supplier's original scanned file (image or PDF, from a data:
 * URL or a remote/signed URL) into one or more full-page <img> blocks so it
 * can be appended after the generated invoice in the same print job — PDFs
 * are rendered via pdf.js into PNG data URLs (an <iframe src> for a foreign
 * PDF is blocked/blank inside sandboxed preview environments, and a plain
 * <img src="...pdf"> doesn't render a PDF at all).
 */
async function buildAttachmentPagesHtml(url: string, mime?: string, label?: string): Promise<string> {
  const isPdf = mime === "application/pdf" || url.startsWith("data:application/pdf") || /\.pdf($|\?)/i.test(url);
  const header = `<div style="padding:14px 0 10px;text-align:center;font-size:11px;color:#6b7469;font-weight:700;letter-spacing:.04em">${esc(label || "النسخة الأصلية الممسوحة · Original Scanned Copy")}</div>`;

  const pageWrap = (imgSrc: string) =>
    `<div style="page-break-before:always;padding:8px 0;display:flex;align-items:center;justify-content:center">
       <img src="${esc(imgSrc)}" style="max-width:100%;max-height:277mm;object-fit:contain" />
     </div>`;

  if (!isPdf) {
    return `${header}${pageWrap(url)}`;
  }

  try {
    const pdfjs: any = await import("pdfjs-dist");
    const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

    let source: any;
    if (url.startsWith("data:")) {
      const b64 = url.split(",")[1] || "";
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      source = { data: bytes };
    } else {
      source = { url };
    }

    const doc = await pdfjs.getDocument(source).promise;
    let pages = "";
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;
      pages += pageWrap(canvas.toDataURL("image/png"));
    }
    doc.destroy?.();
    return pages ? `${header}${pages}` : "";
  } catch (e) {
    console.error("[print] failed to rasterize original PDF for merge", e);
    return "";
  }
}

export async function printDoc(d: PrintDocData & { attachment?: { url: string; mime?: string; label?: string } }) {
  if (typeof window === "undefined") return;
  const safeDoc: PrintDocData = {
    ...d,
    title: d.title || "Document",
    titleEn: d.titleEn || "Document",
    ref: d.ref || "",
    date: d.date || "",
    dueDate: d.dueDate || "",
    expiry: d.expiry || "",
    org: d.org ?? { name: "", taxNumber: "", address: "" },
    party: d.party ?? null,
    partyLabel: d.partyLabel || "الطرف",
    lines: Array.isArray(d.lines) ? d.lines : [],
    lineCalcs: Array.isArray(d.lineCalcs) ? d.lineCalcs : [],
    subtotal: Number.isFinite(Number(d.subtotal)) ? Number(d.subtotal) : 0,
    tax: Number.isFinite(Number(d.tax)) ? Number(d.tax) : 0,
    total: Number.isFinite(Number(d.total)) ? Number(d.total) : 0,
    currency: d.currency || "SAR",
    tpl: d.tpl ?? { name: "Default", accent: "#0f2a1d", onAccent: "#ffffff", soft: "#fafaf7" },
  };
  const inner = buildDocHtml(safeDoc);
  const attachmentHtml = d.attachment?.url
    ? await buildAttachmentPagesHtml(d.attachment.url, d.attachment.mime, d.attachment.label)
    : "";
  const isThermal = d.structure === "thermal";
  const thermalRollMm = d.thermalWidth === "57mm" ? 57 : 80;
  const pageRule = isThermal
    ? `@page { size: ${thermalRollMm}mm auto; margin: 0; }`
    : `@page { size: A4; margin: 10mm 12mm; }`;
  // A4 structures reset .doc to full page width on print; a thermal receipt
  // must keep its narrow roll width instead, or it prints stretched to A4.
  const docPrintWidthRule = isThermal
    ? `.doc{box-shadow:none;max-width:${thermalRollMm}mm}`
    : `.doc{box-shadow:none;border-radius:0;max-width:none}`;
  const doc = `<!doctype html><html dir="rtl" lang="ar"><head>
    <meta charset="utf-8" />
    <title>${esc(safeDoc.title)} ${esc(safeDoc.ref)}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap" rel="stylesheet" />
    <style>
      *{box-sizing:border-box}
      html,body{margin:0;padding:0;background:#fff}
      body{font-family:Cairo,"Segoe UI",Tahoma,system-ui,sans-serif;padding:${isThermal ? "0" : "18px"};color:#0f2a1d;font-size:12px;line-height:1.5;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      ${pageRule}
      .avoid-break{break-inside:avoid;page-break-inside:avoid}
      @media print {
        body{padding:0}
        ${docPrintWidthRule}
        thead{display:table-header-group}
        tfoot{display:table-footer-group}
        tr{break-inside:avoid;page-break-inside:avoid}
        table{break-inside:auto;page-break-inside:auto}
      }
    </style>
  </head><body>${inner}${attachmentHtml}</body></html>`;

  const openInNewWindow = () => {
    const win = window.open("", "_blank", "width=900,height=1000");
    if (!win) return false;
    win.document.open();
    win.document.write(doc);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 600);
    return true;
  };

  // A print() call from a *doubly*-nested iframe (our hidden print frame,
  // inside a host page that is itself embedded in another iframe — e.g. an
  // editor/preview embed) is silently blocked by some browsers' sandboxing
  // with no error at all. In that case skip straight to a real top-level
  // popup window, which isn't subject to that restriction.
  const inIframe = (() => {
    try {
      return window.top !== window.self;
    } catch {
      return true; // cross-origin access throws — assume nested/sandboxed
    }
  })();
  if (inIframe) {
    if (!openInNewWindow()) {
      console.error("[print] blocked: nested iframe context and popup blocked — allow popups for this site to print");
    }
    return;
  }

  // Prefer hidden iframe (no popup blocker). Fall back to window.open.
  // The iframe must have real, non-zero dimensions off-screen: a 0x0 (or
  // display:none / visibility:hidden) frame never gets laid out, so the
  // browser's print preview renders blank even though print() is called.
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.left = "-10000px";
  iframe.style.top = "0";
  iframe.style.width = isThermal ? `${thermalRollMm}mm` : "210mm";
  iframe.style.height = isThermal ? "auto" : "297mm";
  iframe.style.minHeight = isThermal ? "400mm" : "auto";
  iframe.style.border = "0";
  iframe.setAttribute("aria-hidden", "true");
  document.body.appendChild(iframe);
  const w = iframe.contentWindow;
  if (!w) {
    document.body.removeChild(iframe);
    if (!openInNewWindow()) {
      console.error("[print] blocked: no iframe window and popup blocked — allow popups for this site to print");
    }
    return;
  }
  w.document.open();
  w.document.write(doc);
  w.document.close();
  const trigger = () => {
    try {
      w.focus();
      w.print();
    } catch (e) {
      // Nested-frame print rejected by the browser at call time — fall back
      // to a real top-level window instead of failing silently.
      console.error("[print] iframe print() failed, falling back to a new window", e);
      document.body.removeChild(iframe);
      openInNewWindow();
      return;
    }
    setTimeout(() => {
      try { document.body.removeChild(iframe); } catch { /* noop */ }
    }, 1500);
  };
  // Wait for images (logo/stamp/QR) & fonts to render
  const imgs = Array.from(w.document.images);
  if (imgs.length === 0) {
    setTimeout(trigger, 400);
  } else {
    let pending = imgs.length;
    const done = () => { if (--pending <= 0) setTimeout(trigger, 250); };
    imgs.forEach((img) => {
      if (img.complete) done();
      else {
        img.addEventListener("load", done);
        img.addEventListener("error", done);
      }
    });
    // Safety net
    setTimeout(trigger, 2500);
  }
}
