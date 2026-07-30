function fmt(n: number) {
  return (Math.round((n + Number.EPSILON) * 100) / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function CreditNotePreview(props: any) {
  const { tpl, org, partyName, ref_, date, lines, lineCalcs, subtotal, tax, total, notes, originalRef, reason, branding, qrDataUrl, usesZatcaQr, currency } = props;
  return (
    <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
      <div className="rounded-xl border border-[#eceae2] p-4" style={{ background: tpl.soft }}>
        <div className="flex justify-between items-start pb-3 mb-4 border-b border-[#eceae2]">
          <div><div className="font-bold" style={{ color: tpl.accent }}>{org.name}</div><div className="text-[11px] text-[#0f2a1d]/60">إشعار دائن</div></div>
          <div className="text-left"><div className="font-bold" style={{ color: tpl.accent }}>إشعار دائن</div><span className="inline-block mt-1 px-2.5 py-1 rounded text-xs" style={{ background: tpl.accent, color: tpl.onAccent }}>{ref_}</span></div>
        </div>
        <div className="grid grid-cols-2 gap-3 mb-4 text-xs">
          <div className="rounded-lg border border-[#eceae2] bg-white p-3"><div className="text-[#0f2a1d]/60 mb-1">الطرف</div><div className="font-semibold">{partyName}</div></div>
          <div className="rounded-lg border border-[#eceae2] bg-white p-3"><div className="text-[#0f2a1d]/60 mb-1">التاريخ</div><div>{date}</div></div>
        </div>
        <div className="rounded-lg border border-[#eceae2] bg-white p-3 mb-4 text-xs">
          <div className="font-semibold text-[#0f2a1d]/60 mb-1">المرجع الأصلي</div>
          <div>{originalRef || "—"}</div>
          <div className="font-semibold text-[#0f2a1d]/60 mt-3 mb-1">سبب التعديل</div>
          <div>{reason || notes || "—"}</div>
        </div>
        <div className="overflow-hidden rounded-lg border border-[#eceae2] bg-white">
          <table className="w-full text-xs border-collapse">
            <thead><tr style={{ background: tpl.accent, color: tpl.onAccent }}><th className="p-2 text-right">#</th><th className="p-2 text-right">الوصف</th><th className="p-2 text-right">الكمية</th><th className="p-2 text-right">السعر</th><th className="p-2 text-right">الإجمالي</th></tr></thead>
            <tbody>{lines.map((l: any, i: number) => <tr key={i}><td className="border border-[#d4d0c4] p-2">{i + 1}</td><td className="border border-[#d4d0c4] p-2">{l.description || "—"}</td><td className="border border-[#d4d0c4] p-2">{l.qty}</td><td className="border border-[#d4d0c4] p-2 tabular-nums">{fmt(l.price)}</td><td className="border border-[#d4d0c4] p-2 tabular-nums">{fmt(lineCalcs[i].gross)}</td></tr>)}</tbody>
          </table>
        </div>
      </div>
      <div className="space-y-3">
        <div className="rounded-xl border border-[#eceae2] p-4 bg-white">
          <div className="text-xs font-semibold text-[#0f2a1d]/60 mb-2">التحقق</div>
          <div className="flex items-center justify-center min-h-[180px] rounded-lg border border-dashed border-[#eceae2] bg-[#faf9f4] p-4">
            {usesZatcaQr && qrDataUrl ? <img src={qrDataUrl} alt="ZATCA QR" className="max-w-[150px]" /> : <div className="text-center text-xs text-[#0f2a1d]/50">QR Placeholder</div>}
          </div>
          {branding.stamp && <img src={branding.stamp} alt="stamp" className="max-h-24 mx-auto mt-3 object-contain" />}
        </div>
        <div className="rounded-xl border border-[#eceae2] p-4 bg-white text-sm">
          <div className="flex justify-between border-b border-[#eceae2] pb-1"><span>المجموع الفرعي</span><span className="tabular-nums">{fmt(subtotal)} {currency}</span></div>
          <div className="flex justify-between border-b border-[#eceae2] pb-1 mt-1"><span>الضريبة</span><span className="tabular-nums">{fmt(tax)} {currency}</span></div>
          <div className="flex justify-between rounded px-3 py-2 font-bold mt-2" style={{ background: tpl.accent, color: tpl.onAccent }}><span>الإجمالي</span><span className="tabular-nums">{fmt(total)} {currency}</span></div>
        </div>
      </div>
    </div>
  );
}
