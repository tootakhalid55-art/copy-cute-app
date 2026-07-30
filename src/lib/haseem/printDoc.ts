// Self-contained printable document builder.
// Renders an HTML string with inline styles (no Tailwind dependency),
// then prints via a hidden iframe so popup blockers can't interfere.
import { formatTimestamp as formatTs } from "./zatca";


export type PrintLine = { description: string; qty: number; price: number; tax: number; discount?: number };
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
  kind?: "invoice" | "quotation" | "credit-note" | "purchase-order" | "bill";
  title: string;              // e.g. "فاتورة ضريبية"
  titleEn?: string;           // e.g. "Tax Invoice"
  variant?: "standard" | "simplified";  // ZATCA invoice type
  issuedAtIso?: string;       // exact ZATCA timestamp
  ref: string;
  date: string;
  dueDate?: string;
  expiry?: string;
  org: { name: string; taxNumber: string; address?: string };
  party?: { name?: string; taxNumber?: string; phone?: string; email?: string; address?: string } | null;
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
};


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
  const isQuotation = kind === "quotation";
  const isPurchase = kind === "purchase-order" || kind === "bill";

  const vatRate = 15;
  const lineTaxRows = lines.map((l, i) => {
    const c = lineCalcs[i] || { net: 0, taxAmt: 0, gross: 0 };
    const rate = Number.isFinite(Number(l.tax)) ? Number(l.tax) : vatRate;
    return { line: l, calc: c, rate };
  });
  const taxSummaryRows = isInvoice
    ? lineTaxRows.map((row, i) => `
        <tr>
          <td style="padding:8px 10px;border-bottom:1px solid ${line};text-align:center;color:${muted};font-variant-numeric:tabular-nums">${String(i + 1).padStart(2, "0")}</td>
          <td style="padding:8px 10px;border-bottom:1px solid ${line};text-align:right;color:${ink}">${esc(row.line.description || "—")}</td>
          <td style="padding:8px 10px;border-bottom:1px solid ${line};text-align:center;font-variant-numeric:tabular-nums">${fmt(row.calc.net)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid ${line};text-align:center;font-variant-numeric:tabular-nums">${row.rate.toFixed(0)}%</td>
          <td style="padding:8px 10px;border-bottom:1px solid ${line};text-align:center;font-variant-numeric:tabular-nums">${fmt(row.calc.taxAmt)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid ${line};text-align:center;font-variant-numeric:tabular-nums;font-weight:700">${fmt(row.calc.gross)}</td>
        </tr>`)
    .join("")
    : "";

  const partyBlock = party && (party.name || party.taxNumber || party.phone)
    ? `<div style="font-size:14px;font-weight:700;color:${ink};margin-bottom:6px;letter-spacing:.01em">${esc(party.name || "—")}</div>
       <div style="display:grid;gap:3px;font-size:11px;color:${muted}">
         ${party.taxNumber ? `<div><span style="color:${accent};font-weight:600">الرقم الضريبي · VAT No. </span>${esc(party.taxNumber)}</div>` : ""}
         ${!simplified && party.address ? `<div><span style="color:${accent};font-weight:600">العنوان · Address </span>${esc(party.address)}</div>` : ""}
         ${party.phone ? `<div><span style="color:${accent};font-weight:600">الجوال · Phone </span>${esc(party.phone)}</div>` : ""}
         ${!simplified && party.email ? `<div><span style="color:${accent};font-weight:600">البريد · Email </span>${esc(party.email)}</div>` : ""}
       </div>`
    : `<span style="color:#b7bdb2">${simplified ? "عميل نقدي · Cash customer" : "—"}</span>`;

  const partyRole = d.partyRole || (isPurchase ? "المورد" : "الطرف");
  const headerBadges = [
    d.statusLabel ? `<span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:999px;background:${soft};color:${accent};font-size:10px;font-weight:700;border:1px solid ${accent}33">${esc(d.statusLabel)}</span>` : "",
    d.approvalLabel ? `<span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:999px;background:#fff;color:${ink};font-size:10px;font-weight:700;border:1px solid ${line}">${esc(d.approvalLabel)}</span>` : "",
  ].filter(Boolean).join(" ");

  const rows = lines
    .map((l, i) => {
      const c = lineCalcs[i] || { net: 0, taxAmt: 0, gross: 0 };
      const bd = `border-bottom:1px solid ${line}`;
      return `<tr class="avoid-break">
        <td style="${bd};padding:12px 8px;text-align:center;color:${muted};font-size:10.5px;font-variant-numeric:tabular-nums">${String(i + 1).padStart(2, "0")}</td>
        <td style="${bd};padding:12px 10px;text-align:right;color:${ink}">
          <div style="font-weight:600;font-size:12px;line-height:1.5">${esc(l.description || "—")}</div>
        </td>
        <td style="${bd};padding:12px 8px;text-align:center;font-variant-numeric:tabular-nums;color:${ink}">${esc(l.qty)}</td>
        <td style="${bd};padding:12px 8px;text-align:center;font-variant-numeric:tabular-nums;color:${ink}">${fmt(l.price)}</td>
        <td style="${bd};padding:12px 8px;text-align:center;font-variant-numeric:tabular-nums;color:${muted}">${fmt(l.discount ?? 0)}</td>
        <td style="${bd};padding:12px 8px;text-align:center;font-variant-numeric:tabular-nums;color:${muted}">${fmt(c.net)}</td>
        <td style="${bd};padding:12px 8px;text-align:center;font-variant-numeric:tabular-nums;color:${muted}">${fmt(c.taxAmt)} <span style="opacity:.55;font-size:9px">(${esc(l.tax)}%)</span></td>
        <td style="${bd};padding:12px 10px;text-align:center;font-variant-numeric:tabular-nums;color:${ink};font-weight:700">${fmt(c.gross)}</td>
      </tr>`;
    })
    .join("");

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
    </div>`;

  const stampBlock = branding?.stamp
    ? `<img src="${esc(branding.stamp)}" alt="stamp" style="max-height:90px;object-fit:contain;opacity:.9" />`
    : "";
  const qrBlock = d.qrDataUrl
    ? `<div style="text-align:center;background:#fff;padding:10px;border:1px solid ${line};border-radius:12px;display:inline-block">
         <img src="${esc(d.qrDataUrl)}" alt="ZATCA QR" width="118" height="118" />
         <div style="font-size:9.5px;color:${muted};margin-top:4px;font-weight:600;letter-spacing:.04em">ZATCA · هيئة الزكاة</div>
       </div>`
    : "";

  const logoBlock = branding?.logo
    ? `<img src="${esc(branding.logo)}" alt="logo" style="max-height:56px;object-fit:contain;margin-bottom:10px" />`
    : `<div style="width:44px;height:44px;border-radius:10px;background:${accent};color:${tpl.onAccent};display:flex;align-items:center;justify-content:center;font-weight:800;font-size:18px;margin-bottom:10px">${esc((org.name || "H").trim().charAt(0))}</div>`;

  return `
  <div class="doc" style="max-width:820px;margin:0 auto;color:${ink};background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 0 rgba(0,0,0,.02)">
    <div style="height:6px;background:linear-gradient(90deg, ${accent} 0%, ${accent} 60%, ${soft} 100%)"></div>

    <div style="padding:28px 32px 22px;display:flex;justify-content:space-between;align-items:flex-start;gap:24px">
      <div style="max-width:60%">
        ${logoBlock}
        <div style="font-size:19px;font-weight:800;color:${ink};letter-spacing:-.01em">${esc(org.name)}</div>
        <div style="font-size:11px;color:${muted};margin-top:4px">الرقم الضريبي · VAT No. ${esc(org.taxNumber)}</div>
        <div style="font-size:11px;color:${muted}">${esc(org.address || "المملكة العربية السعودية")}</div>
        ${org.address ? `<div style="font-size:11px;color:${muted}">المملكة العربية السعودية · Kingdom of Saudi Arabia</div>` : ""}
      </div>
      <div style="text-align:left;min-width:220px">
        <div style="display:inline-block;padding:5px 12px;background:${soft};color:${accent};font-size:10.5px;font-weight:700;border-radius:999px;letter-spacing:.06em;text-transform:uppercase;margin-bottom:10px">${esc(d.titleEn || "Document")}</div>
        <div style="font-size:22px;font-weight:800;color:${ink};margin-bottom:6px;letter-spacing:-.01em">${esc(d.title)}</div>
        <div style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:13px;color:${accent};font-weight:700;letter-spacing:.02em">${esc(d.ref)}</div>
        ${headerBadges ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:10px">${headerBadges}</div>` : ""}
      </div>
    </div>

    <div style="padding:0 32px 20px">
      <div style="border:1px solid ${line};border-radius:12px;padding:16px 18px;background:#fff">
        <div style="font-size:9.5px;color:${muted};font-weight:700;letter-spacing:.08em;text-transform:uppercase;margin-bottom:8px">${esc(d.partyLabel || partyRole)}${B ? " · Bill To" : ""}${simplified ? ` <span style="font-weight:400;text-transform:none;opacity:.7">(اختياري · optional)</span>` : ""}</div>
        ${partyBlock}
      </div>
    </div>

    <div style="padding:0 32px 22px;display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px">
      ${metaGrid}
    </div>

    <div class="avoid-break" style="padding:0 32px 22px">
      <table style="width:100%;border-collapse:collapse;font-size:11px;background:#fff;border:1px solid ${line};border-radius:12px;overflow:hidden">
        <thead>
          <tr style="background:${soft}">
            <th style="padding:11px 8px;text-align:center;width:36px;font-size:9.5px;color:${muted};font-weight:700;letter-spacing:.06em;text-transform:uppercase">#</th>
            <th style="padding:11px 10px;text-align:right;font-size:9.5px;color:${muted};font-weight:700;letter-spacing:.06em;text-transform:uppercase">الوصف${en("Description")}</th>
            <th style="padding:11px 8px;text-align:center;width:56px;font-size:9.5px;color:${muted};font-weight:700;letter-spacing:.06em;text-transform:uppercase">الكمية${en("Qty")}</th>
            <th style="padding:11px 8px;text-align:center;width:78px;font-size:9.5px;color:${muted};font-weight:700;letter-spacing:.06em;text-transform:uppercase">السعر${en("Unit Price")}</th>
            <th style="padding:11px 8px;text-align:center;width:70px;font-size:9.5px;color:${muted};font-weight:700;letter-spacing:.06em;text-transform:uppercase">الخصم${en("Discount")}</th>
            <th style="padding:11px 8px;text-align:center;width:86px;font-size:9.5px;color:${muted};font-weight:700;letter-spacing:.06em;text-transform:uppercase">${isInvoice ? `خاضع للضريبة${en("Taxable")}` : `المبلغ${en("Amount")}`}</th>
            ${isInvoice ? `<th style="padding:11px 8px;text-align:center;width:95px;font-size:9.5px;color:${muted};font-weight:700;letter-spacing:.06em;text-transform:uppercase">الضريبة${en("VAT")}</th>` : ""}
            <th style="padding:11px 10px;text-align:center;width:98px;font-size:9.5px;color:${muted};font-weight:700;letter-spacing:.06em;text-transform:uppercase">الإجمالي${en("Line Total")}</th>
          </tr>
        </thead>
        <tbody>${
          isInvoice
            ? taxSummaryRows || `<tr><td colspan="6" style="padding:24px;text-align:center;color:#b7bdb2;font-size:11px">لا توجد بنود</td></tr>`
            : rows || `<tr><td colspan="8" style="padding:24px;text-align:center;color:#b7bdb2;font-size:11px">لا توجد بنود</td></tr>`
        }</tbody>

      </table>
    </div>

    ${isCreditNote ? `
    <div style="padding:0 32px 22px">
      <div style="border:1px solid ${line};border-radius:12px;padding:14px 18px;background:${soft}">
        <div style="font-size:9.5px;color:${muted};font-weight:700;letter-spacing:.08em;text-transform:uppercase;margin-bottom:8px">مرجع الإشعار الدائن · Credit Note Reference</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;font-size:12px;color:${ink}">
          <div><span style="color:${muted};font-size:10px">المستند الأصلي</span><div style="font-weight:700">${esc(d.originalRef || d.reference || "—")}</div></div>
          <div><span style="color:${muted};font-size:10px">سبب الإصدار</span><div style="font-weight:700">${esc(d.reason || d.notes || "—")}</div></div>
        </div>
      </div>
    </div>` : ""}

    ${isQuotation ? `
    <div style="padding:0 32px 22px">
      <div style="border:1px solid ${line};border-radius:12px;padding:14px 18px;background:${soft}">
        <div style="font-size:9.5px;color:${muted};font-weight:700;letter-spacing:.08em;text-transform:uppercase;margin-bottom:8px">تفاصيل العرض · Quote Terms</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;font-size:12px;color:${ink}">
          <div><span style="color:${muted};font-size:10px">صلاحية العرض</span><div style="font-weight:700">${esc(d.expiry || d.dueDate || "—")}</div></div>
          <div><span style="color:${muted};font-size:10px">الشروط</span><div style="font-weight:700">${esc(d.terms || d.notes || "—")}</div></div>
        </div>
      </div>
    </div>` : ""}

    ${isPurchase ? `
    <div style="padding:0 32px 22px">
      <div style="border:1px solid ${line};border-radius:12px;padding:14px 18px;background:${soft}">
        <div style="font-size:9.5px;color:${muted};font-weight:700;letter-spacing:.08em;text-transform:uppercase;margin-bottom:8px">${kind === "bill" ? "بيانات فاتورة المورد · Supplier Bill" : "بيانات أمر الشراء · Purchase Order"}</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;font-size:12px;color:${ink}">
          <div><span style="color:${muted};font-size:10px">${kind === "bill" ? "المورد" : "الجهة الموردة"}</span><div style="font-weight:700">${esc(party?.name || d.partyLabel || "—")}</div></div>
          <div><span style="color:${muted};font-size:10px">المرجع</span><div style="font-weight:700">${esc(d.reference || d.poNumber || "—")}</div></div>
        </div>
      </div>
    </div>` : ""}

    <div class="avoid-break" style="padding:0 32px 22px;display:grid;grid-template-columns:170px 1fr 320px;gap:18px;align-items:start">
      <div>${qrBlock}${stampBlock ? `<div style="margin-top:10px;text-align:center">${stampBlock}</div>` : ""}</div>
      <div style="font-size:11px;color:${muted};padding:14px 16px;background:${soft};border-radius:12px;border-inline-start:3px solid ${accent};line-height:1.7;min-height:90px">
        ${d.notes ? `<div style="font-weight:700;color:${accent};font-size:10px;letter-spacing:.06em;text-transform:uppercase;margin-bottom:6px">ملاحظات · Notes</div>${esc(d.notes).replace(/\n/g, "<br/>")}` : `<span style="color:#b7bdb2">لا توجد ملاحظات</span>`}
      </div>
      ${totalsBlock}
    </div>

    ${d.verify ? `
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
    </div>` : ""}

    <div style="padding:16px 32px 22px;border-top:1px solid ${line};display:flex;justify-content:space-between;align-items:center;font-size:10.5px;color:${muted}">
      <span>شكراً لتعاملكم معنا · Thank you for your business</span>
      <span style="font-weight:700;color:${accent}">Canar Accounting · كنار المحاسبية</span>
      <span style="font-family:ui-monospace,monospace;color:${accent};font-weight:700">${esc(org.name)} · ${esc(d.ref)}</span>
    </div>
  </div>`;
}

export function printDoc(d: PrintDocData) {
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
  const doc = `<!doctype html><html dir="rtl" lang="ar"><head>
    <meta charset="utf-8" />
    <title>${esc(safeDoc.title)} ${esc(safeDoc.ref)}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap" rel="stylesheet" />
    <style>
      *{box-sizing:border-box}
      html,body{margin:0;padding:0;background:#fff}
      body{font-family:Cairo,"Segoe UI",Tahoma,system-ui,sans-serif;padding:18px;color:#0f2a1d;font-size:12px;line-height:1.5;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      @page { size: A4; margin: 10mm 12mm; }
      .avoid-break{break-inside:avoid;page-break-inside:avoid}
      @media print {
        body{padding:0}
        .doc{box-shadow:none;border-radius:0;max-width:none}
        thead{display:table-header-group}
        tfoot{display:table-footer-group}
        tr{break-inside:avoid;page-break-inside:avoid}
        table{break-inside:auto;page-break-inside:auto}
      }
    </style>
  </head><body>${inner}</body></html>`;

  // Prefer hidden iframe (no popup blocker). Fall back to window.open.
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.setAttribute("aria-hidden", "true");
  document.body.appendChild(iframe);
  const w = iframe.contentWindow;
  if (!w) {
    document.body.removeChild(iframe);
    const win = window.open("", "_blank", "width=900,height=1000");
    if (!win) return;
    win.document.open();
    win.document.write(doc);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 600);
    return;
  }
  w.document.open();
  w.document.write(doc);
  w.document.close();
  const trigger = () => {
    try {
      w.focus();
      w.print();
    } catch {
      /* noop */
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
