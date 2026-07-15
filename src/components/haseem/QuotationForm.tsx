import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Plus, Trash2, Printer, Eye, EyeOff, X, Save, Send,
  SlidersHorizontal, Paperclip, Upload, Bookmark, Maximize2, Pencil, Check,
} from "lucide-react";
import { Shell, PrimaryBtn, OutlineBtn } from "./Shell";
import { useCollection, useKV } from "@/lib/haseem/store";
import { useInvoiceTemplates } from "@/lib/haseem/templates";

function fileToDataURL(f: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result || ""));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(f);
  });
}

type Line = {
  description: string;
  qty: number;
  price: number;
  tax: number; // percent
  itemId?: string;
};

type OptionalCols = {
  poNumber: boolean;
  reference: boolean;
  project: boolean;
};

type Currency = "SAR" | "USD" | "EUR" | "AED";
type PriceMode = "excl" | "incl"; // السعر خال / شامل الضريبة

export function QuotationForm({ docId }: { docId?: string }) {
  const navigate = useNavigate();
  const storageKey = "quotations";
  const partyKey = "customers";
  const docPrefix = "QUO";
  const backTo = "/sales/quotations";

  const { items: parties, add: addParty } = useCollection<any>(partyKey);
  const { items: products } = useCollection<any>("items");
  const { items: docs, add, update } = useCollection<any>(storageKey);
  const existing = docId ? docs.find((d) => d.id === docId) : null;

  const [org] = useKV<{ name: string; taxNumber: string }>("org", {
    name: "شركة كنار الحديثة للمقاولات",
    taxNumber: "312756062700003",
  });
  const [branding, setBranding] = useKV<{ logo: string; stamp: string }>(
    "branding",
    { logo: "", stamp: "" }
  );
  const [refEditing, setRefEditing] = useState(false);

  // Numbering
  const nextNumber = useMemo(() => {
    const nums = docs
      .map((d) => Number(String(d.ref ?? "").split("-").pop()))
      .filter((n) => !Number.isNaN(n));
    const max = nums.length ? Math.max(...nums) : 99;
    return `${docPrefix}-${String(max + 1).padStart(6, "0")}`;
  }, [docs]);

  const today = new Date().toISOString().slice(0, 10);
  const [ref, setRef] = useState<string>(existing?.ref ?? nextNumber);
  const [date, setDate] = useState<string>(existing?.date ?? today);
  const [expiry, setExpiry] = useState<string>(existing?.expiry ?? today);
  const [partyId, setPartyId] = useState<string>(existing?.partyId ?? "");
  const [notes, setNotes] = useState<string>(existing?.notes ?? "");
  const [poNumber, setPoNumber] = useState<string>(existing?.poNumber ?? "");
  const [reference, setReference] = useState<string>(existing?.reference ?? "");
  const [project, setProject] = useState<string>(existing?.project ?? "");
  const [currency, setCurrency] = useState<Currency>(existing?.currency ?? "SAR");
  const [priceMode, setPriceMode] = useState<PriceMode>(existing?.priceMode ?? "excl");
  const [optCols, setOptCols] = useState<OptionalCols>(
    existing?.optCols ?? { poNumber: false, reference: false, project: false }
  );
  const [showFieldMenu, setShowFieldMenu] = useState(false);
  const [showColsMenu, setShowColsMenu] = useState(false);
  const [showTotalsMenu, setShowTotalsMenu] = useState(false);
  const [discount, setDiscount] = useState<number>(existing?.discount ?? 0);
  const [discountEnabled, setDiscountEnabled] = useState<boolean>(existing?.discountEnabled ?? false);
  const [shipping, setShipping] = useState<number>(existing?.shipping ?? 0);
  const [shippingEnabled, setShippingEnabled] = useState<boolean>(existing?.shippingEnabled ?? false);
  const [lines, setLines] = useState<Line[]>(
    existing?.lines ?? [{ description: "", qty: 1, price: 0, tax: 15 }]
  );
  const [partyModalOpen, setPartyModalOpen] = useState(false);
  const [previewFull, setPreviewFull] = useState(false);
  const [previewHidden, setPreviewHidden] = useState(false);

  useEffect(() => {
    if (existing) {
      setRef(existing.ref);
      setDate(existing.date);
      setExpiry(existing.expiry ?? existing.dueDate ?? today);
      setPartyId(existing.partyId ?? "");
      setNotes(existing.notes ?? "");
      setLines(existing.lines ?? [{ description: "", qty: 1, price: 0, tax: 15 }]);
      setPoNumber(existing.poNumber ?? "");
      setReference(existing.reference ?? "");
      setProject(existing.project ?? "");
      setCurrency(existing.currency ?? "SAR");
      setPriceMode(existing.priceMode ?? "excl");
      setOptCols(existing.optCols ?? { poNumber: false, reference: false, project: false });
      setDiscount(existing.discount ?? 0);
      setShipping(existing.shipping ?? 0);
      setDiscountEnabled(!!existing.discountEnabled);
      setShippingEnabled(!!existing.shippingEnabled);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId, existing?.id]);

  const party = parties.find((p) => p.id === partyId);
  const { selected: tpl } = useInvoiceTemplates("quotation");

  // Math
  const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  const CUR_SYMBOL: Record<Currency, string> = { SAR: "ر.س", USD: "$", EUR: "€", AED: "د.إ" };
  const CUR = CUR_SYMBOL[currency];
  const fmt = (n: number) =>
    r2(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const lineCalcs = lines.map((l) => {
    const q = Number(l.qty) || 0;
    const p = Number(l.price) || 0;
    const t = Number(l.tax) || 0;
    let net: number, taxAmt: number;
    if (priceMode === "incl") {
      const gross = r2(q * p);
      net = r2(gross / (1 + t / 100));
      taxAmt = r2(gross - net);
    } else {
      net = r2(q * p);
      taxAmt = r2((net * t) / 100);
    }
    return { net, taxAmt, gross: r2(net + taxAmt) };
  });
  const subtotal = r2(lineCalcs.reduce((s, c) => s + c.net, 0));
  const tax = r2(lineCalcs.reduce((s, c) => s + c.taxAmt, 0));
  const discAmt = discountEnabled ? r2(Number(discount) || 0) : 0;
  const shipAmt = shippingEnabled ? r2(Number(shipping) || 0) : 0;
  const total = r2(subtotal + tax - discAmt + shipAmt);

  const updateLine = (i: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const addLine = () =>
    setLines((ls) => [...ls, { description: "", qty: 1, price: 0, tax: 15 }]);
  const clearLines = () => setLines([{ description: "", qty: 1, price: 0, tax: 15 }]);
  const removeLine = (i: number) =>
    setLines((ls) => (ls.length > 1 ? ls.filter((_, idx) => idx !== i) : ls));

  const save = (status: string) => {
    const payload = {
      ref, date, expiry, dueDate: expiry, partyId,
      partyName: party?.name ?? "—",
      notes, lines, subtotal, tax, total,
      poNumber, reference, project, currency, priceMode, optCols,
      discount, discountEnabled, shipping, shippingEnabled,
      status,
    };
    if (existing) update(existing.id, payload);
    else add(payload);
    navigate({ to: backTo });
  };

  // New party quick-add
  const [newParty, setNewParty] = useState<any>({ name: "", taxNumber: "", email: "", phone: "" });
  const submitNewParty = () => {
    if (!newParty.name.trim()) return;
    const rec = addParty({ ...newParty, name: newParty.name.trim() });
    setPartyId(rec.id);
    setPartyModalOpen(false);
    setNewParty({ name: "", taxNumber: "", email: "", phone: "" });
  };

  // Printing
  const printRef = useRef<HTMLDivElement>(null);
  const handlePrint = () => {
    const html = printRef.current?.innerHTML;
    if (!html) return;
    const w = window.open("", "_blank", "width=900,height=1000");
    if (!w) return;
    w.document.write(`<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${ref}</title>
      <style>
        *{box-sizing:border-box}
        body{font-family:Cairo,"Segoe UI",system-ui,sans-serif;padding:24px;color:#111;margin:0;background:#fff}
        .wf{max-width:820px;margin:0 auto;font-size:12px}
        ${QUOTE_PRINT_CSS(tpl.accent)}
        @media print { body{padding:8px} }
      </style></head><body><div class="wf">${html}</div></body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 400);
  };

  return (
    <Shell>
      {/* Top bar — Wafeq style */}
      <div className="sticky top-0 z-30 -mx-6 -mt-6 mb-4 bg-white border-b border-[#eceae2] px-6 py-3 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate({ to: backTo })}
            className="p-1.5 rounded hover:bg-[#f7f6f0]"
            title="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold">{existing ? "تعديل عرض سعر" : "إنشاء عرض سعر"}</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button type="button" onClick={() => setPreviewHidden((v) => !v)}
            className="inline-flex items-center gap-1 text-sm px-2 py-1.5 rounded hover:bg-[#f7f6f0]">
            {previewHidden ? <><Eye className="w-4 h-4" /> إظهار المعاينة</> : <><EyeOff className="w-4 h-4" /> إخفاء المعاينة</>}
          </button>
          <button type="button" onClick={handlePrint}
            className="inline-flex items-center gap-1 text-sm px-2 py-1.5 rounded hover:bg-[#f7f6f0]">
            <Printer className="w-4 h-4" /> طباعة / تنزيل
          </button>
          <button type="button"
            className="inline-flex items-center gap-1 text-sm px-2 py-1.5 rounded hover:bg-[#f7f6f0]">
            <Paperclip className="w-4 h-4" /> مرفقات
          </button>
          <button type="button" onClick={() => save("مسودة")}
            className="inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded border border-[#eceae2] hover:bg-[#f7f6f0]">
            <Bookmark className="w-4 h-4" /> حفظ
          </button>
          <PrimaryBtn onClick={() => save("مرسل")}>
            <Send className="w-4 h-4" /> احفظ ثم أرسل
          </PrimaryBtn>
        </div>
      </div>

      <div className={`grid gap-5 ${previewHidden ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-2"}`}>
        {/* FORM COLUMN */}
        <div className="space-y-5 order-2 lg:order-1">
          <div className="rounded-xl bg-white border border-[#eceae2] p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold">عرض سعر <span className="text-[#0f2a1d]/50 text-sm font-normal">#{ref}</span></h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              {/* Issuer */}
              <FormField label="جهة الإصدار *" action={
                <FieldMenuButton open={showFieldMenu} onToggle={() => setShowFieldMenu((v) => !v)}
                  optCols={optCols} setOptCols={setOptCols} />
              }>
                <div className="border border-[#eceae2] rounded-lg px-3 py-2 bg-white flex items-center justify-between">
                  <div>
                    <div className="font-semibold">{org.name}</div>
                    <div className="text-xs text-[#0f2a1d]/60">رقم التسجيل الضريبي: {org.taxNumber || "—"}</div>
                  </div>
                  <button type="button" className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-[#eceae2] hover:bg-[#f7f6f0]">
                    <Upload className="w-3.5 h-3.5" /> الشعار
                  </button>
                </div>
              </FormField>

              {/* Customer */}
              <FormField label="العميل *">
                <div className="flex gap-2">
                  <select
                    value={partyId}
                    onChange={(e) => {
                      if (e.target.value === "__new__") setPartyModalOpen(true);
                      else setPartyId(e.target.value);
                    }}
                    className="border border-[#eceae2] rounded-lg px-3 py-2 bg-white flex-1"
                  >
                    <option value="">— اختر العميل —</option>
                    {parties.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                    <option value="__new__">➕ إضافة عميل جديد...</option>
                  </select>
                  <button type="button" onClick={() => setPartyModalOpen(true)}
                    className="border border-[#eceae2] rounded-lg px-2 hover:bg-[#f7f6f0]" title="إضافة عميل">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </FormField>

              <FormField label="التاريخ *">
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                  className="border border-[#eceae2] rounded-lg px-3 py-2" />
              </FormField>
              <FormField label="صلاحية العرض">
                <input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)}
                  className="border border-[#eceae2] rounded-lg px-3 py-2" />
              </FormField>

              {optCols.poNumber && (
                <FormField label="أمر الشراء">
                  <input value={poNumber} onChange={(e) => setPoNumber(e.target.value)}
                    className="border border-[#eceae2] rounded-lg px-3 py-2" placeholder="PO-..." />
                </FormField>
              )}
              {optCols.reference && (
                <FormField label="المرجع">
                  <input value={reference} onChange={(e) => setReference(e.target.value)}
                    className="border border-[#eceae2] rounded-lg px-3 py-2" />
                </FormField>
              )}
              {optCols.project && (
                <FormField label="المشروع">
                  <input value={project} onChange={(e) => setProject(e.target.value)}
                    className="border border-[#eceae2] rounded-lg px-3 py-2" />
                </FormField>
              )}
            </div>
          </div>

          {/* Items */}
          <div className="rounded-xl bg-white border border-[#eceae2] p-5 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <select value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}
                  className="border border-[#eceae2] rounded-lg px-2 py-1.5 text-sm bg-white">
                  <option value="SAR">SAR — ر.س</option>
                  <option value="USD">USD — $</option>
                  <option value="EUR">EUR — €</option>
                  <option value="AED">AED — د.إ</option>
                </select>
                <select value={priceMode} onChange={(e) => setPriceMode(e.target.value as PriceMode)}
                  className="border border-[#eceae2] rounded-lg px-2 py-1.5 text-sm bg-white">
                  <option value="excl">السعر خال من الضريبة</option>
                  <option value="incl">السعر شامل الضريبة</option>
                </select>
              </div>
              <button type="button" onClick={() => setShowColsMenu((v) => !v)}
                className="inline-flex items-center gap-1 text-sm px-2 py-1.5 rounded border border-[#eceae2] hover:bg-[#f7f6f0]">
                <SlidersHorizontal className="w-4 h-4" /> تعديل الحقول
              </button>
            </div>

            <div className="overflow-x-auto rounded-lg border border-[#eceae2]">
              <table className="w-full text-sm">
                <thead className="text-xs bg-[#faf9f4]">
                  <tr className="text-right">
                    <th className="p-2 w-10 text-center">#</th>
                    <th className="p-2">الوصف *</th>
                    <th className="p-2 w-20">الكمية *</th>
                    <th className="p-2 w-28">السعر</th>
                    <th className="p-2 w-24">معدل ضريبي</th>
                    <th className="p-2 w-28">المبلغ</th>
                    <th className="p-2 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={i} className="border-t border-[#eceae2] align-top">
                      <td className="p-2 text-center text-[#0f2a1d]/60">{i + 1}</td>
                      <td className="p-2">
                        <input list="quote-items" value={l.description}
                          onChange={(e) => {
                            const v = e.target.value;
                            const prod = products.find((p) => p.name === v);
                            if (prod) updateLine(i, {
                              description: prod.name,
                              price: Number(prod.price) || 0,
                              tax: prod.tax != null ? Number(prod.tax) : 15,
                              itemId: prod.id,
                            });
                            else updateLine(i, { description: v });
                          }}
                          placeholder="الوصف أو البحث عن الأصناف..."
                          className="border border-[#eceae2] rounded px-2 py-1.5 w-full" />
                      </td>
                      <td className="p-2">
                        <input type="number" min={0} value={l.qty}
                          onChange={(e) => updateLine(i, { qty: Number(e.target.value) })}
                          className="border border-[#eceae2] rounded px-2 py-1.5 w-full text-center" />
                      </td>
                      <td className="p-2">
                        <input type="number" min={0} step="0.01" value={l.price}
                          onChange={(e) => updateLine(i, { price: Number(e.target.value) })}
                          className="border border-[#eceae2] rounded px-2 py-1.5 w-full text-center" placeholder="مطلوب" />
                      </td>
                      <td className="p-2">
                        <select value={l.tax}
                          onChange={(e) => updateLine(i, { tax: Number(e.target.value) })}
                          className="border border-[#eceae2] rounded px-2 py-1.5 w-full bg-white">
                          <option value={15}>ض.ق.م 15%</option>
                          <option value={5}>ض.ق.م 5%</option>
                          <option value={0}>معفى 0%</option>
                        </select>
                      </td>
                      <td className="p-2 text-center tabular-nums">{fmt(lineCalcs[i].gross)}</td>
                      <td className="p-2">
                        <button type="button" onClick={() => removeLine(i)}
                          className="p-1 text-red-500 hover:bg-red-50 rounded" title="حذف البند">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <datalist id="quote-items">
                {products.map((p) => <option key={p.id} value={p.name} />)}
              </datalist>
            </div>

            <div className="flex items-center gap-2">
              <button type="button" onClick={addLine}
                className="inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded border border-[#eceae2] hover:bg-[#f7f6f0]">
                <Plus className="w-4 h-4" /> أضف بند
              </button>
              <button type="button" onClick={clearLines}
                className="inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded border border-[#eceae2] hover:bg-[#f7f6f0]">
                <Trash2 className="w-4 h-4" /> مسح البند
              </button>
            </div>

            {/* Totals */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-[#eceae2]">
              <div>
                <label className="text-xs text-[#0f2a1d]/70">ملاحظات</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
                  className="border border-[#eceae2] rounded-lg px-3 py-2 w-full min-h-[100px] text-sm mt-1"
                  placeholder="اكتب أي ملاحظات ستظهر على العرض..." />
                <div className="mt-3 border-2 border-dashed border-[#eceae2] rounded-lg p-4 text-center text-sm text-[#0f2a1d]/60 cursor-pointer hover:bg-[#faf9f4]">
                  <Upload className="w-5 h-5 mx-auto mb-1" /> ختم
                </div>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-end">
                  <button type="button" onClick={() => setShowTotalsMenu((v) => !v)}
                    className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-[#eceae2] hover:bg-[#f7f6f0]">
                    <SlidersHorizontal className="w-3.5 h-3.5" /> تعديل الإجمالي
                  </button>
                </div>
                {showTotalsMenu && (
                  <div className="rounded-lg border border-[#eceae2] p-3 space-y-2 bg-[#faf9f4]">
                    <label className="flex items-center justify-between text-xs">
                      <span>الخصم</span>
                      <input type="checkbox" checked={discountEnabled} onChange={(e) => setDiscountEnabled(e.target.checked)} />
                    </label>
                    <label className="flex items-center justify-between text-xs">
                      <span>الشحن</span>
                      <input type="checkbox" checked={shippingEnabled} onChange={(e) => setShippingEnabled(e.target.checked)} />
                    </label>
                  </div>
                )}
                <TotalRow label="المجموع الفرعي" value={`${fmt(subtotal)}`} />
                <TotalRow label="إجمالي ضريبة القيمة المضافة" value={`${fmt(tax)}`} />
                {discountEnabled && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[#0f2a1d]/70">خصم</span>
                    <input type="number" min={0} step="0.01" value={discount}
                      onChange={(e) => setDiscount(Number(e.target.value))}
                      className="border border-[#eceae2] rounded px-2 py-1 w-28 text-left tabular-nums" />
                  </div>
                )}
                {shippingEnabled && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[#0f2a1d]/70">شحن</span>
                    <input type="number" min={0} step="0.01" value={shipping}
                      onChange={(e) => setShipping(Number(e.target.value))}
                      className="border border-[#eceae2] rounded px-2 py-1 w-28 text-left tabular-nums" />
                  </div>
                )}
                <div className="flex items-center justify-between pt-2 border-t border-[#eceae2] font-bold text-base">
                  <span>المجموع</span>
                  <span className="tabular-nums">{fmt(total)} <span className="text-xs">{CUR}</span></span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* PREVIEW COLUMN */}
        {!previewHidden && (
          <div className="order-1 lg:order-2">
            <div className="lg:sticky lg:top-20 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#0f2a1d]/60">معاينة مباشرة</span>
                <button type="button" onClick={() => setPreviewFull(true)}
                  className="p-1.5 rounded hover:bg-[#f7f6f0]" title="ملء الشاشة">
                  <Maximize2 className="w-4 h-4" />
                </button>
              </div>
              <QuotePaper
                tpl={tpl}
                org={org}
                party={party}
                ref_={ref}
                date={date}
                expiry={expiry}
                lines={lines}
                lineCalcs={lineCalcs}
                subtotal={subtotal}
                tax={tax}
                discAmt={discAmt}
                shipAmt={shipAmt}
                total={total}
                notes={notes}
                CUR={CUR}
                fmt={fmt}
                poNumber={optCols.poNumber ? poNumber : ""}
                reference={optCols.reference ? reference : ""}
                project={optCols.project ? project : ""}
                priceMode={priceMode}
              />
              <div className="flex items-center justify-center pt-2">
                <button type="button"
                  className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded border border-[#eceae2] hover:bg-[#f7f6f0]">
                  القالب: <strong className="mx-1">{tpl.name}</strong>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Field menu for issuer */}
      {showFieldMenu && (
        <FieldMenuPopover
          optCols={optCols} setOptCols={setOptCols}
          onClose={() => setShowFieldMenu(false)}
        />
      )}
      {showColsMenu && (
        <div className="fixed inset-0 z-40" onClick={() => setShowColsMenu(false)}>
          <div className="absolute top-[220px] left-1/2 -translate-x-1/2 bg-white rounded-lg border border-[#eceae2] shadow-lg p-3 w-64" onClick={(e) => e.stopPropagation()}>
            <div className="text-xs font-semibold mb-2">حقول جدول البنود</div>
            <div className="text-xs text-[#0f2a1d]/60">جميع الحقول الأساسية مفعّلة. تخصيصات إضافية قادمة قريباً.</div>
          </div>
        </div>
      )}

      {/* New party modal */}
      {partyModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 overflow-auto" onClick={() => setPartyModalOpen(false)}>
          <div className="bg-white rounded-xl w-full max-w-lg my-8" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-3 border-b border-[#eceae2] bg-[#fafaf7]">
              <h3 className="font-bold">إضافة عميل جديد</h3>
              <button onClick={() => setPartyModalOpen(false)} className="p-2 rounded hover:bg-[#eceae2]"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <label className="col-span-2 flex flex-col gap-1"><span className="text-xs">الاسم *</span>
                <input value={newParty.name} onChange={(e) => setNewParty({ ...newParty, name: e.target.value })}
                  className="border border-[#eceae2] rounded-lg px-3 py-2" /></label>
              <label className="flex flex-col gap-1"><span className="text-xs">الرقم الضريبي</span>
                <input value={newParty.taxNumber} onChange={(e) => setNewParty({ ...newParty, taxNumber: e.target.value })}
                  className="border border-[#eceae2] rounded-lg px-3 py-2" /></label>
              <label className="flex flex-col gap-1"><span className="text-xs">الجوال</span>
                <input value={newParty.phone} onChange={(e) => setNewParty({ ...newParty, phone: e.target.value })}
                  className="border border-[#eceae2] rounded-lg px-3 py-2" /></label>
              <label className="col-span-2 flex flex-col gap-1"><span className="text-xs">البريد الإلكتروني</span>
                <input value={newParty.email} onChange={(e) => setNewParty({ ...newParty, email: e.target.value })}
                  className="border border-[#eceae2] rounded-lg px-3 py-2" /></label>
            </div>
            <div className="flex justify-end gap-2 px-6 py-3 border-t border-[#eceae2] bg-[#fafaf7]">
              <OutlineBtn type="button" onClick={() => setPartyModalOpen(false)}>إلغاء</OutlineBtn>
              <PrimaryBtn onClick={submitNewParty}><Save className="w-4 h-4" /> حفظ</PrimaryBtn>
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen preview */}
      {previewFull && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-start justify-center p-6 overflow-auto" onClick={() => setPreviewFull(false)}>
          <div className="bg-white rounded-xl max-w-3xl w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-3 border-b border-[#eceae2]">
              <h3 className="font-bold">معاينة عرض السعر</h3>
              <div className="flex gap-2">
                <OutlineBtn type="button" onClick={handlePrint}><Printer className="w-4 h-4" /> طباعة</OutlineBtn>
                <button onClick={() => setPreviewFull(false)} className="p-2 rounded hover:bg-[#eceae2]"><X className="w-4 h-4" /></button>
              </div>
            </div>
            <div className="p-6 bg-[#f4f4f0]">
              <QuotePaper
                tpl={tpl} org={org} party={party} ref_={ref} date={date} expiry={expiry}
                lines={lines} lineCalcs={lineCalcs} subtotal={subtotal} tax={tax}
                discAmt={discAmt} shipAmt={shipAmt} total={total} notes={notes} CUR={CUR} fmt={fmt}
                poNumber={optCols.poNumber ? poNumber : ""}
                reference={optCols.reference ? reference : ""}
                project={optCols.project ? project : ""}
                priceMode={priceMode}
              />
            </div>
          </div>
        </div>
      )}

      {/* Hidden printable */}
      <div className="hidden">
        <div ref={printRef}>
          <QuotePaperStatic
            tpl={tpl} org={org} party={party} ref_={ref} date={date} expiry={expiry}
            lines={lines} lineCalcs={lineCalcs} subtotal={subtotal} tax={tax}
            discAmt={discAmt} shipAmt={shipAmt} total={total} notes={notes} CUR={CUR} fmt={fmt}
            poNumber={optCols.poNumber ? poNumber : ""}
            reference={optCols.reference ? reference : ""}
            project={optCols.project ? project : ""}
          />
        </div>
      </div>
    </Shell>
  );
}

/* ---------- helpers ---------- */

function FormField({ label, action, children }: { label: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-[#0f2a1d]/70">{label}</span>
        {action}
      </div>
      {children}
    </div>
  );
}

function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-[#0f2a1d]/80">
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function FieldMenuButton({ open, onToggle }: {
  open: boolean; onToggle: () => void;
  optCols: OptionalCols; setOptCols: (v: OptionalCols) => void;
}) {
  return (
    <button type="button" onClick={onToggle}
      className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded border ${open ? "border-[#0f2a1d] bg-[#faf9f4]" : "border-[#eceae2] hover:bg-[#f7f6f0]"}`}>
      <SlidersHorizontal className="w-3.5 h-3.5" /> تعديل الحقول
    </button>
  );
}

function FieldMenuPopover({ optCols, setOptCols, onClose }: {
  optCols: OptionalCols; setOptCols: (v: OptionalCols) => void; onClose: () => void;
}) {
  const toggle = (k: keyof OptionalCols) => setOptCols({ ...optCols, [k]: !optCols[k] });
  return (
    <div className="fixed inset-0 z-40" onClick={onClose}>
      <div className="absolute top-[180px] right-8 bg-white rounded-lg border border-[#eceae2] shadow-lg p-3 w-64" onClick={(e) => e.stopPropagation()}>
        <ToggleRow label="أمر الشراء" checked={optCols.poNumber} onChange={() => toggle("poNumber")} />
        <ToggleRow label="المرجع" checked={optCols.reference} onChange={() => toggle("reference")} />
        <ToggleRow label="المشروع" checked={optCols.project} onChange={() => toggle("project")} />
        <div className="mt-2 pt-2 border-t border-[#eceae2] text-xs text-[#0f2a1d]/60">الحقول المخصصة</div>
        <button type="button" className="text-xs text-blue-600 hover:underline mt-1">+ إضافة حقل مخصص</button>
      </div>
    </div>
  );
}
function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="flex items-center justify-between py-1.5 text-sm cursor-pointer">
      <span>{label}</span>
      <span onClick={onChange} className={`w-8 h-4 rounded-full relative transition ${checked ? "bg-[#0f6b3a]" : "bg-[#d4d0c4]"}`}>
        <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition ${checked ? "right-0.5" : "left-0.5"}`} />
      </span>
    </label>
  );
}

/* ---------- Paper / preview ---------- */

function QuotePaper(props: any) {
  const { tpl } = props;
  return (
    <div className="bg-white rounded-lg border border-[#eceae2] shadow-sm p-6" style={{ fontSize: 12 }}>
      <QuotePaperInner {...props} />
      <style>{`.qp-th{background:${tpl.accent};color:${tpl.onAccent};}`}</style>
    </div>
  );
}
function QuotePaperStatic(props: any) { return <QuotePaperInner {...props} />; }

function QuotePaperInner({
  tpl, org, party, ref_, date, expiry,
  lines, lineCalcs, subtotal, tax, discAmt, shipAmt, total, notes, CUR, fmt,
  poNumber, reference, project,
}: any) {
  return (
    <div dir="rtl">
      <div className="flex justify-between items-start pb-3 mb-4" style={{ borderBottom: `2px solid ${tpl.accent}` }}>
        <div>
          <div className="font-bold text-base" style={{ color: tpl.accent }}>{org.name}</div>
          <div className="text-[11px] text-[#0f2a1d]/60">المملكة العربية السعودية</div>
        </div>
        <div className="text-left">
          <div className="font-bold text-base" style={{ color: tpl.accent }}>شركتك</div>
          <div className="text-[11px] text-[#0f2a1d]/60">Kingdom of Saudi Arabia</div>
        </div>
      </div>

      <div className="text-center mb-4">
        <div className="text-lg font-bold">عرض سعر <span className="text-[#0f2a1d]/60 text-sm">Quote</span></div>
      </div>

      <table className="w-full mb-4 text-[11px]">
        <tbody>
          <tr>
            <td className="p-1.5 border border-[#eceae2] bg-[#faf9f4] w-24">التاريخ</td>
            <td className="p-1.5 border border-[#eceae2] w-32">{date}</td>
            <td className="p-1.5 border border-[#eceae2] bg-[#faf9f4] w-16">Date</td>
            <td className="p-1.5 border border-[#eceae2] bg-[#faf9f4] w-16">رقم</td>
            <td className="p-1.5 border border-[#eceae2]">{ref_}</td>
            <td className="p-1.5 border border-[#eceae2] bg-[#faf9f4] w-20">Number</td>
          </tr>
          {expiry && (
            <tr>
              <td className="p-1.5 border border-[#eceae2] bg-[#faf9f4]">الصلاحية</td>
              <td className="p-1.5 border border-[#eceae2]" colSpan={5}>{expiry}</td>
            </tr>
          )}
          {party && (
            <tr>
              <td className="p-1.5 border border-[#eceae2] bg-[#faf9f4]">العميل</td>
              <td className="p-1.5 border border-[#eceae2]" colSpan={5}>
                <strong>{party.name}</strong>
                {party.taxNumber && <span className="text-[10px] text-[#0f2a1d]/60 mr-2">ض. {party.taxNumber}</span>}
              </td>
            </tr>
          )}
          {poNumber && <tr><td className="p-1.5 border border-[#eceae2] bg-[#faf9f4]">أمر الشراء</td><td className="p-1.5 border border-[#eceae2]" colSpan={5}>{poNumber}</td></tr>}
          {reference && <tr><td className="p-1.5 border border-[#eceae2] bg-[#faf9f4]">المرجع</td><td className="p-1.5 border border-[#eceae2]" colSpan={5}>{reference}</td></tr>}
          {project && <tr><td className="p-1.5 border border-[#eceae2] bg-[#faf9f4]">المشروع</td><td className="p-1.5 border border-[#eceae2]" colSpan={5}>{project}</td></tr>}
        </tbody>
      </table>

      <table className="w-full text-[11px] mb-4" style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr className="qp-th" style={{ background: tpl.accent, color: tpl.onAccent }}>
            <th className="p-1.5 border" style={{ borderColor: tpl.accent }}>#</th>
            <th className="p-1.5 border text-right" style={{ borderColor: tpl.accent }}>الوصف<br/><span className="text-[9px] opacity-80">Description</span></th>
            <th className="p-1.5 border" style={{ borderColor: tpl.accent }}>الكمية<br/><span className="text-[9px] opacity-80">Qty</span></th>
            <th className="p-1.5 border" style={{ borderColor: tpl.accent }}>السعر<br/><span className="text-[9px] opacity-80">Price</span></th>
            <th className="p-1.5 border" style={{ borderColor: tpl.accent }}>المبلغ الخاضع للضريبة<br/><span className="text-[9px] opacity-80">Taxable amount</span></th>
            <th className="p-1.5 border" style={{ borderColor: tpl.accent }}>القيمة المضافة<br/><span className="text-[9px] opacity-80">VAT amount</span></th>
            <th className="p-1.5 border" style={{ borderColor: tpl.accent }}>المجموع<br/><span className="text-[9px] opacity-80">Line amount</span></th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l: Line, i: number) => (
            <tr key={i}>
              <td className="p-1.5 border border-[#d4d0c4] text-center">{i + 1}</td>
              <td className="p-1.5 border border-[#d4d0c4] text-right">{l.description || "—"}</td>
              <td className="p-1.5 border border-[#d4d0c4] text-center tabular-nums">{l.qty}</td>
              <td className="p-1.5 border border-[#d4d0c4] text-center tabular-nums">{fmt(l.price)}</td>
              <td className="p-1.5 border border-[#d4d0c4] text-center tabular-nums">{fmt(lineCalcs[i].net)}</td>
              <td className="p-1.5 border border-[#d4d0c4] text-center tabular-nums">{fmt(lineCalcs[i].taxAmt)}</td>
              <td className="p-1.5 border border-[#d4d0c4] text-center tabular-nums">{fmt(lineCalcs[i].gross)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex justify-end">
        <table className="text-[11px] w-[280px]">
          <tbody>
            <tr><td className="p-1.5 border border-[#eceae2] bg-[#faf9f4]">المجموع الفرعي <span className="text-[9px] opacity-60">Subtotal</span></td>
              <td className="p-1.5 border border-[#eceae2] text-left tabular-nums">{fmt(subtotal)} <span className="text-[9px]">{CUR}</span></td></tr>
            <tr><td className="p-1.5 border border-[#eceae2] bg-[#faf9f4]">إجمالي ضريبة القيمة المضافة <span className="text-[9px] opacity-60">Total VAT</span></td>
              <td className="p-1.5 border border-[#eceae2] text-left tabular-nums">{fmt(tax)} <span className="text-[9px]">{CUR}</span></td></tr>
            {discAmt > 0 && <tr><td className="p-1.5 border border-[#eceae2] bg-[#faf9f4]">خصم</td>
              <td className="p-1.5 border border-[#eceae2] text-left tabular-nums">- {fmt(discAmt)}</td></tr>}
            {shipAmt > 0 && <tr><td className="p-1.5 border border-[#eceae2] bg-[#faf9f4]">شحن</td>
              <td className="p-1.5 border border-[#eceae2] text-left tabular-nums">{fmt(shipAmt)}</td></tr>}
            <tr style={{ background: tpl.accent, color: tpl.onAccent }}>
              <td className="p-1.5 border font-bold" style={{ borderColor: tpl.accent }}>المجموع شامل القيمة المضافة</td>
              <td className="p-1.5 border font-bold text-left tabular-nums" style={{ borderColor: tpl.accent }}>{fmt(total)} <span className="text-[9px]">{CUR}</span></td>
            </tr>
          </tbody>
        </table>
      </div>

      {notes && (
        <div className="mt-4 p-2 rounded border border-[#eceae2] text-[11px] bg-[#faf9f4]">
          <strong>ملاحظات:</strong> {notes}
        </div>
      )}

      <div className="mt-6 pt-3 text-center text-[10px] text-[#0f2a1d]/50" style={{ borderTop: `1px solid ${tpl.accent}33` }}>
        {ref_} · Page 1 of 1 · {org.name}
      </div>
    </div>
  );
}

function QUOTE_PRINT_CSS(accent: string) {
  return `
    table{width:100%;border-collapse:collapse}
    th,td{border:1px solid #d4d0c4;padding:6px 8px}
    .qp-th th{background:${accent};color:#fff;border-color:${accent}}
  `;
}
