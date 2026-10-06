import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { buildDocHtml, makeZatcaQrPayload, type PrintDocData } from "@/lib/haseem/printDoc";
import type { InvoiceTemplate } from "@/lib/haseem/templates";

export function ReferenceTemplatePreview({tpl, compact = false}: {tpl: InvoiceTemplate; compact?: boolean}) {
  const [qr, setQr] = useState("");
  useEffect(() => {
    let alive = true;
    const raw = makeZatcaQrPayload({sellerName:"شركة كنار الحديثة",vatNumber:"300000000000003",issuedAtIso:"2026-10-01T12:00:00Z",totalWithVat:1150,vatAmount:150});
    void QRCode.toDataURL(raw,{margin:4,width:300}).then(url=>{if(alive)setQr(url);}).catch(() => { if(alive)setQr(""); });
    return ()=>{alive=false;};
  },[]);
  const data: PrintDocData = {kind:"invoice",title:"فاتورة ضريبية",ref:"DEMO-001",date:"2026-10-01",dueDate:"2026-10-31",org:{name:"شركة كنار الحديثة",taxNumber:"300000000000003",address:"جدة — المملكة العربية السعودية"},party:{name:"عميل تجريبي",taxNumber:"300000000000003",address:"عنوان العميل"},partyLabel:"العميل",currency:"SAR",subtotal:1000,tax:150,total:1150,lines:[{description:"مواد توريد — بيانات تجريبية",qty:4,unit:"قطعة",price:150,tax:15},{description:"أعمال تركيب — بيانات تجريبية",qty:2,unit:"خدمة",price:200,tax:15}],lineCalcs:[],qrDataUrl:qr,qrLabel:"QR تجريبي للمعاينة",tpl,notes:"تُستبدل البيانات التجريبية ببيانات فاتورتك تلقائيًا."};
  return <div className={compact ? "relative w-full h-32 overflow-hidden" : "overflow-x-auto"}>
    {!compact && <p className="mb-3 text-xs text-gray-600">معاينة ببيانات تجريبية؛ يستخدم القالب بيانات كنار والعميل وQR من الفاتورة الجديدة.</p>}
    <div style={{width:700,position:compact?"absolute":undefined,right:compact?0:undefined,top:compact?0:undefined,transform:compact?"scale(0.30)":undefined,transformOrigin:"top right"}} dangerouslySetInnerHTML={{__html:buildDocHtml(data)}} />
  </div>;
}
