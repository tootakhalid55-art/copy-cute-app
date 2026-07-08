import { useState, useRef, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Plus, Trash2, Printer, Eye, X } from "lucide-react";
import QRCode from "qrcode";
import { Shell, PrimaryBtn, OutlineBtn } from "./Shell";
import { useCollection, useKV } from "@/lib/haseem/store";

// ZATCA phase-1 TLV encoder (base64)
function zatcaTLV(seller: string, vat: string, iso: string, total: string, taxAmt: string) {
  const enc = new TextEncoder();
  const fields: [number, string][] = [
    [1, seller], [2, vat], [3, iso], [4, total], [5, taxAmt],
  ];
  const chunks: number[] = [];
  for (const [tag, val] of fields) {
    const bytes = enc.encode(val);
    chunks.push(tag, bytes.length, ...bytes);
  }
  let bin = "";
  for (const b of chunks) bin += String.fromCharCode(b);
  return typeof btoa !== "undefined" ? btoa(bin) : Buffer.from(bin, "binary").toString("base64");
}

type Line = { description: string; qty: number; price: number; tax: number };

export function DocumentForm({
  storageKey,
  partyKey,
  partyLabel,
  title,
  subtitle,
  backTo,
  docPrefix,
}: {
  storageKey: string;
  partyKey: string;
  partyLabel: string;
  title: string;
  subtitle?: string;
  backTo: string;
  docPrefix: string;
}) {
  const navigate = useNavigate();
  const { items: parties, add: addParty } = useCollection<any>(partyKey);
  const { add } = useCollection<any>(storageKey);
  const [org] = useKV<{ name: string; taxNumber: string }>("org", {
    name: "شركة كنار الحديثة للمقاولات",
    taxNumber: "312756062700003",
  });

  const [ref] = useState(
    `${docPrefix}-${Math.floor(100000 + Math.random() * 900000)}`
  );
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [dueDate, setDueDate] = useState(today);
  const [partyId, setPartyId] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([
    { description: "", qty: 1, price: 0, tax: 15 },
  ]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [partyModalOpen, setPartyModalOpen] = useState(false);
  const [newParty, setNewParty] = useState({ name: "", phone: "", email: "", taxNumber: "" });
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const printRef = useRef<HTMLDivElement>(null);

  const submitNewParty = () => {
    if (!newParty.name.trim()) return;
    const rec = addParty({ ...newParty, name: newParty.name.trim() });
    setPartyId(rec.id);
    setPartyModalOpen(false);
    setNewParty({ name: "", phone: "", email: "", taxNumber: "" });
  };

  const party = parties.find((p) => p.id === partyId);
  const partyName = party?.name ?? "—";

  const subtotal = lines.reduce((s, l) => s + l.qty * l.price, 0);
  const tax = lines.reduce(
    (s, l) => s + (l.qty * l.price * l.tax) / 100,
    0
  );
  const total = subtotal + tax;

  useEffect(() => {
    const iso = new Date(`${date}T00:00:00`).toISOString();
    const payload = zatcaTLV(org.name, org.taxNumber, iso, total.toFixed(2), tax.toFixed(2));
    QRCode.toDataURL(payload, { margin: 1, width: 180 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(""));
  }, [org.name, org.taxNumber, date, total, tax]);

  const handlePrint = () => {
    const html = printRef.current?.innerHTML;
    if (!html) { window.print(); return; }
    const w = window.open("", "_blank", "width=900,height=1000");
    if (!w) return;
    w.document.write(`<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${title} ${ref}</title>
      <style>
        *{box-sizing:border-box}
        body{font-family:Cairo,"Segoe UI",system-ui,sans-serif;padding:32px;color:#0f2a1d;margin:0}
        .doc{max-width:800px;margin:0 auto}
        .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #0f2a1d;padding-bottom:16px;margin-bottom:20px}
        .brand h1{font-size:22px;margin:0 0 4px;color:#0f2a1d}
        .brand p{margin:2px 0;font-size:12px;color:#555}
        .doc-title{text-align:left}
        .doc-title h2{font-size:20px;margin:0 0 6px;color:#0f2a1d}
        .doc-title .ref{background:#0f2a1d;color:#fff;padding:4px 10px;border-radius:6px;font-size:13px;display:inline-block}
        .parties{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px}
        .card{border:1px solid #eceae2;border-radius:8px;padding:12px;background:#fafaf7}
        .card .label{font-size:11px;color:#666;margin-bottom:6px;font-weight:600}
        .card .val{font-size:13px;line-height:1.7}
        .card .val strong{display:block;font-size:14px;margin-bottom:2px}
        table{width:100%;border-collapse:collapse;margin-bottom:16px}
        th,td{border:1px solid #d4d0c4;padding:8px 10px;text-align:right;font-size:12px}
        th{background:#0f2a1d;color:#fff;font-weight:600}
        tbody tr:nth-child(even){background:#fafaf7}
        .bottom{display:grid;grid-template-columns:180px 1fr 260px;gap:20px;align-items:start;margin-top:20px}
        .qr{text-align:center}
        .qr img{border:1px solid #eceae2;padding:6px;background:#fff;border-radius:6px}
        .qr .cap{font-size:10px;color:#666;margin-top:4px}
        .notes{font-size:12px;color:#555;padding:10px;background:#fafaf7;border-radius:6px;border-right:3px solid #0f2a1d}
        .totals{font-size:13px}
        .totals div{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #eceae2}
        .totals .grand{font-weight:bold;font-size:16px;background:#0f2a1d;color:#fff;padding:10px 12px;border-radius:6px;margin-top:6px;border:none}
        .foot{text-align:center;font-size:11px;color:#888;margin-top:24px;padding-top:12px;border-top:1px solid #eceae2}
        @media print { body{padding:12px} }
      </style></head><body><div class="doc">${html}</div></body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); }, 400);
  };

  const subtotal = lines.reduce((s, l) => s + l.qty * l.price, 0);
  const tax = lines.reduce(
    (s, l) => s + (l.qty * l.price * l.tax) / 100,
    0
  );
  const total = subtotal + tax;

  const updateLine = (i: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const save = (finalStatus: string) => {
    add({
      ref,
      date,
      dueDate,
      partyId,
      partyName,
      notes,
      status: finalStatus,
      lines,
      subtotal,
      tax,
      total,
    });
    navigate({ to: backTo });
  };

  return (
    <Shell>
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">{title}</h1>
          {subtitle && (
            <p className="text-xs text-[#0f2a1d]/60 mt-1">{subtitle}</p>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          <OutlineBtn type="button" onClick={() => navigate({ to: backTo })}>
            رجوع
          </OutlineBtn>
          <OutlineBtn type="button" onClick={() => setPreviewOpen(true)}>
            <Eye className="w-4 h-4" /> معاينة
          </OutlineBtn>
          <OutlineBtn type="button" onClick={handlePrint}>
            <Printer className="w-4 h-4" /> طباعة
          </OutlineBtn>
          <OutlineBtn type="button" onClick={() => save("مسودة")}>
            حفظ كمسودة
          </OutlineBtn>
          <PrimaryBtn onClick={() => save("مؤكد")}>حفظ واعتماد</PrimaryBtn>
        </div>
      </div>


      <div className="rounded-xl bg-white border border-[#eceae2] p-5 grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
        <FormField label="رقم المستند">
          <input
            readOnly
            value={ref}
            className="border border-[#eceae2] rounded-lg px-3 py-2 bg-[#f7f6f0]"
          />
        </FormField>
        <FormField label="التاريخ">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="border border-[#eceae2] rounded-lg px-3 py-2"
          />
        </FormField>
        <FormField label="الاستحقاق">
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="border border-[#eceae2] rounded-lg px-3 py-2"
          />
        </FormField>
        <FormField label={partyLabel}>
          <div className="flex gap-2">
            <select
              value={partyId}
              onChange={(e) => {
                if (e.target.value === "__new__") {
                  setPartyModalOpen(true);
                } else {
                  setPartyId(e.target.value);
                }
              }}
              className="border border-[#eceae2] rounded-lg px-3 py-2 bg-white flex-1"
            >
              <option value="">— اختر —</option>
              {parties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
              <option value="__new__">➕ إضافة {partyLabel} جديد...</option>
            </select>
            <button
              type="button"
              onClick={() => setPartyModalOpen(true)}
              className="border border-[#eceae2] rounded-lg px-2 hover:bg-[#f7f6f0] text-[#0f2a1d]"
              title={`إضافة ${partyLabel}`}
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </FormField>
      </div>

      <div className="rounded-xl bg-white border border-[#eceae2] p-5 space-y-3">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() =>
              setLines((ls) => [
                ...ls,
                { description: "", qty: 1, price: 0, tax: 15 },
              ])
            }
            className="inline-flex items-center gap-1 border border-[#eceae2] rounded-lg px-3 py-1.5 text-sm hover:bg-[#f7f6f0]"
          >
            <Plus className="w-3.5 h-3.5" /> إضافة بند
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-[#0f2a1d]/60">
              <tr className="text-right">
                <th className="py-2 w-8">#</th>
                <th>الوصف</th>
                <th className="w-20">الكمية</th>
                <th className="w-28">السعر</th>
                <th className="w-24">الضريبة %</th>
                <th className="w-28">المبلغ</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i} className="border-t border-[#eceae2]">
                  <td className="py-2">{i + 1}</td>
                  <td>
                    <input
                      value={l.description}
                      onChange={(e) =>
                        updateLine(i, { description: e.target.value })
                      }
                      placeholder="الوصف"
                      className="border border-[#eceae2] rounded px-2 py-1 w-full"
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      value={l.qty}
                      onChange={(e) =>
                        updateLine(i, { qty: Number(e.target.value) })
                      }
                      className="border border-[#eceae2] rounded px-2 py-1 w-full"
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={l.price}
                      onChange={(e) =>
                        updateLine(i, { price: Number(e.target.value) })
                      }
                      className="border border-[#eceae2] rounded px-2 py-1 w-full"
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      value={l.tax}
                      onChange={(e) =>
                        updateLine(i, { tax: Number(e.target.value) })
                      }
                      className="border border-[#eceae2] rounded px-2 py-1 w-full"
                    />
                  </td>
                  <td className="tabular-nums">
                    {(l.qty * l.price * (1 + l.tax / 100)).toFixed(2)} ﷼
                  </td>
                  <td>
                    <button
                      type="button"
                      onClick={() =>
                        setLines((ls) => ls.filter((_, idx) => idx !== i))
                      }
                      className="p-1 text-red-500 hover:bg-red-50 rounded"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-[#eceae2]">
          <div>
            <label className="text-xs text-[#0f2a1d]/70">ملاحظات</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="border border-[#eceae2] rounded-lg px-3 py-2 w-full min-h-[80px] text-sm mt-1"
              placeholder="ملاحظات إضافية..."
            />
          </div>
          <div className="space-y-2 text-sm">
            <Row label="المجموع الفرعي" value={`${subtotal.toFixed(2)} ﷼`} />
            <Row label="الضريبة" value={`${tax.toFixed(2)} ﷼`} />
            <Row label="الإجمالي" value={`${total.toFixed(2)} ﷼`} bold />
          </div>
        </div>
      </div>

      {/* Hidden printable content */}
      <div className="hidden">
        <div ref={printRef}>
          <h1>{title}</h1>
          <div className="meta">
            <div><strong>رقم المستند:</strong> {ref}</div>
            <div><strong>التاريخ:</strong> {date}</div>
            <div><strong>الاستحقاق:</strong> {dueDate}</div>
            <div><strong>{partyLabel}:</strong> {partyName}</div>
          </div>
          <table>
            <thead>
              <tr>
                <th>#</th><th>الوصف</th><th>الكمية</th><th>السعر</th><th>الضريبة %</th><th>المبلغ</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>{l.description}</td>
                  <td>{l.qty}</td>
                  <td>{l.price.toFixed(2)}</td>
                  <td>{l.tax}</td>
                  <td>{(l.qty * l.price * (1 + l.tax / 100)).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="totals">
            <div><span>المجموع الفرعي</span><span>{subtotal.toFixed(2)} ﷼</span></div>
            <div><span>الضريبة</span><span>{tax.toFixed(2)} ﷼</span></div>
            <div className="grand"><span>الإجمالي</span><span>{total.toFixed(2)} ﷼</span></div>
          </div>
          {notes && <p style={{marginTop:16,fontSize:13}}><strong>ملاحظات:</strong> {notes}</p>}
        </div>
      </div>

      {previewOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-auto" onClick={() => setPreviewOpen(false)}>
          <div className="bg-white rounded-xl max-w-3xl w-full p-6 my-8" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#eceae2]">
              <h2 className="text-lg font-bold">معاينة المستند</h2>
              <div className="flex gap-2">
                <OutlineBtn type="button" onClick={handlePrint}>
                  <Printer className="w-4 h-4" /> طباعة
                </OutlineBtn>
                <button onClick={() => setPreviewOpen(false)} className="p-2 rounded hover:bg-[#f7f6f0]">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="text-sm space-y-4">
              <div>
                <h3 className="font-bold text-lg">{title}</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-2 text-xs">
                  <div><div className="text-[#0f2a1d]/60">رقم المستند</div><div className="font-semibold">{ref}</div></div>
                  <div><div className="text-[#0f2a1d]/60">التاريخ</div><div className="font-semibold">{date}</div></div>
                  <div><div className="text-[#0f2a1d]/60">الاستحقاق</div><div className="font-semibold">{dueDate}</div></div>
                  <div><div className="text-[#0f2a1d]/60">{partyLabel}</div><div className="font-semibold">{partyName}</div></div>
                </div>
              </div>
              <table className="w-full border-collapse text-xs">
                <thead className="bg-[#f7f6f0]">
                  <tr>
                    <th className="border border-[#eceae2] p-2 text-right">#</th>
                    <th className="border border-[#eceae2] p-2 text-right">الوصف</th>
                    <th className="border border-[#eceae2] p-2 text-right">الكمية</th>
                    <th className="border border-[#eceae2] p-2 text-right">السعر</th>
                    <th className="border border-[#eceae2] p-2 text-right">الضريبة %</th>
                    <th className="border border-[#eceae2] p-2 text-right">المبلغ</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={i}>
                      <td className="border border-[#eceae2] p-2">{i + 1}</td>
                      <td className="border border-[#eceae2] p-2">{l.description || "—"}</td>
                      <td className="border border-[#eceae2] p-2">{l.qty}</td>
                      <td className="border border-[#eceae2] p-2 tabular-nums">{l.price.toFixed(2)}</td>
                      <td className="border border-[#eceae2] p-2">{l.tax}%</td>
                      <td className="border border-[#eceae2] p-2 tabular-nums">{(l.qty * l.price * (1 + l.tax / 100)).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex justify-end">
                <div className="w-64 space-y-1 text-sm">
                  <Row label="المجموع الفرعي" value={`${subtotal.toFixed(2)} ﷼`} />
                  <Row label="الضريبة" value={`${tax.toFixed(2)} ﷼`} />
                  <div className="pt-2 border-t border-[#eceae2]">
                    <Row label="الإجمالي" value={`${total.toFixed(2)} ﷼`} bold />
                  </div>
                </div>
              </div>
              {notes && <div className="text-xs"><span className="text-[#0f2a1d]/60">ملاحظات:</span> {notes}</div>}
            </div>
          </div>
        </div>
      )}

      {partyModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setPartyModalOpen(false)}>
          <div className="bg-white rounded-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#eceae2]">
              <h2 className="text-lg font-bold">إضافة {partyLabel}</h2>
              <button onClick={() => setPartyModalOpen(false)} className="p-1 rounded hover:bg-[#f7f6f0]">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3 text-sm">
              <FormField label="الاسم *">
                <input
                  autoFocus
                  value={newParty.name}
                  onChange={(e) => setNewParty((p) => ({ ...p, name: e.target.value }))}
                  className="border border-[#eceae2] rounded-lg px-3 py-2"
                  placeholder={`اسم ${partyLabel}`}
                />
              </FormField>
              <FormField label="الجوال">
                <input
                  value={newParty.phone}
                  onChange={(e) => setNewParty((p) => ({ ...p, phone: e.target.value }))}
                  className="border border-[#eceae2] rounded-lg px-3 py-2"
                />
              </FormField>
              <FormField label="البريد الإلكتروني">
                <input
                  type="email"
                  value={newParty.email}
                  onChange={(e) => setNewParty((p) => ({ ...p, email: e.target.value }))}
                  className="border border-[#eceae2] rounded-lg px-3 py-2"
                />
              </FormField>
              <FormField label="الرقم الضريبي">
                <input
                  value={newParty.taxNumber}
                  onChange={(e) => setNewParty((p) => ({ ...p, taxNumber: e.target.value }))}
                  className="border border-[#eceae2] rounded-lg px-3 py-2"
                />
              </FormField>
            </div>
            <div className="flex justify-end gap-2 mt-5 pt-3 border-t border-[#eceae2]">
              <OutlineBtn type="button" onClick={() => setPartyModalOpen(false)}>إلغاء</OutlineBtn>
              <PrimaryBtn onClick={submitNewParty}>حفظ</PrimaryBtn>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}

function FormField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-[#0f2a1d]/70">{label}</span>
      {children}
    </div>
  );
}
function Row({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[#0f2a1d]/70">{label}</span>
      <span className={bold ? "font-bold text-lg" : "tabular-nums"}>{value}</span>
    </div>
  );
}
