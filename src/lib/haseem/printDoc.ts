// Self-contained printable document builder.
// Renders an HTML string with inline styles (no Tailwind dependency),
// then prints via a hidden iframe so popup blockers can't interfere.

export type PrintLine = { description: string; qty: number; price: number; tax: number };
export type PrintLineCalc = { net: number; taxAmt: number; gross: number };

export type PrintTpl = { name: string; accent: string; onAccent: string; soft: string };

export type PrintDocData = {
  title: string;              // e.g. "فاتورة ضريبية"
  titleEn?: string;           // e.g. "Tax Invoice"
  ref: string;
  date: string;
  dueDate?: string;
  expiry?: string;
  org: { name: string; taxNumber: string };
  party?: { name?: string; taxNumber?: string; phone?: string; email?: string } | null;
  partyLabel: string;
  lines: PrintLine[];
  lineCalcs: PrintLineCalc[];
  subtotal: number;
  tax: number;
  total: number;
  discAmt?: number;
  shipAmt?: number;
  notes?: string;
  currency: string;           // "ر.س" | "$" | ...
  qrDataUrl?: string;
  branding?: { logo?: string; stamp?: string };
  tpl: PrintTpl;
  poNumber?: string;
  reference?: string;
  project?: string;
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
  const { tpl, org, party, lines, lineCalcs, currency, branding, bilingual } = d;
  const B = bilingual !== false; // default show bilingual mini-labels
  const en = (t: string) => (B ? `<div style="font-size:9px;opacity:.7;font-weight:400">${esc(t)}</div>` : "");

  const partyBlock = party
    ? `<strong style="font-size:13px;display:block;margin-bottom:2px">${esc(party.name || "—")}</strong>
       ${party.taxNumber ? `<div>الرقم الضريبي: ${esc(party.taxNumber)}</div>` : ""}
       ${party.phone ? `<div>الجوال: ${esc(party.phone)}</div>` : ""}
       ${party.email ? `<div>البريد: ${esc(party.email)}</div>` : ""}`
    : `<span style="color:#888">—</span>`;

  const rows = lines
    .map((l, i) => {
      const c = lineCalcs[i] || { net: 0, taxAmt: 0, gross: 0 };
      const zebra = i % 2 ? `background:${tpl.soft}` : "";
      return `<tr style="${zebra}">
        <td style="border:1px solid #d4d0c4;padding:6px 8px;text-align:center">${i + 1}</td>
        <td style="border:1px solid #d4d0c4;padding:6px 8px;text-align:right">${esc(l.description || "—")}</td>
        <td style="border:1px solid #d4d0c4;padding:6px 8px;text-align:center">${esc(l.qty)}</td>
        <td style="border:1px solid #d4d0c4;padding:6px 8px;text-align:center">${fmt(l.price)}</td>
        <td style="border:1px solid #d4d0c4;padding:6px 8px;text-align:center">${fmt(c.net)}</td>
        <td style="border:1px solid #d4d0c4;padding:6px 8px;text-align:center">${fmt(c.taxAmt)} <span style="opacity:.6">(${esc(l.tax)}%)</span></td>
        <td style="border:1px solid #d4d0c4;padding:6px 8px;text-align:center;font-weight:600">${fmt(c.gross)}</td>
      </tr>`;
    })
    .join("");

  const extraMeta = [
    d.poNumber ? `<tr><td style="border:1px solid #eceae2;padding:6px 8px;background:${tpl.soft};font-weight:600">أمر الشراء ${en("PO Number")}</td><td colspan="3" style="border:1px solid #eceae2;padding:6px 8px">${esc(d.poNumber)}</td></tr>` : "",
    d.reference ? `<tr><td style="border:1px solid #eceae2;padding:6px 8px;background:${tpl.soft};font-weight:600">المرجع ${en("Reference")}</td><td colspan="3" style="border:1px solid #eceae2;padding:6px 8px">${esc(d.reference)}</td></tr>` : "",
    d.project ? `<tr><td style="border:1px solid #eceae2;padding:6px 8px;background:${tpl.soft};font-weight:600">المشروع ${en("Project")}</td><td colspan="3" style="border:1px solid #eceae2;padding:6px 8px">${esc(d.project)}</td></tr>` : "",
  ].join("");

  const totalsRows = [
    `<tr><td style="border:1px solid #eceae2;padding:6px 10px;background:${tpl.soft}">المجموع الفرعي ${en("Subtotal")}</td>
     <td style="border:1px solid #eceae2;padding:6px 10px;text-align:left;font-variant-numeric:tabular-nums">${fmt(d.subtotal)} <span style="font-size:10px">${esc(currency)}</span></td></tr>`,
    `<tr><td style="border:1px solid #eceae2;padding:6px 10px;background:${tpl.soft}">ضريبة القيمة المضافة ${en("VAT")}</td>
     <td style="border:1px solid #eceae2;padding:6px 10px;text-align:left;font-variant-numeric:tabular-nums">${fmt(d.tax)} <span style="font-size:10px">${esc(currency)}</span></td></tr>`,
    d.discAmt && d.discAmt > 0
      ? `<tr><td style="border:1px solid #eceae2;padding:6px 10px;background:${tpl.soft}">خصم ${en("Discount")}</td>
         <td style="border:1px solid #eceae2;padding:6px 10px;text-align:left;font-variant-numeric:tabular-nums">- ${fmt(d.discAmt)} <span style="font-size:10px">${esc(currency)}</span></td></tr>`
      : "",
    d.shipAmt && d.shipAmt > 0
      ? `<tr><td style="border:1px solid #eceae2;padding:6px 10px;background:${tpl.soft}">شحن ${en("Shipping")}</td>
         <td style="border:1px solid #eceae2;padding:6px 10px;text-align:left;font-variant-numeric:tabular-nums">${fmt(d.shipAmt)} <span style="font-size:10px">${esc(currency)}</span></td></tr>`
      : "",
    `<tr style="background:${tpl.accent};color:${tpl.onAccent}"><td style="border:1px solid ${tpl.accent};padding:8px 10px;font-weight:700">الإجمالي شامل الضريبة ${en("Grand Total")}</td>
     <td style="border:1px solid ${tpl.accent};padding:8px 10px;text-align:left;font-weight:700;font-variant-numeric:tabular-nums">${fmt(d.total)} <span style="font-size:10px">${esc(currency)}</span></td></tr>`,
  ].join("");

  const stampBlock = branding?.stamp
    ? `<div style="margin-top:8px"><img src="${esc(branding.stamp)}" alt="stamp" style="max-height:90px;object-fit:contain" /></div>`
    : "";
  const qrBlock = d.qrDataUrl
    ? `<div style="text-align:center">
         <img src="${esc(d.qrDataUrl)}" alt="ZATCA QR" width="140" height="140" style="border:1px solid #eceae2;padding:6px;background:#fff;border-radius:6px" />
         <div style="font-size:10px;color:#666;margin-top:4px">رمز الفاتورة (ZATCA)</div>
         ${stampBlock}
       </div>`
    : stampBlock
    ? `<div style="text-align:center">${stampBlock}</div>`
    : `<div></div>`;

  const logoBlock = branding?.logo
    ? `<img src="${esc(branding.logo)}" alt="logo" style="max-height:60px;object-fit:contain;margin-bottom:8px" />`
    : "";

  return `
  <div class="doc" style="max-width:820px;margin:0 auto;color:#0f2a1d">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid ${tpl.accent};padding-bottom:14px;margin-bottom:18px">
      <div style="max-width:60%">
        ${logoBlock}
        <div style="font-size:20px;font-weight:700;color:${tpl.accent};margin:0 0 4px">${esc(org.name)}</div>
        <div style="font-size:11px;color:#555;margin:2px 0">الرقم الضريبي: ${esc(org.taxNumber)}</div>
        <div style="font-size:11px;color:#555;margin:2px 0">المملكة العربية السعودية</div>
      </div>
      <div style="text-align:left">
        <div style="font-size:18px;font-weight:700;color:${tpl.accent};margin:0 0 6px">${esc(d.title)}</div>
        ${d.titleEn ? `<div style="font-size:11px;color:#666;margin-bottom:6px">${esc(d.titleEn)}</div>` : ""}
        <span style="background:${tpl.accent};color:${tpl.onAccent};padding:5px 12px;border-radius:6px;font-size:13px;display:inline-block;font-weight:600">${esc(d.ref)}</span>
      </div>
    </div>

    <table style="width:100%;border-collapse:collapse;margin-bottom:16px;font-size:11px">
      <tbody>
        <tr>
          <td style="border:1px solid #eceae2;padding:6px 8px;background:${tpl.soft};font-weight:600;width:110px">${esc(d.partyLabel)} ${en("Bill To")}</td>
          <td style="border:1px solid #eceae2;padding:6px 8px" colspan="3">${partyBlock}</td>
        </tr>
        <tr>
          <td style="border:1px solid #eceae2;padding:6px 8px;background:${tpl.soft};font-weight:600">التاريخ ${en("Date")}</td>
          <td style="border:1px solid #eceae2;padding:6px 8px">${esc(d.date)}</td>
          <td style="border:1px solid #eceae2;padding:6px 8px;background:${tpl.soft};font-weight:600">${d.expiry ? "الصلاحية" : "الاستحقاق"} ${en(d.expiry ? "Expiry" : "Due")}</td>
          <td style="border:1px solid #eceae2;padding:6px 8px">${esc(d.expiry || d.dueDate || "—")}</td>
        </tr>
        ${extraMeta}
      </tbody>
    </table>

    <table style="width:100%;border-collapse:collapse;margin-bottom:16px;font-size:11px">
      <thead>
        <tr style="background:${tpl.accent};color:${tpl.onAccent}">
          <th style="border:1px solid ${tpl.accent};padding:8px;text-align:center;width:32px">#</th>
          <th style="border:1px solid ${tpl.accent};padding:8px;text-align:right">الوصف${en("Description")}</th>
          <th style="border:1px solid ${tpl.accent};padding:8px;text-align:center;width:60px">الكمية${en("Qty")}</th>
          <th style="border:1px solid ${tpl.accent};padding:8px;text-align:center;width:80px">السعر${en("Price")}</th>
          <th style="border:1px solid ${tpl.accent};padding:8px;text-align:center;width:90px">المبلغ${en("Amount")}</th>
          <th style="border:1px solid ${tpl.accent};padding:8px;text-align:center;width:90px">الضريبة${en("VAT")}</th>
          <th style="border:1px solid ${tpl.accent};padding:8px;text-align:center;width:95px">الإجمالي${en("Total")}</th>
        </tr>
      </thead>
      <tbody>${rows || `<tr><td colspan="7" style="border:1px solid #d4d0c4;padding:14px;text-align:center;color:#999">لا توجد بنود</td></tr>`}</tbody>
    </table>

    <div style="display:grid;grid-template-columns:180px 1fr 300px;gap:16px;align-items:start;margin-top:8px">
      ${qrBlock}
      <div style="font-size:11px;color:#555;padding:10px;background:${tpl.soft};border-radius:6px;border-right:3px solid ${tpl.accent};min-height:60px">
        ${d.notes ? `<strong>ملاحظات:</strong><br/>${esc(d.notes).replace(/\n/g, "<br/>")}` : `<span style="color:#999">لا توجد ملاحظات</span>`}
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <tbody>${totalsRows}</tbody>
      </table>
    </div>

    <div style="text-align:center;font-size:11px;color:#888;margin-top:24px;padding-top:12px;border-top:1px solid #eceae2">
      شكراً لتعاملكم معنا · ${esc(org.name)} · ${esc(d.ref)}
    </div>
  </div>`;
}

export function printDoc(d: PrintDocData) {
  if (typeof window === "undefined") return;
  const inner = buildDocHtml(d);
  const doc = `<!doctype html><html dir="rtl" lang="ar"><head>
    <meta charset="utf-8" />
    <title>${esc(d.title)} ${esc(d.ref)}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap" rel="stylesheet" />
    <style>
      *{box-sizing:border-box}
      html,body{margin:0;padding:0;background:#fff}
      body{font-family:Cairo,"Segoe UI",Tahoma,system-ui,sans-serif;padding:24px;color:#0f2a1d;font-size:12px;line-height:1.5}
      @page { size: A4; margin: 12mm; }
      @media print { body{padding:0} }
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
