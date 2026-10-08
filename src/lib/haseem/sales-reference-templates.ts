import type { InvoiceTemplate } from "./templates";
import type { PrintDocData } from "./printDoc";

export const SALES_REFERENCE_TEMPLATES: InvoiceTemplate[] = [
  { id: "sales-reference-detailed", name: "مبيعات — الجدول التفصيلي", desc: "مستخرج من مرجع Receipt: عنوان مركزي، بيانات طرفين وجدول تفصيلي بأزرق فاتح", kinds: ["invoice"], builtin: true, accent: "#263640", onAccent: "#ffffff", soft: "#e1f1f6" },
  { id: "sales-reference-green", name: "مبيعات — الأخضر التجاري", desc: "مستخرج من مرجع SBT: ترويسة جانبية، جدول أخضر وملخص بجوار QR", kinds: ["invoice"], builtin: true, accent: "#66ad35", onAccent: "#ffffff", soft: "#e3efd8" },
  { id: "sales-reference-blue", name: "مبيعات — الأزرق الهندسي", desc: "مستخرج من مرجع كنار: عنوان مؤطر، جدول أزرق وبيانات استلام وبنك", kinds: ["invoice"], builtin: true, accent: "#3446c9", onAccent: "#ffffff", soft: "#e9ebfa" },
];
export function salesReferenceTemplate(id: unknown) { return SALES_REFERENCE_TEMPLATES.find(t => t.id === id); }
const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
const money = (v: unknown) => Number(v || 0).toLocaleString("en-US", {minimumFractionDigits:2,maximumFractionDigits:2});

/** Reference geometry with current invoice data only; no source logos, text, bank data or QR. */
export function renderSalesReference(d: PrintDocData): string {
  const t = salesReferenceTemplate(d.tpl.id);
  if (!t) throw new Error("Unknown sales reference template");
  const detailed = t.id === "sales-reference-detailed", blue = t.id === "sales-reference-blue";
  const rule = "border:1px solid #333;padding:5px 6px;overflow-wrap:anywhere;";
  const row = (label: string,value: unknown) => `<tr><td style="${rule}width:36%;font-size:10px">${label}</td><td style="${rule}">${esc(value || "—")}</td></tr>`;
  const party = (name: string,p: {name?:string;taxNumber?:string;address?:string;commercialReg?:string;phone?:string}|null|undefined) => `<table style="width:100%;border-collapse:collapse;table-layout:fixed"><thead><tr><th colspan="2" style="${rule}background:${t.soft}">${name}</th></tr></thead><tbody>${row("الاسم · Name",p?.name)}${row("العنوان · Address",p?.address)}${row("السجل التجاري · CR",p?.commercialReg)}${row("الرقم الضريبي · VAT",p?.taxNumber)}${detailed?row("الهاتف · Phone",p?.phone):""}</tbody></table>`;
  const title = `<div style="border:1px solid #222;text-align:center;padding:8px;font-size:20px;background:${detailed?t.soft:"white"}">${esc(d.title || "فاتورة ضريبية")} · TAX INVOICE</div>`;
  const metadata = `<table style="width:100%;border-collapse:collapse;margin-top:5px;table-layout:fixed">${row("رقم الفاتورة · Invoice No",d.ref)}${row("التاريخ · Date",d.date)}${row("تاريخ الاستحقاق · Due",d.dueDate)}</table>`;
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
    <table dir="rtl" style="width:100%;border-collapse:collapse;table-layout:fixed;font-size:${detailed?"9":"11"}px"><colgroup>${widths.map(w=>`<col style="width:${w}%"/>`).join("")}</colgroup><thead style="display:table-header-group"><tr>${labels.map(label=>`<th style="${rule}padding:8px 3px;background:${blue?t.accent:t.soft};color:${blue?"white":"#111"};text-align:center">${label}</th>`).join("")}</tr></thead><tbody>${lines}</tbody></table>
    <div style="break-inside:avoid;margin-top:12px;display:grid;grid-template-columns:${detailed?"1fr 39mm":"1.7fr 1fr"};gap:12px"><div>${totals}${banks?`<table style="border-collapse:collapse;width:100%;margin-top:12px"><tr><th colspan="2" style="${rule}">البيانات البنكية · Bank Account Details</th></tr>${banks}</table>`:""}</div><div style="text-align:center">${qr}<div style="font-size:9px">${esc(d.qrLabel||"QR الفاتورة")}</div></div></div>
    ${d.notes||d.terms?`<div style="${rule}margin-top:16px;white-space:pre-wrap;break-inside:avoid"><b>ملاحظات وشروط · Notes & Terms</b><div>${esc(d.notes||d.terms)}</div></div>`:""}
    <div style="break-inside:avoid;display:flex;justify-content:space-between;margin-top:24px;font-size:11px"><span>المستلم · Received by: __________________</span><span>التوقيع · Signature: __________________</span></div>
    <div style="break-inside:avoid;margin-top:20px;padding:9px;text-align:center;border-top:${detailed?"2":"6"}px solid ${t.accent};color:${t.accent}">${esc(d.org.name)}${d.org.address?` · ${esc(d.org.address)}`:""}</div>
  </div>`;
}

