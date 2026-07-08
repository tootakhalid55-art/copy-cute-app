import { useState, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Plus, Trash2, Printer, Eye, X } from "lucide-react";
import { Shell, PrimaryBtn, OutlineBtn } from "./Shell";
import { useCollection } from "@/lib/haseem/store";

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
  const printRef = useRef<HTMLDivElement>(null);

  const submitNewParty = () => {
    if (!newParty.name.trim()) return;
    const rec = addParty({ ...newParty, name: newParty.name.trim() });
    setPartyId(rec.id);
    setPartyModalOpen(false);
    setNewParty({ name: "", phone: "", email: "", taxNumber: "" });
  };

  const partyName = parties.find((p) => p.id === partyId)?.name ?? "—";

  const handlePrint = () => {
    const html = printRef.current?.innerHTML;
    if (!html) { window.print(); return; }
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) return;
    w.document.write(`<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${title} ${ref}</title>
      <style>
        body{font-family:Cairo,system-ui,sans-serif;padding:24px;color:#0f2a1d}
        table{width:100%;border-collapse:collapse;margin-top:16px}
        th,td{border:1px solid #eceae2;padding:8px;text-align:right;font-size:13px}
        th{background:#f7f6f0}
        h1{font-size:20px;margin:0 0 8px}
        .meta{display:flex;flex-wrap:wrap;gap:16px;font-size:13px;margin-bottom:16px}
        .meta div{min-width:150px}
        .totals{margin-top:16px;width:280px;margin-inline-start:auto;font-size:13px}
        .totals div{display:flex;justify-content:space-between;padding:4px 0}
        .totals .grand{border-top:1px solid #0f2a1d;font-weight:bold;font-size:15px;padding-top:8px}
      </style></head><body>${html}</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); }, 300);
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
