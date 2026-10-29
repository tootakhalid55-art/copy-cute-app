import type { PrintDocData } from "./printDoc";
const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
export function renderReference330(d: PrintDocData) {
 const money=(v:number)=>Number(v).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
 const amount=(v:number|undefined)=>v===undefined?'—':`${esc(d.currency)}${money(v)}`;
 const date=(v?:string)=>/^\d{4}-\d{2}-\d{2}$/.test(v||'')?`${Number(v!.slice(5,7))}/${Number(v!.slice(8,10))}/${v!.slice(0,4)}`:esc(v||'—');
 const pair=(en:string,value:unknown,ar:string)=>`<div style="display:grid;grid-template-columns:29% 46% 25%;gap:0;padding:3px 0"><span>${en}</span><span style="overflow-wrap:anywhere">${esc(value||'—')}</span><span dir="rtl" style="text-align:right">${ar}</span></div>`;
 const sum=(en:string,ar:string,value:number|undefined)=>`<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin:12px 0;font-weight:700"><div>${en}<div dir="rtl" style="text-align:left">${ar}</div></div><span>${amount(value)}</span></div>`;
 const org=d.org as typeof d.org & {phone?:string};
 const bank=d.bankAccounts?.[0];
 const labels=[['#','الرقم'],['Item','الصنف'],['Quantity','الكمية'],['Unit price','سعر الوحدة'],['Tax','الضريبة'],['Discount','خصم'],['Total','الإجمالي']];
 const rows=d.lines.map((l,i)=>{
  const gross=d.lineCalcs[i]?.gross??(l.qty*l.price-(l.discount||0))*(1+l.tax/100);
  const pct=l.qty*l.price ? (l.discount||0)/(l.qty*l.price)*100 : 0;
  const values=[i+1,l.description,l.qty,money(l.price),`${l.tax}%`,`${pct.toFixed(2)}%`,money(gross)];
  return `<tr style="break-inside:avoid">${values.map((v,j)=>`<td style="border:1px solid #bbb;padding:6px 4px;vertical-align:top;text-align:${j<2?'left':'right'};white-space:pre-wrap;overflow-wrap:anywhere">${esc(v)}</td>`).join('')}</tr>`;
 }).join('');
 return `<div class="doc sales-reference" data-template="sales-reference-330" dir="ltr" style="max-width:190mm;margin:auto;min-height:272mm;display:flex;flex-direction:column;color:#111;background:white;font:11px Arial,Tahoma,sans-serif;line-height:1.3">
 <div style="border:1px solid #999;border-radius:2px;min-height:46mm;padding:10px 13px;display:grid;grid-template-columns:39% 22% 39%;box-sizing:border-box;break-inside:avoid">
 <div><b style="font-size:15px;color:${d.tpl.accent}">INVOICE</b><div style="font-size:15px;font-weight:700;margin:5px 0 11px">${esc(d.title||'فاتورة ضريبية')}</div><b dir="auto">${esc(org.name)}</b><div dir="auto" style="white-space:pre-wrap;margin:7px 0">${esc(org.address)}</div>${pair('Tax No.',org.taxNumber,'الرقم الضريبي')}${org.commercialReg?pair('CR No.',org.commercialReg,'السجل التجاري'):''}${pair('Phone',org.phone,'رقم التلفون')}</div>
 <div style="text-align:center;padding-top:16px">${d.qrDataUrl?`<img src="${esc(d.qrDataUrl)}" alt="QR الفاتورة الحالية" style="width:34mm;height:34mm;object-fit:contain"/>`:'<div style="height:34mm">موضع QR الفاتورة</div>'}</div><div></div></div>
 <div style="display:grid;grid-template-columns:1fr 1fr;margin:10px 0 9px;min-height:32mm;break-inside:avoid">
 <div style="padding:0 23px 0 4px;border-right:1px solid #bbb"><div style="display:flex;justify-content:space-between"><b>Bill to</b><span>فاتورة إلى</span></div><div dir="auto" style="text-align:left;margin:7px 0">${esc(d.party?.name||'—')}</div>${pair('Tax No.',d.party?.taxNumber,'الرقم الضريبي')}</div>
 <div style="padding-left:23px;padding-right:4px">${pair('Invoice No.',d.ref,'رقم الفاتورة')}${pair('Date',date(d.date),'التاريخ')}${pair('Due date',date(d.dueDate),'تاريخ الاستحقاق')}${pair('Payment status',d.paymentStatus,'حالة الدفع')}${pair('Bank acc. number',bank?.iban||bank?.accountNumber,'رقم الحساب البنكي')}${pair('Bank details',bank?.bankName,'تفاصيل البنك')}</div></div>
 <table dir="ltr" style="width:100%;border-collapse:collapse;table-layout:fixed;font-size:11px"><colgroup>${[5.3,38.2,9.2,11.8,10.5,9.2,15.8].map(w=>`<col style="width:${w}%"/>`).join('')}</colgroup><thead style="display:table-header-group"><tr>${labels.map(([en,ar])=>`<th style="border:1px solid #bbb;border-bottom:3px solid #aaa;padding:6px 3px;background:${d.invoiceColor?d.tpl.soft:'#fff'};color:${d.tpl.accent}">${en}<div dir="rtl">${ar}</div></th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>
 <div style="width:31.5%;margin-left:auto;break-inside:avoid">${sum('Subtotal','المجموع الفرعي',d.subtotal)}${sum('VAT','',d.tax)}${sum('Total','الإجمالي',d.total)}<div style="border-top:1px dashed #aaa;padding-top:15px"><b>Payment method<div>طريقة الدفع</div></b><div style="display:flex;justify-content:space-between;margin-top:12px"><span>${esc(d.paymentMethod||'—')}</span><span>${amount(d.paidAmount)}</span></div>${sum('Paid amount','المبلغ المدفوع',d.paidAmount)}${sum('Amount due','المبلغ المستحق',d.paidAmount===undefined?undefined:Math.max(0,d.total-d.paidAmount))}</div></div>
 ${d.notes?`<div dir="auto" style="white-space:pre-wrap;margin-top:15px">${esc(d.notes)}</div>`:''}
 <div style="margin-top:auto;padding-top:25px;display:flex;justify-content:space-between;color:#999;font-size:10px"><span>Created with Canar Accounting</span><span style="color:#111">Page 1</span></div></div>`;
}
