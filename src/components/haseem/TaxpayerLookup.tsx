import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useOrg } from "@/lib/db/org";
import { verifyTaxpayer } from "@/lib/haseem/taxpayer.functions";
import { compareTaxpayer, type TaxpayerResult } from "@/lib/haseem/taxpayer";
import { vatDigits, ZATCA_LOOKUP_URL } from "@/lib/haseem/vat";

export function TaxpayerLookup({ vatNumber, name, onApply }: {
  vatNumber: string; name: string;
  onApply?: (result: TaxpayerResult) => void;
}) {
  const { currentOrgId } = useOrg();
  const verify = useServerFn(verifyTaxpayer);
  const [result, setResult] = useState<TaxpayerResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fingerprint = `${currentOrgId}:${vatDigits(vatNumber)}`;
  const current = useRef(fingerprint);
  current.current = fingerprint;
  const [resultKey, setResultKey] = useState("");
  const visible = resultKey === fingerprint ? result : null;
  const lookup = async () => {
    if (!currentOrgId || busy) return;
    const key = fingerprint;
    setBusy(true); setError(""); setResult(null);
    try {
      const found = await verify({ data: { vatNumber, orgId: currentOrgId } });
      if (current.current === key) { setResult(found); setResultKey(key); }
    } catch { if (current.current === key) setError("تعذر الاتصال بخدمة التحقق؛ لم يتم تأكيد البيانات"); }
    finally { setBusy(false); }
  };
  return <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2 text-xs" dir="rtl">
    <p className="font-semibold">التحقق من تسجيل المنشأة لدى هيئة الزكاة</p>
    <p>صحة صيغة الرقم وثقة المسح الآلي لا تثبت التسجيل لدى الهيئة.</p>
    <div className="flex flex-wrap gap-3">
      <button type="button" disabled={busy || !currentOrgId || !vatNumber} onClick={lookup} className="underline disabled:opacity-50">{busy ? "جارٍ التحقق…" : "جلب بيانات المنشأة بالرقم الضريبي"}</button>
      <a href={ZATCA_LOOKUP_URL} target="_blank" rel="noopener noreferrer" className="underline">فتح التحقق اليدوي في موقع الهيئة ↗</a>
    </div>
    <p dir="ltr">{vatDigits(vatNumber)}</p>
    {error && <p role="alert">{error}</p>}
    {visible && <div role="status" className="space-y-1">
      <p>{visible.message}</p>
      {visible.name && <p>الاسم المسجل: {visible.name}</p>}
      {visible.address && <p>العنوان: {visible.address}</p>}
      {name && <p>{compareTaxpayer(visible, vatNumber, name).message}</p>}
      {visible.status === "registered" && onApply && <button type="button" className="underline" onClick={() => onApply(visible)}>استخدام الاسم والعنوان المسترجعين</button>}
    </div>}
  </div>;
}
