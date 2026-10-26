import type { InvoiceTemplate } from "./templates";
import type { PrintDocData } from "./printDoc";

export const SALES_REFERENCE_TEMPLATES: InvoiceTemplate[] = [
  { id: "sales-reference-supply-date", name: "مبيعات — تاريخ التوريد", desc: "فاتورة تفصيلية تتضمن تاريخ التوريد مستقلًا عن الإصدار والاستحقاق", kinds: ["invoice"], builtin: true, accent: "#263640", onAccent: "#ffffff", soft: "#e1f1f6" },
  { id: "sales-reference-simple-tax", name: "مبيعات — الضريبي البسيط", desc: "تصميم أبيض من مرجع Invoice: شعار جانبي، جدول مفتوح ومجاميع وشروط مع QR", kinds: ["invoice"], builtin: true, accent: "#111111", onAccent: "#ffffff", soft: "#eeeeee" },
  { id: "sales-reference-detailed", name: "مبيعات — الجدول التفصيلي", desc: "مستخرج من مرجع Receipt: عنوان مركزي، بيانات طرفين وجدول تفصيلي بأزرق فاتح", kinds: ["invoice"], builtin: true, accent: "#263640", onAccent: "#ffffff", soft: "#e1f1f6" },
  { id: "sales-reference-green", name: "مبيعات — الأخضر التجاري", desc: "مستخرج من مرجع SBT: ترويسة جانبية، جدول أخضر وملخص بجوار QR", kinds: ["invoice"], builtin: true, accent: "#66ad35", onAccent: "#ffffff", soft: "#e3efd8" },
  { id: "sales-reference-blue", name: "مبيعات — الأزرق الهندسي", desc: "مستخرج من مرجع كنار: عنوان مؤطر، جدول أزرق وبيانات استلام وبنك", kinds: ["invoice"], builtin: true, accent: "#3446c9", onAccent: "#ffffff", soft: "#e9ebfa" },
];
export function salesReferenceTemplate(id: unknown) { return SALES_REFERENCE_TEMPLATES.find(t => t.id === id); }
const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
const money = (v: unknown) => Number(v || 0).toLocaleString("en-US", {minimumFractionDigits:2,maximumFractionDigits:2});

/** Reference geometry with current invoice data only; no source logos, text, bank data or QR. */
export function renderSalesReference(d: PrintDocData): string {
  const t = salesReferenceTemplate(d.tpl.id) ? d.tpl : undefined;
  if (!t) throw new Error("Unknown sales reference template");
  if (t.id === "sales-reference-simple-tax") return renderSimpleTax(d);
  const detailed = t.id === "sales-reference-detailed" || t.id === "sales-reference-supply-date", blue = t.id === "sales-reference-blue";
  const rule = "border:1px solid #333;padding:5px 6px;overflow-wrap:anywhere;";
  const row = (label: string,value: unknown) => `<tr><td style="${rule}width:36%;font-size:10px">${label}</td><td style="${rule}">${esc(value || "—")}</td></tr>`;
  const party = (name: string,p: {name?:string;taxNumber?:string;address?:string;commercialReg?:string;phone?:string}|null|undefined) => `<table style="width:100%;border-collapse:collapse;table-layout:fixed"><thead><tr><th colspan="2" style="${rule}background:${t.soft}">${name}</th></tr></thead><tbody>${row("الاسم · Name",p?.name)}${row("العنوان · Address",p?.address)}${row("السجل التجاري · CR",p?.commercialReg)}${row("الرقم الضريبي · VAT",p?.taxNumber)}${detailed?row("الهاتف · Phone",p?.phone):""}</tbody></table>`;
  const title = `<div style="border:1px solid #222;text-align:center;padding:8px;font-size:20px;background:${detailed?t.soft:"white"}">${esc(d.title || "فاتورة ضريبية")} · TAX INVOICE</div>`;
  const metadata = t.id === "sales-reference-supply-date" ? `<table data-supply-metadata dir="rtl" style="width:100%;border-collapse:collapse;margin-top:5px;table-layout:fixed"><thead><tr>${["رقم الفاتورة · Invoice No","تاريخ الإصدار · Issue Date","تاريخ التوريد · Supply Date","تاريخ الاستحقاق · Due"].map(label=>`<th style="${rule}width:25%;background:${t.soft}">${label}</th>`).join("")}</tr></thead><tbody><tr>${[d.ref,d.date,d.supplyDate,d.dueDate].map(value=>`<td style="${rule}text-align:center">${esc(value || "—")}</td>`).join("")}</tr></tbody></table>` : `<table style="width:100%;border-collapse:collapse;margin-top:5px;table-layout:fixed">${row("رقم الفاتورة · Invoice No",d.ref)}${row("التاريخ · Date",d.date)}${t.id === "sales-reference-supply-date" ? row("تاريخ التوريد · Supply Date",d.supplyDate) : ""}${row("تاريخ الاستحقاق · Due",d.dueDate)}</table>`;
  const brand = `<div style="display:flex;align-items:center;justify-content:center;gap:12px;min-height:100px">${d.branding?.logo?`<img src="${esc(d.branding.logo)}" alt="شعار المنشأة" style="width:100px;height:80px;object-fit:contain"/>`:""}<div><strong style="font-size:23px;color:${t.accent}">${esc(d.org.name)}</strong><div style="margin-top:7px">الرقم الضريبي: ${esc(d.org.taxNumber)}</div></div></div>`;
  const labels = detailed ? ["م<br/>S.N","رمز الصنف<br/>Code","الصنف<br/>Description","الموقع<br/>Location","الكمية<br/>QTY","السعر<br/>Price","الخاضع للضريبة<br/>Taxable","الخصم<br/>Discount","نسبة الضريبة<br/>VAT %","الضريبة<br/>VAT","الإجمالي<br/>Total"] : ["م<br/>S.No","البيان<br/>Description","الكمية<br/>QTY","الوحدة<br/>Unit","سعر الوحدة<br/>Unit Price","الخاضع للضريبة<br/>Taxable","نسبة الضريبة<br/>VAT %","الضريبة<br/>Tax"];
  const widths = detailed ? [4,8,21,6,6,9,10,7,6,10,13] : [5,33,7,7,12,14,9,13];
  const lines = d.lines.map((l,i)=>{
    const net=l.qty*l.price-(l.discount||0),calc=d.lineCalcs[i],tax=calc?.taxAmt??net*l.tax/100;
    const extra=l as typeof l & {code?:string;location?:string};
    const values=detailed?[i+1,extra.code||"—",l.description,extra.location||"—",l.qty,money(l.price),money(calc?.net??net),money(l.discount),`${l.tax}%`,money(tax),money(calc?.gross??net+tax)]:[i+1,l.description,l.qty,l.unit||"—",money(l.price),money(calc?.net??net),`${l.tax}%`,money(tax)];
    return `<tr style="break-inside:avoid">${values.map((v,j)=>`<td style="${rule}white-space:pre-wrap;text-align:${j===(detailed?2:1)?"start":"center"}">${esc(v)}</td>`).join("")}</tr>`;
  }).join("");
  const totalRow=(label:string,value:unknown,bold=false)=>`<tr style="${bold?`font-weight:bold;background:${t.soft}`:""}"><td style="${rule}">${label}</td><td dir="ltr" style="${rule}width:30%;text-align:right">${money(value)}</td></tr>`;
  const totals=`<table style="border-collapse:collapse;width:100%;font-size:12px">${totalRow("الإجمالي قبل الضريبة · Subtotal",d.subtotal)}${totalRow("الخصومات · Discount",d.discAmt??d.scanExtras?.discount)}${totalRow("ضريبة القيمة المضافة · VAT",d.tax)}${totalRow(`الإجمالي المستحق · Total (${esc(d.currency)})`,d.total,true)}</table>`;
  const qr=d.qrDataUrl?`<img src="${esc(d.qrDataUrl)}" alt="QR الفاتورة الحالية" style="width:35mm;height:35mm;object-fit:contain;background:white"/>`:`<div style="width:35mm;height:35mm;border:1px dashed #999;display:grid;place-items:center;margin:auto;font-size:11px">موضع QR الفاتورة</div>`;
  const banks=(d.bankAccounts??[]).map(b=>`<tr><td style="${rule}">${esc(b.bankName)}</td><td style="${rule}" dir="ltr">${esc(b.iban||"—")}</td></tr>`).join("");
  return `<div class="doc sales-reference" data-template="${t.id}" dir="rtl" style="max-width:186mm;width:100%;margin:auto;background:white;color:#111;font:12px Arial,Tahoma,sans-serif;line-height:1.45">
    ${detailed?`${brand}<div style="border-top:5px solid #222;margin:4px 0 10px"></div>${title}${metadata}`:`<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:${blue?"24":"15"}px"><div>${title}${metadata}</div>${brand}</div>`}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:14px 0">${party("البائع · Seller",d.org)}${party("المشتري · Buyer",d.party)}</div>
    <table dir="rtl" style="width:100%;border-collapse:collapse;table-layout:fixed;font-size:${detailed?"9":"11"}px"><colgroup>${widths.map(w=>`<col style="width:${w}%"/>`).join("")}</colgroup><thead style="display:table-header-group"><tr>${labels.map(label=>`<th style="${rule}padding:8px 3px;background:${blue?t.accent:t.soft};color:${blue?t.onAccent:"#111"};text-align:center">${label}</th>`).join("")}</tr></thead><tbody>${lines}</tbody></table>
    <div style="break-inside:avoid;margin-top:12px;display:grid;grid-template-columns:${detailed?"1fr 39mm":"1.7fr 1fr"};gap:12px"><div>${totals}${banks?`<table style="border-collapse:collapse;width:100%;margin-top:12px"><tr><th colspan="2" style="${rule}">البيانات البنكية · Bank Account Details</th></tr>${banks}</table>`:""}</div><div style="text-align:center">${qr}<div style="font-size:9px">${esc(d.qrLabel||"QR الفاتورة")}</div></div></div>
    ${d.notes||d.terms?`<div style="${rule}margin-top:16px;white-space:pre-wrap;break-inside:avoid"><b>ملاحظات وشروط · Notes & Terms</b><div>${esc(d.notes||d.terms)}</div></div>`:""}
    <div style="break-inside:avoid;display:flex;justify-content:space-between;margin-top:24px;font-size:11px"><span>المستلم · Received by: __________________</span><span>التوقيع · Signature: __________________</span></div>
    <div style="break-inside:avoid;margin-top:20px;padding:9px;text-align:center;border-top:${detailed?"2":"6"}px solid ${t.accent};color:${t.accent}">${esc(d.org.name)}${d.org.address?` · ${esc(d.org.address)}`:""}</div>
  </div>`;
}


/** Open, monochrome tax invoice adapted from the supplied PDF reference. */
function renderSimpleTax(d: PrintDocData): string {
  const org = d.org as PrintDocData['org'] & {cr?:string;phone?:string};
  const detail = (label:string,value:unknown) => value ? `<div style="margin:5px 0;overflow-wrap:anywhere"><b>${label}: </b>${esc(value)}</div>` : '';
  const amount = (value:number) => `<span dir="ltr" style="display:inline-block">${money(value)} ${esc(d.currency)}</span>`;
  const header = (ar:string,en:string) => `${ar}<br/><span style="font-size:9px">${en}</span>`;
  const labels=[header('م','#'),header('المنتج','Products'),header('الكمية','Qty'),header('سعر الوحدة','Unit Price'),header('الخصم','Discount'),header('الإجمالي قبل الضريبة','Total Before VAT'),header('الضريبة %','VAT %'),header('الضريبة','VAT'),header('الإجمالي','Amount')];
  const rows=d.lines.map((line,i)=>{
    const calc=d.lineCalcs[i],net=calc?.net??line.qty*line.price-(line.discount||0),tax=calc?.taxAmt??net*line.tax/100;
    const values=[String(i+1),esc(line.description),`${esc(line.qty)}<br/>${esc(line.unit||'')}`,money(line.price),money(line.discount),money(net),`${esc(line.tax)}%`,money(tax),money(calc?.gross??net+tax)];
    return `<tr style="break-inside:avoid">${values.map((v,j)=>`<td style="padding:16px 4px;vertical-align:top;text-align:${j===1?'right':'center'};white-space:pre-wrap;overflow-wrap:anywhere;${j===1?'font-weight:600':''}">${v}</td>`).join('')}</tr>`;
  }).join('');
  const totalRow=(label:string,value:number,border=false)=>`<tr><th style="text-align:right;padding:9px 4px;${border?'border-top:1px solid #ccc':''}">${label}:</th><td style="text-align:left;padding:9px 4px;${border?'border-top:1px solid #ccc':''}">${amount(value)}</td></tr>`;
  return `<div class="doc sales-reference" data-template="sales-reference-simple-tax" dir="rtl" style="max-width:186mm;width:100%;margin:auto;color:#111;background:white;font:12px Arial,Tahoma,sans-serif;line-height:1.5">
    <div style="display:flex;justify-content:space-between;gap:30px;border-bottom:1px solid #ddd;padding-bottom:14px;break-inside:avoid">
      <div style="width:29%;text-align:right">${d.branding?.logo?`<img src="${esc(d.branding.logo)}" alt="شعار المنشأة" style="max-width:125px;width:100%;height:110px;object-fit:contain"/>`:''}</div>
      <div style="width:65%;text-align:left"><div style="font-size:28px;line-height:1.15;color:${d.tpl.accent}">${esc(d.title||'فاتورة ضريبية')}</div><b>${esc(d.titleEn||'Tax Invoice')}</b><div style="font-weight:700">${esc(org.name)}</div><div style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(org.address||'')}</div>${detail('الهاتف',org.phone)}<div style="margin-top:12px">${detail('الرقم الضريبي',org.taxNumber)}${detail('رقم السجل التجاري',org.commercialReg||org.cr)}</div></div>
    </div>
    <div style="display:grid;grid-template-columns:1.5fr 1fr;gap:35px;margin:12px 0 22px;break-inside:avoid">
      <div><b style="color:#89969e;font-size:15px">تفاصيل بيانات العميل</b><div style="font-size:16px">${esc(d.party?.name||'—')}</div><div style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(d.party?.address||'')}</div>${d.party?.taxNumber?`<b style="display:block;color:#89969e;margin-top:10px">الرقم الضريبي</b><div dir="ltr" style="text-align:right">${esc(d.party.taxNumber)}</div>`:''}</div>
      <div style="font-size:11px">${detail('المرجع',d.ref)}${detail('نوع الفاتورة',d.title||'فاتورة ضريبية')}${detail('تاريخ الإصدار',d.date)}${detail('تاريخ الاستحقاق',d.dueDate)}<div style="background:#ddd;padding:7px;margin-top:6px"><b>إجمالي الفاتورة: </b>${amount(d.total)}</div></div>
    </div>
    <table dir="rtl" style="width:100%;table-layout:fixed;border-collapse:collapse;font-size:11px"><colgroup>${[3,32,7,10,8,11,7,10,12].map(w=>`<col style="width:${w}%"/>`).join('')}</colgroup><thead style="display:table-header-group"><tr>${labels.map(label=>`<th style="padding:5px 3px;vertical-align:top;background:${d.tpl.soft};color:${d.tpl.accent}">${label}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>
    <div style="display:flex;justify-content:flex-end;margin-top:30px;break-inside:avoid"><table style="width:44%;border-collapse:collapse;font-size:13px;font-weight:700">${totalRow('الإجمالي قبل الضريبة',d.subtotal)}${d.discAmt?totalRow('الخصم',d.discAmt):''}${totalRow('إجمالي الضريبة',d.tax)}${totalRow('المجموع',d.total)}${totalRow('إجمالي الفاتورة',d.total,true)}</table></div>
    <div style="margin-top:38px;break-inside:avoid"><div style="color:#888;border-bottom:1px solid #dbe5ea">الشروط والأحكام</div><div style="white-space:pre-wrap;overflow-wrap:anywhere;margin-top:6px">${esc([d.terms,d.notes].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join('\n'))}</div>${d.qrDataUrl?`<img src="${esc(d.qrDataUrl)}" alt="QR الفاتورة الحالية" style="display:block;width:38mm;height:38mm;object-fit:contain;margin-top:8px"/>`:''}</div>
  </div>`;
}
