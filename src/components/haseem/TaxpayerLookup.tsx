import { useEffect, useRef, useState } from "react";
import { useOrg } from "@/lib/db/org";
import { compareTaxpayer, manualReviewResult, parseManualReview, type ManualTaxpayerReview, type TaxpayerResult } from "@/lib/haseem/taxpayer";
import { vatDigits, ZATCA_LOOKUP_URL } from "@/lib/haseem/vat";

export function TaxpayerLookup({ vatNumber, name, onApply, onManualReview, disabled = false }: {
  vatNumber: string; name: string; disabled?: boolean;
  onApply?: (result: TaxpayerResult) => void;
  onManualReview?: (review: ManualTaxpayerReview | undefined) => void;
}) {
  const { currentOrgId } = useOrg();
  const [officialName, setOfficialName] = useState("");
  const [officialVat, setOfficialVat] = useState("");
  const [address, setAddress] = useState("");
  const [note, setNote] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [message, setMessage] = useState("");
  const callback = useRef(onManualReview);
  callback.current = onManualReview;
  useEffect(() => {
    setOfficialName(""); setOfficialVat(""); setAddress(""); setNote("");
    setAcknowledged(false); setMessage(""); callback.current?.(undefined);
  }, [currentOrgId, vatNumber, name]);
  const invalidate = () => { setAcknowledged(false); setMessage(""); callback.current?.(undefined); };
  const record = () => {
    try {
      const review = parseManualReview({ vatNumber: officialVat, name: officialName, address, evidenceNote: note, acknowledged });
      const result = manualReviewResult(review);
      if (vatDigits(vatNumber) !== result.vatNumber) throw new Error("الرقم المنقول من الهيئة لا يطابق الرقم المدخل");
      const match = compareTaxpayer(result, vatNumber, name);
      if (onManualReview && !match.matches) throw new Error(match.message);
      onApply?.(result);
      onManualReview?.(review);
      setMessage(onManualReview ? "تمت المطابقة اليدوية. سيُسجل إقرارك ووقته عند حفظ واعتماد الفاتورة." : "تم نقل البيانات يدويًا؛ لم يتم جلبها آليًا من الهيئة.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "تعذرت المطابقة"); }
  };
  return <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2 text-xs" dir="rtl">
    <p className="font-semibold">التحقق اليدوي من بيانات المنشأة لدى الهيئة</p>
    <p>افتح الموقع، واختر الرقم الضريبي، ثم أدخل الرقم وأكمل تحقق الهيئة. انقل النتيجة أدناه. صحة صيغة الرقم أو ثقة AI لا تثبت التسجيل.</p>
    <div className="flex flex-wrap gap-3">
      <a href={ZATCA_LOOKUP_URL} target="_blank" rel="noopener noreferrer" className="underline">فتح موقع هيئة الزكاة ↗</a>
      <button type="button" className="underline" onClick={async () => {
        try { await navigator.clipboard.writeText(vatDigits(vatNumber)); setMessage("نُسخ الرقم الضريبي"); }
        catch { setMessage("تعذر النسخ؛ انسخ الرقم الظاهر يدويًا"); }
      }}>نسخ الرقم الضريبي</button>
    </div>
    <p dir="ltr">{vatDigits(vatNumber)}</p>
    {!disabled && <details>
      <summary className="cursor-pointer">إدخال نتيجة الهيئة والمطابقة اليدوية</summary>
      <div className="space-y-2 pt-2">
        <label className="block">الرقم الظاهر في نتيجة الهيئة
          <input value={officialVat} onChange={(e) => { invalidate(); setOfficialVat(e.target.value); }} dir="ltr" className="border rounded w-full px-2 py-1" />
        </label>
        <label className="block">اسم المنشأة كما ظهر في النتيجة
          <input value={officialName} onChange={(e) => { invalidate(); setOfficialName(e.target.value); }} className="border rounded w-full px-2 py-1" />
        </label>
        {onApply && <label className="block">العنوان إن ظهر في النتيجة (اختياري)
          <input value={address} onChange={(e) => { invalidate(); setAddress(e.target.value); }} className="border rounded w-full px-2 py-1" />
        </label>}
        <label className="block">مرجع نتيجة البحث أو ملاحظات المراجعة (اختياري)
          <input value={note} onChange={(e) => { invalidate(); setNote(e.target.value); }} className="border rounded w-full px-2 py-1" />
        </label>
        <label className="flex items-start gap-2"><input type="checkbox" checked={acknowledged} onChange={(e) => { setAcknowledged(e.target.checked); callback.current?.(undefined); }} />
          راجعت النتيجة في موقع الهيئة وأقر بأنها تُظهر تسجيل المنشأة بهذا الاسم والرقم.
        </label>
        <button type="button" disabled={!acknowledged || !currentOrgId} onClick={record} className="underline disabled:opacity-50">
          {onApply ? "استخدام البيانات المنقولة يدويًا" : "تأكيد المطابقة اليدوية للفواتير"}
        </button>
      </div>
    </details>}
    {message && <p role="status">{message}</p>}
  </div>;
}
