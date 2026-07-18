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
  const B = bilingual !== false;
  const en = (t: string) => (B ? `<span style="font-size:9px;opacity:.55;font-weight:400;margin-inline-start:6px">${esc(t)}</span>` : "");

  const accent = tpl.accent;
  const soft = tpl.soft;
  const ink = "#0f1a14";
  const muted = "#6b7469";
  const line = "#ececec";

  const partyBlock = party
    ? `<div style="font-size:14px;font-weight:700;color:${ink};margin-bottom:6px;letter-spacing:.01em">${esc(party.name || "—")}</div>
       <div style="display:grid;gap:3px;font-size:11px;color:${muted}">
         ${party.taxNumber ? `<div><span style="color:${accent};font-weight:600">الرقم الضريبي · </span>${esc(party.taxNumber)}</div>` : ""}
         ${party.phone ? `<div><span style="color:${accent};font-weight:600">الجوال · </span>${esc(party.phone)}</div>` : ""}
         ${party.email ? `<div><span style="color:${accent};font-weight:600">البريد · </span>${esc(party.email)}</div>` : ""}
       </div>`
    : `<span style="color:#b7bdb2">—</span>`;

  const rows = lines
    .map((l, i) => {
      const c = lineCalcs[i] || { net: 0, taxAmt: 0, gross: 0 };
      const bd = `border-bottom:1px solid ${line}`;
      return `<tr>
        <td style="${bd};padding:12px 8px;text-align:center;color:${muted};font-size:10.5px;font-variant-numeric:tabular-nums">${String(i + 1).padStart(2, "0")}</td>
        <td style="${bd};padding:12px 10px;text-align:right;color:${ink}">
          <div style="font-weight:600;font-size:12px;line-height:1.5">${esc(l.description || "—")}</div>
        </td>
        <td style="${bd};padding:12px 8px;text-align:center;font-variant-numeric:tabular-nums;color:${ink}">${esc(l.qty)}</td>
        <td style="${bd};padding:12px 8px;text-align:center;font-variant-numeric:tabular-nums;color:${ink}">${fmt(l.price)}</td>
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

  const metaGrid = [
    metaCell("التاريخ", "Date", esc(d.date)),
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
        <div style="font-size:11px;color:${muted};margin-top:4px">الرقم الضريبي · ${esc(org.taxNumber)}</div>
        <div style="font-size:11px;color:${muted}">المملكة العربية السعودية</div>
      </div>
      <div style="text-align:left;min-width:220px">
        <div style="display:inline-block;padding:5px 12px;background:${soft};color:${accent};font-size:10.5px;font-weight:700;border-radius:999px;letter-spacing:.06em;text-transform:uppercase;margin-bottom:10px">${esc(d.titleEn || "Document")}</div>
        <div style="font-size:22px;font-weight:800;color:${ink};margin-bottom:6px;letter-spacing:-.01em">${esc(d.title)}</div>
        <div style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:13px;color:${accent};font-weight:700;letter-spacing:.02em">${esc(d.ref)}</div>
      </div>
    </div>

    <div style="padding:0 32px 20px">
      <div style="border:1px solid ${line};border-radius:12px;padding:16px 18px;background:#fff">
        <div style="font-size:9.5px;color:${muted};font-weight:700;letter-spacing:.08em;text-transform:uppercase;margin-bottom:8px">${esc(d.partyLabel)}${B ? " · Bill To" : ""}</div>
        ${partyBlock}
      </div>
    </div>

    <div style="padding:0 32px 22px;display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px">
      ${metaGrid}
    </div>

    <div style="padding:0 32px 22px">
      <table style="width:100%;border-collapse:collapse;font-size:11px;background:#fff;border:1px solid ${line};border-radius:12px;overflow:hidden">
        <thead>
          <tr style="background:${soft}">
            <th style="padding:11px 8px;text-align:center;width:36px;font-size:9.5px;color:${muted};font-weight:700;letter-spacing:.06em;text-transform:uppercase">#</th>
            <th style="padding:11px 10px;text-align:right;font-size:9.5px;color:${muted};font-weight:700;letter-spacing:.06em;text-transform:uppercase">الوصف${en("Description")}</th>
            <th style="padding:11px 8px;text-align:center;width:60px;font-size:9.5px;color:${muted};font-weight:700;letter-spacing:.06em;text-transform:uppercase">الكمية${en("Qty")}</th>
            <th style="padding:11px 8px;text-align:center;width:80px;font-size:9.5px;color:${muted};font-weight:700;letter-spacing:.06em;text-transform:uppercase">السعر${en("Price")}</th>
            <th style="padding:11px 8px;text-align:center;width:90px;font-size:9.5px;color:${muted};font-weight:700;letter-spacing:.06em;text-transform:uppercase">المبلغ${en("Amount")}</th>
            <th style="padding:11px 8px;text-align:center;width:95px;font-size:9.5px;color:${muted};font-weight:700;letter-spacing:.06em;text-transform:uppercase">الضريبة${en("VAT")}</th>
            <th style="padding:11px 10px;text-align:center;width:100px;font-size:9.5px;color:${muted};font-weight:700;letter-spacing:.06em;text-transform:uppercase">الإجمالي${en("Total")}</th>
          </tr>
        </thead>
        <tbody>${rows || `<tr><td colspan="7" style="padding:24px;text-align:center;color:#b7bdb2;font-size:11px">لا توجد بنود</td></tr>`}</tbody>
      </table>
    </div>

    <div style="padding:0 32px 22px;display:grid;grid-template-columns:170px 1fr 320px;gap:18px;align-items:start">
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
      <span style="font-family:ui-monospace,monospace;color:${accent};font-weight:700">${esc(org.name)} · ${esc(d.ref)}</span>
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
