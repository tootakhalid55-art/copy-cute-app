import { formatTimestamp } from "@/lib/haseem/zatca";

function fmt(n: number) {
  return (Math.round((n + Number.EPSILON) * 100) / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function InvoicePreview(props: any) {
  const { tpl, org, party, partyName, partyLabel, partyAddress, ref_, date, dueDate, issuedAtIso, lines, lineCalcs, subtotal, tax, total, notes, branding, qrDataUrl, usesZatcaQr, docTitle, currency } = props;
  return (
    <div className="grid gap-4 lg:grid-cols-[1.3fr_0.9fr]">
      <div className="rounded-xl border border-[#eceae2] p-4" style={{ background: tpl.soft }}>
        <div className="flex items-start justify-between gap-3 pb-3 mb-4 border-b border-[#eceae2]">
          <div>
            <div className="font-bold text-base" style={{ color: tpl.accent }}>{org.name}</div>
            <div className="text-[11px] text-[#0f2a1d]/60">الرقم الضريبي · TRN: {org.taxNumber}</div>
            <div className="text-[11px] text-[#0f2a1d]/60">{org.address || "المملكة العربية السعودية"}</div>
          </div>
          <div className="text-left">
            <div className="font-bold text-base" style={{ color: tpl.accent }}>{docTitle.ar}</div>
            <div className="text-[11px] text-[#0f2a1d]/60">{docTitle.en}</div>
            <span className="inline-block mt-1 px-2.5 py-1 rounded text-xs" style={{ background: tpl.accent, color: tpl.onAccent }}>{ref_}</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 mb-4 text-xs">
          <div className="rounded-lg border border-[#eceae2] bg-white p-3">
            <div className="text-[#0f2a1d]/60 mb-1">العميل</div>
            <div className="font-semibold">{partyName}</div>
            {party?.taxNumber && <div className="text-[#0f2a1d]/70">TRN: {party.taxNumber}</div>}
            {partyAddress && <div className="text-[#0f2a1d]/70">{partyAddress}</div>}
          </div>
          <div className="rounded-lg border border-[#eceae2] bg-white p-3">
            <div className="text-[#0f2a1d]/60 mb-1">بيانات المستند</div>
            <div>التاريخ: <strong>{date}</strong></div>
            <div>الاستحقاق: <strong>{dueDate || "—"}</strong></div>
            <div>وقت الإصدار: <strong dir="ltr" className="inline-block">{formatTimestamp(issuedAtIso)}</strong></div>
          </div>
        </div>
        <div className="overflow-hidden rounded-lg border border-[#eceae2] bg-white">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr style={{ background: tpl.accent, color: tpl.onAccent }}>
                <th className="p-2 text-right">#</th>
                <th className="p-2 text-right">الوصف · Description</th>
                <th className="p-2 text-right">الكمية</th>
                <th className="p-2 text-right">السعر</th>
                <th className="p-2 text-right">الوعاء</th>
                <th className="p-2 text-right">VAT 15%</th>
                <th className="p-2 text-right">الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l: any, i: number) => (
                <tr key={i} className={i % 2 ? "bg-[#faf9f4]" : ""}>
                  <td className="border border-[#d4d0c4] p-2">{i + 1}</td>
                  <td className="border border-[#d4d0c4] p-2">{l.description || "—"}</td>
                  <td className="border border-[#d4d0c4] p-2">{l.qty}</td>
                  <td className="border border-[#d4d0c4] p-2 tabular-nums">{fmt(l.price)}</td>
                  <td className="border border-[#d4d0c4] p-2 tabular-nums">{fmt(lineCalcs[i].net)}</td>
                  <td className="border border-[#d4d0c4] p-2 tabular-nums">{fmt(lineCalcs[i].taxAmt)}</td>
                  <td className="border border-[#d4d0c4] p-2 tabular-nums">{fmt(lineCalcs[i].gross)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="space-y-3">
        <div className="rounded-xl border border-[#eceae2] p-4 bg-white">
          <div className="text-xs font-semibold text-[#0f2a1d]/60 mb-2">QR / الضريبة</div>
          <div className="flex items-center justify-center min-h-[180px] rounded-lg border border-dashed border-[#eceae2] bg-[#faf9f4] p-4">
            {usesZatcaQr && qrDataUrl ? <img src={qrDataUrl} alt="ZATCA QR" className="max-w-[150px]" /> : <div className="text-center text-xs text-[#0f2a1d]/50">QR Placeholder</div>}
          </div>
          <div className="text-[11px] text-[#0f2a1d]/60 mt-2 text-center">رمز الفاتورة (ZATCA)</div>
          {branding.stamp && <img src={branding.stamp} alt="stamp" className="max-h-24 mx-auto mt-3 object-contain" />}
        </div>
        <div className="rounded-xl border border-[#eceae2] p-4 bg-white">
          <div className="text-xs font-semibold text-[#0f2a1d]/60 mb-2">الملخص</div>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between border-b border-[#eceae2] pb-1"><span>المجموع الفرعي</span><span className="tabular-nums">{fmt(subtotal)} {currency}</span></div>
            <div className="flex justify-between border-b border-[#eceae2] pb-1"><span>الضريبة 15%</span><span className="tabular-nums">{fmt(tax)} {currency}</span></div>
            <div className="flex justify-between rounded px-3 py-2 font-bold" style={{ background: tpl.accent, color: tpl.onAccent }}><span>الإجمالي</span><span className="tabular-nums">{fmt(total)} {currency}</span></div>
          </div>
        </div>
        <div className="rounded-xl border border-[#eceae2] p-4 bg-white text-xs">
          <div className="font-semibold text-[#0f2a1d]/60 mb-2">ملاحظات</div>
          <div>{notes || "لا توجد ملاحظات"}</div>
        </div>
      </div>
    </div>
  );
}
