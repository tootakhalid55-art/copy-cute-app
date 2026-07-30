import { useState, useRef, useEffect, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Plus, Trash2, Printer, Eye, X, Pencil, Upload, Check } from "lucide-react";
import QRCode from "qrcode";
import { Shell, PrimaryBtn, OutlineBtn } from "./Shell";
import { useCollection, useKV } from "@/lib/haseem/store";
import { useInvoiceTemplates, type DocKind } from "@/lib/haseem/templates";
import { makeZatcaQrPayload, printDoc } from "@/lib/haseem/printDoc";
import { DocumentSidePanel } from "./DocumentSidePanel";
import { useOrg } from "@/lib/db/org";
import { syncDocumentToCloud, toDocKind } from "@/lib/db/document-bridge";
import { buildVerifyUrl, signDoc } from "@/lib/haseem/docSignature";

// Read a File as base64 data URL
function fileToDataURL(f: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result || ""));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(f);
  });
}

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
  docId,
  kind,
}: {
  storageKey: string;
  partyKey: string;
  partyLabel: string;
  title: string;
  subtitle?: string;
  backTo: string;
  docPrefix: string;
  docId?: string;
  kind?: DocKind;
}) {
  const navigate = useNavigate();
  const { items: parties, add: addParty } = useCollection<any>(partyKey);
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

  const [ref, setRef] = useState(
    existing?.ref ?? `${docPrefix}-${Math.floor(100000 + Math.random() * 900000)}`
  );
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(existing?.date ?? today);
  const [dueDate, setDueDate] = useState(existing?.dueDate ?? today);
  const [partyId, setPartyId] = useState(existing?.partyId ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [lines, setLines] = useState<Line[]>(
    existing?.lines ?? [{ description: "", qty: 1, price: 0, tax: 15 }]
  );
  // Hydrate when the record loads asynchronously
  useEffect(() => {
    if (existing) {
      setRef(existing.ref);
      setDate(existing.date);
      setDueDate(existing.dueDate);
      setPartyId(existing.partyId ?? "");
      setNotes(existing.notes ?? "");
      setLines(existing.lines ?? [{ description: "", qty: 1, price: 0, tax: 15 }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId, existing?.id]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [partyModalOpen, setPartyModalOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [verifyQrDataUrl, setVerifyQrDataUrl] = useState<string>("");
  const [verifyToken, setVerifyToken] = useState<string>("");
  const printRef = useRef<HTMLDivElement>(null);
  const emptyParty = {
    // Basic
    type: "individual" as "individual" | "company",
    name: "",
    displayName: "",
    email: "",
    phone: "",
    mobile: "",
    website: "",
    // Tax/registration
    taxNumber: "",
    commercialReg: "",
    taxGroup: "standard",
    category: "",
    currency: "SAR",
    // Financial
    openingBalance: 0,
    creditLimit: 0,
    paymentTerms: "0",
    // Address
    country: "SA",
    city: "",
    region: "",
    district: "",
    street: "",
    buildingNo: "",
    postalCode: "",
    additionalNo: "",
    // Shipping
    shippingAddress: "",
    // Contact person
    contactName: "",
    contactPhone: "",
    contactEmail: "",
    notes: "",
  };
  const [newParty, setNewParty] = useState(emptyParty);
  const [partyTab, setPartyTab] = useState<"basic" | "address" | "financial" | "contact">("basic");

  const submitNewParty = () => {
    if (!newParty.name.trim()) return;
    const rec = addParty({ ...newParty, name: newParty.name.trim() });
    setPartyId(rec.id);
    setPartyModalOpen(false);
    setPartyTab("basic");
    setNewParty(emptyParty);
  };

  const party = parties.find((p) => p.id === partyId);
  const partyName = party?.name ?? "—";

  const { currentOrgId } = useOrg();
  const cloudKind = useMemo(() => toDocKind(kind ?? storageKey), [kind, storageKey]);
  // Selected invoice template — drives accent color & style variant in preview/print
  const { all: allTemplates, selected: tpl, selectedId, setSelectedId } = useInvoiceTemplates(kind);
  const usesZatcaQr = useMemo(() => ["invoice", "credit-note", "debit-note"].includes(cloudKind), [cloudKind]);
  const usesVerifyQr = useMemo(() => ["quotation", "purchase-order", "payment_voucher", "receipt_voucher", "journal_voucher", "expense_voucher"].includes(cloudKind), [cloudKind]);

  // Round half-up to 2 decimals (matches ZATCA / Qoyod invoice math)
  const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  // Arabic-Latin style: 1,234.56 with exactly 2 decimals
  const fmt = (n: number) =>
    r2(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const CUR = "ر.س";

  // Per-line rounded values, then aggregate — same convention as Qoyod
  const lineCalcs = lines.map((l) => {
    const net = r2(l.qty * l.price);
    const taxAmt = r2((net * l.tax) / 100);
    return { net, taxAmt, gross: r2(net + taxAmt) };
  });
  const subtotal = r2(lineCalcs.reduce((s, c) => s + c.net, 0));
  const tax = r2(lineCalcs.reduce((s, c) => s + c.taxAmt, 0));
  const total = r2(subtotal + tax);

  useEffect(() => {
    const iso = new Date(`${date}T00:00:00`).toISOString();
    if (usesZatcaQr) {
      const payload = makeZatcaQrPayload({
        sellerName: org.name,
        vatNumber: org.taxNumber,
        issuedAtIso: iso,
        totalWithVat: total,
        vatAmount: tax,
      });
      QRCode.toDataURL(payload, { margin: 1, width: 180 })
        .then(setQrDataUrl)
        .catch(() => setQrDataUrl(""));
      setVerifyQrDataUrl("");
      return;
    }
    setQrDataUrl("");
    if (!usesVerifyQr) {
      setVerifyQrDataUrl("");
      setVerifyToken("");
      return;
    }
    signDoc({ kind: cloudKind, ref, total })
      .then((token) => {
        setVerifyToken(token);
        return buildVerifyUrl(cloudKind, ref, token);
      })
      .then((verifyUrl) => QRCode.toDataURL(verifyUrl, { margin: 1, width: 180 }))
      .then(setVerifyQrDataUrl)
      .catch(() => setVerifyQrDataUrl(""));
  }, [org.name, org.taxNumber, date, total, tax, usesZatcaQr, usesVerifyQr, cloudKind, ref]);

  const handlePrint = () => {
    printDoc({
      title,
      ref, date, dueDate,
      org, party, partyLabel,
      lines, lineCalcs,
      subtotal, tax, total,
      notes,
      currency: CUR,
      qrDataUrl: usesZatcaQr ? qrDataUrl : undefined,
      branding,
      tpl,
      verify: usesVerifyQr && verifyQrDataUrl && verifyToken
        ? { qrDataUrl: verifyQrDataUrl, url: buildVerifyUrl(cloudKind, ref, verifyToken), label: "التحقق من المستند · Verify Document" }
        : undefined,
    });
  };



  const updateLine = (i: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const [dbId, setDbId] = useState<string | null>(existing?.dbId ?? null);
  useEffect(() => {
    setDbId(existing?.dbId ?? null);
  }, [existing?.id, existing?.dbId]);
  const [enablingCloud, setEnablingCloud] = useState(false);
  const [uploading, setUploading] = useState(false);

  const validation = useMemo(() => {
    const errs: string[] = [];
    if (!partyId) errs.push(`اختر ${partyLabel}`);
    if (!lines.length) errs.push("أضف صنفاً واحداً على الأقل");
    lines.forEach((l, i) => {
      if (!l.description?.trim()) errs.push(`الصنف ${i + 1}: الوصف مطلوب`);
      if (!(Number(l.qty) > 0)) errs.push(`الصنف ${i + 1}: الكمية يجب أن تكون > 0`);
      if (Number(l.price) < 0) errs.push(`الصنف ${i + 1}: السعر غير صالح`);
    });
    return errs;
  }, [partyId, partyLabel, lines]);
  const isValid = validation.length === 0;

  const save = async (finalStatus: string) => {
    const payload: any = {
      ref, date, dueDate, partyId, partyName, notes,
      status: finalStatus, lines, subtotal, tax, total,
      dbId,
    };
    let localId = existing?.id;
    if (existing) update(existing.id, payload);
    else {
      const rec = add(payload);
      localId = rec?.id;
    }
    // Best-effort mirror to Supabase when cloud already enabled for this doc
    if (currentOrgId && dbId) {
      try {
        await syncDocumentToCloud(currentOrgId, cloudKind, { ...payload, id: localId }, dbId);
      } catch (e: any) {
        console.error("cloud sync failed", e);
      }
    }
    navigate({ to: backTo });
  };

  const enableCloud = async () => {
    if (!currentOrgId) {
      alert("اختر منشأة أولاً لتفعيل التخزين السحابي");
      return;
    }
    if (!isValid) {
      alert(`لا يمكن التفعيل قبل استيفاء الحقول:\n- ${validation.join("\n- ")}`);
      return;
    }
    setEnablingCloud(true);
    try {
      const newDbId = await syncDocumentToCloud(
        currentOrgId,
        cloudKind,
        { id: existing?.id, ref, date, dueDate, partyId, partyName, notes, lines, subtotal, tax, total },
        null,
      );
      setDbId(newDbId);
      if (existing) update(existing.id, { dbId: newDbId } as any);
    } catch (e: any) {
      alert(`تعذّر التفعيل: ${e.message ?? e}`);
    } finally {
      setEnablingCloud(false);
    }
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
        <div className="flex gap-2 flex-wrap items-center">
          <div className="flex items-center gap-1.5 border border-[#eceae2] rounded-lg px-2 py-1 bg-white">
            <span className="text-xs text-[#0f2a1d]/60">القالب:</span>
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="bg-transparent text-sm outline-none max-w-[200px]"
              title="تغيير قالب المستند"
            >
              {allTemplates.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <span
              className="inline-block w-4 h-4 rounded border border-[#eceae2]"
              style={{ background: tpl.accent }}
              aria-hidden
            />
          </div>
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
          <PrimaryBtn
            onClick={() => save("مؤكد")}
            disabled={!isValid || uploading}
            title={!isValid ? validation.join(" · ") : uploading ? "يوجد مرفقات قيد الرفع" : undefined}
          >حفظ واعتماد</PrimaryBtn>
        </div>
      </div>


      <div className="rounded-xl bg-white border border-[#eceae2] p-5 grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
        <FormField label="رقم المستند">
          <div className="flex items-stretch gap-1">
            <input
              readOnly={!refEditing}
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              className={`border border-[#eceae2] rounded-lg px-3 py-2 flex-1 ${refEditing ? "bg-white" : "bg-[#f7f6f0]"}`}
            />
            <button
              type="button"
              onClick={() => setRefEditing((v) => !v)}
              className="border border-[#eceae2] rounded-lg px-2 hover:bg-[#f7f6f0]"
              title={refEditing ? "تأكيد" : "تعديل الرقم"}
            >
              {refEditing ? <Check className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
            </button>
          </div>
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
                    {fmt(lineCalcs[i].gross)} {CUR}
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
          <div className="space-y-3">
            <div>
              <label className="text-xs text-[#0f2a1d]/70">ملاحظات</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="border border-[#eceae2] rounded-lg px-3 py-2 w-full min-h-[80px] text-sm mt-1"
                placeholder="ملاحظات إضافية..."
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <ImagePicker
                label="الشعار"
                value={branding.logo}
                onChange={(v) => setBranding({ ...branding, logo: v })}
              />
              <ImagePicker
                label="الختم"
                value={branding.stamp}
                onChange={(v) => setBranding({ ...branding, stamp: v })}
              />
            </div>
          </div>
          <div className="space-y-2 text-sm">
            <Row label="المجموع الفرعي" value={`${fmt(subtotal)} ${CUR}`} />
            <Row label="الضريبة" value={`${fmt(tax)} ${CUR}`} />
            <Row label="الإجمالي" value={`${fmt(total)} ${CUR}`} bold />
          </div>
        </div>
      </div>

      {/* Hidden printable content */}
      <div className="hidden">
        <div ref={printRef}>
          <div className="head">
            <div className="brand">
              {branding.logo && <img src={branding.logo} alt="logo" style={{maxHeight:60,marginBottom:8}} />}
              <h1>{org.name}</h1>
              <p>الرقم الضريبي: {org.taxNumber}</p>
              <p>المملكة العربية السعودية</p>
            </div>
            <div className="doc-title">
              <h2>{title}</h2>
              <span className="ref">{ref}</span>
            </div>
          </div>
          <div className="parties">
            <div className="card">
              <div className="label">{partyLabel}</div>
              <div className="val">
                <strong>{partyName}</strong>
                {party?.taxNumber && <div>الرقم الضريبي: {party.taxNumber}</div>}
                {party?.phone && <div>الجوال: {party.phone}</div>}
                {party?.email && <div>البريد: {party.email}</div>}
              </div>
            </div>
            <div className="card">
              <div className="label">بيانات المستند</div>
              <div className="val">
                <div>التاريخ: <strong style={{display:"inline"}}>{date}</strong></div>
                <div>الاستحقاق: <strong style={{display:"inline"}}>{dueDate}</strong></div>
              </div>
            </div>
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
                  <td>{l.description || "—"}</td>
                  <td>{l.qty}</td>
                  <td>{fmt(l.price)}</td>
                  <td>{l.tax}%</td>
                  <td>{fmt(lineCalcs[i].gross)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="bottom">
            <div className="qr">
              {qrDataUrl && <img src={qrDataUrl} alt="ZATCA QR" width={150} height={150} />}
              <div className="cap">
                {usesZatcaQr ? "رمز الفاتورة (ZATCA)" : "رمز التحقق من المستند"}
              </div>
              {branding.stamp && <img src={branding.stamp} alt="stamp" style={{maxHeight:100,marginTop:8}} />}
            </div>
            <div className="notes">
              {notes ? <><strong>ملاحظات:</strong><br />{notes}</> : <span style={{color:"#999"}}>—</span>}
            </div>
            <div className="totals">
              <div><span>المجموع الفرعي</span><span>{fmt(subtotal)} {CUR}</span></div>
              <div><span>ضريبة القيمة المضافة (15%)</span><span>{fmt(tax)} {CUR}</span></div>
              <div className="grand"><span>الإجمالي شامل الضريبة</span><span>{fmt(total)} {CUR}</span></div>
            </div>
          </div>
          <div className="foot">شكراً لتعاملكم معنا · {org.name}</div>
        </div>
      </div>

      {previewOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 overflow-auto" onClick={() => setPreviewOpen(false)}>
          <div className="bg-white rounded-xl max-w-3xl w-full my-8 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-3 border-b border-[#eceae2] bg-[#fafaf7]">
              <div className="flex items-center gap-3">
                <h2 className="text-base font-bold">معاينة الفاتورة</h2>
                <span
                  className="text-[11px] px-2 py-0.5 rounded-full"
                  style={{ background: tpl.soft, color: tpl.accent, border: `1px solid ${tpl.accent}33` }}
                >
                  قالب: {tpl.name}
                </span>
              </div>
              <div className="flex gap-2">
                <OutlineBtn type="button" onClick={handlePrint}>
                  <Printer className="w-4 h-4" /> طباعة
                </OutlineBtn>
                <button onClick={() => setPreviewOpen(false)} className="p-2 rounded hover:bg-[#eceae2]">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="p-8 text-sm">
              <div
                className="flex justify-between items-start pb-4 mb-5"
                style={{ borderBottom: `3px solid ${tpl.accent}` }}
              >
                <div>
                  {branding.logo && <img src={branding.logo} alt="logo" className="max-h-16 mb-2 object-contain" />}
                  <h1 className="text-xl font-bold m-0" style={{ color: tpl.accent }}>{org.name}</h1>
                  <p className="text-xs text-[#0f2a1d]/70 mt-1">الرقم الضريبي: {org.taxNumber}</p>
                  <p className="text-xs text-[#0f2a1d]/70">المملكة العربية السعودية</p>
                </div>
                <div className="text-left">
                  <h2 className="text-lg font-bold m-0" style={{ color: tpl.accent }}>{title}</h2>
                  <span
                    className="inline-block mt-1 px-3 py-1 rounded text-xs"
                    style={{ background: tpl.accent, color: tpl.onAccent }}
                  >
                    {ref}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 mb-5">
                <div className="border border-[#eceae2] rounded-lg p-3" style={{ background: tpl.soft }}>
                  <div className="text-[11px] text-[#0f2a1d]/60 font-semibold mb-1">{partyLabel}</div>
                  <div className="font-semibold">{partyName}</div>
                  {party?.taxNumber && <div className="text-xs text-[#0f2a1d]/70">الرقم الضريبي: {party.taxNumber}</div>}
                  {party?.phone && <div className="text-xs text-[#0f2a1d]/70">الجوال: {party.phone}</div>}
                  {party?.email && <div className="text-xs text-[#0f2a1d]/70">البريد: {party.email}</div>}
                </div>
                <div className="border border-[#eceae2] rounded-lg p-3" style={{ background: tpl.soft }}>
                  <div className="text-[11px] text-[#0f2a1d]/60 font-semibold mb-1">بيانات المستند</div>
                  <div className="text-xs">التاريخ: <strong>{date}</strong></div>
                  <div className="text-xs">الاستحقاق: <strong>{dueDate}</strong></div>
                </div>
              </div>
              <table className="w-full border-collapse text-xs mb-4">
                <thead>
                  <tr style={{ background: tpl.accent, color: tpl.onAccent }}>
                    <th className="p-2 text-right" style={{ border: `1px solid ${tpl.accent}` }}>#</th>
                    <th className="p-2 text-right" style={{ border: `1px solid ${tpl.accent}` }}>الوصف</th>
                    <th className="p-2 text-right" style={{ border: `1px solid ${tpl.accent}` }}>الكمية</th>
                    <th className="p-2 text-right" style={{ border: `1px solid ${tpl.accent}` }}>السعر</th>
                    <th className="p-2 text-right" style={{ border: `1px solid ${tpl.accent}` }}>الضريبة %</th>
                    <th className="p-2 text-right" style={{ border: `1px solid ${tpl.accent}` }}>المبلغ</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={i} style={i % 2 ? { background: tpl.soft } : undefined}>
                      <td className="border border-[#d4d0c4] p-2">{i + 1}</td>
                      <td className="border border-[#d4d0c4] p-2">{l.description || "—"}</td>
                      <td className="border border-[#d4d0c4] p-2">{l.qty}</td>
                      <td className="border border-[#d4d0c4] p-2 tabular-nums">{fmt(l.price)}</td>
                      <td className="border border-[#d4d0c4] p-2">{l.tax}%</td>
                      <td className="border border-[#d4d0c4] p-2 tabular-nums">{fmt(lineCalcs[i].gross)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="grid grid-cols-[160px_1fr_240px] gap-4 items-start">
                <div className="text-center">
                  {usesZatcaQr && qrDataUrl && <img src={qrDataUrl} alt="ZATCA QR" className="border border-[#eceae2] p-1.5 rounded bg-white mx-auto" width={140} height={140} />}
                  {usesVerifyQr && verifyQrDataUrl && <img src={verifyQrDataUrl} alt="Document Verify QR" className="border border-[#eceae2] p-1.5 rounded bg-white mx-auto" width={140} height={140} />}
                  <div className="text-[10px] text-[#0f2a1d]/60 mt-1">
                    {usesZatcaQr ? "رمز الفاتورة (ZATCA)" : "رمز التحقق من المستند"}
                  </div>
                  {branding.stamp && <img src={branding.stamp} alt="stamp" className="max-h-24 mx-auto mt-2 object-contain" />}
                </div>
                <div
                  className="text-xs rounded p-3"
                  style={{ background: tpl.soft, borderRight: `3px solid ${tpl.accent}` }}
                >
                  {notes ? <><strong>ملاحظات:</strong><br />{notes}</> : <span className="text-[#0f2a1d]/40">لا توجد ملاحظات</span>}
                </div>
                <div className="text-sm space-y-1">
                  <div className="flex justify-between py-1.5 border-b border-[#eceae2]"><span>المجموع الفرعي</span><span className="tabular-nums">{fmt(subtotal)} {CUR}</span></div>
                  <div className="flex justify-between py-1.5 border-b border-[#eceae2]"><span>ضريبة القيمة المضافة (15%)</span><span className="tabular-nums">{fmt(tax)} {CUR}</span></div>
                  <div
                    className="flex justify-between px-3 py-2.5 rounded font-bold mt-1"
                    style={{ background: tpl.accent, color: tpl.onAccent }}
                  >
                    <span>الإجمالي شامل الضريبة</span><span className="tabular-nums">{fmt(total)} {CUR}</span>
                  </div>
                </div>
              </div>
              <div className="text-center text-[11px] text-[#0f2a1d]/50 mt-6 pt-3 border-t border-[#eceae2]">شكراً لتعاملكم معنا · {org.name}</div>
            </div>
          </div>
        </div>
      )}


      {partyModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 overflow-auto" onClick={() => setPartyModalOpen(false)}>
          <div className="bg-white rounded-xl w-full max-w-3xl my-6 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-3 border-b border-[#eceae2] bg-[#fafaf7]">
              <div>
                <h2 className="text-base font-bold">إضافة {partyLabel} جديد</h2>
                <p className="text-[11px] text-[#0f2a1d]/60">أدخل البيانات الكاملة للطرف — الحقول المميزة بـ * إلزامية</p>
              </div>
              <button onClick={() => setPartyModalOpen(false)} className="p-2 rounded hover:bg-[#eceae2]">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex gap-1 px-6 pt-3 border-b border-[#eceae2] text-sm">
              {([
                ["basic", "البيانات الأساسية"],
                ["address", "العنوان"],
                ["financial", "البيانات المالية"],
                ["contact", "شخص التواصل"],
              ] as const).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setPartyTab(k)}
                  className={`px-4 py-2 rounded-t-lg -mb-px border-b-2 ${
                    partyTab === k
                      ? "border-[#0f2a1d] font-semibold text-[#0f2a1d]"
                      : "border-transparent text-[#0f2a1d]/60 hover:text-[#0f2a1d]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="p-6 text-sm max-h-[60vh] overflow-auto">
              {partyTab === "basic" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField label="نوع الطرف">
                    <select
                      value={newParty.type}
                      onChange={(e) => setNewParty((p) => ({ ...p, type: e.target.value as any }))}
                      className="border border-[#eceae2] rounded-lg px-3 py-2 bg-white"
                    >
                      <option value="individual">فرد</option>
                      <option value="company">شركة / منشأة</option>
                    </select>
                  </FormField>
                  <FormField label="الاسم *">
                    <input
                      autoFocus
                      maxLength={100}
                      value={newParty.name}
                      onChange={(e) => setNewParty((p) => ({ ...p, name: e.target.value }))}
                      className="border border-[#eceae2] rounded-lg px-3 py-2"
                      placeholder={`اسم ${partyLabel}`}
                    />
                  </FormField>
                  <FormField label="الاسم المعروض (اختياري)">
                    <input
                      maxLength={100}
                      value={newParty.displayName}
                      onChange={(e) => setNewParty((p) => ({ ...p, displayName: e.target.value }))}
                      className="border border-[#eceae2] rounded-lg px-3 py-2"
                    />
                  </FormField>
                  <FormField label="التصنيف">
                    <input
                      maxLength={50}
                      value={newParty.category}
                      onChange={(e) => setNewParty((p) => ({ ...p, category: e.target.value }))}
                      className="border border-[#eceae2] rounded-lg px-3 py-2"
                      placeholder="VIP / تجزئة / جملة..."
                    />
                  </FormField>
                  <FormField label="البريد الإلكتروني">
                    <input
                      type="email"
                      maxLength={255}
                      value={newParty.email}
                      onChange={(e) => setNewParty((p) => ({ ...p, email: e.target.value }))}
                      className="border border-[#eceae2] rounded-lg px-3 py-2"
                    />
                  </FormField>
                  <FormField label="الموقع الإلكتروني">
                    <input
                      maxLength={255}
                      value={newParty.website}
                      onChange={(e) => setNewParty((p) => ({ ...p, website: e.target.value }))}
                      className="border border-[#eceae2] rounded-lg px-3 py-2"
                      placeholder="https://"
                    />
                  </FormField>
                  <FormField label="الهاتف">
                    <input
                      maxLength={20}
                      value={newParty.phone}
                      onChange={(e) => setNewParty((p) => ({ ...p, phone: e.target.value }))}
                      className="border border-[#eceae2] rounded-lg px-3 py-2"
                    />
                  </FormField>
                  <FormField label="الجوال">
                    <input
                      maxLength={20}
                      value={newParty.mobile}
                      onChange={(e) => setNewParty((p) => ({ ...p, mobile: e.target.value }))}
                      className="border border-[#eceae2] rounded-lg px-3 py-2"
                    />
                  </FormField>
                  <FormField label="الرقم الضريبي">
                    <input
                      maxLength={15}
                      value={newParty.taxNumber}
                      onChange={(e) => setNewParty((p) => ({ ...p, taxNumber: e.target.value.replace(/[^0-9]/g, "") }))}
                      className="border border-[#eceae2] rounded-lg px-3 py-2"
                      placeholder="15 رقم"
                    />
                  </FormField>
                  <FormField label="السجل التجاري">
                    <input
                      maxLength={20}
                      value={newParty.commercialReg}
                      onChange={(e) => setNewParty((p) => ({ ...p, commercialReg: e.target.value }))}
                      className="border border-[#eceae2] rounded-lg px-3 py-2"
                    />
                  </FormField>
                  <FormField label="مجموعة الضريبة">
                    <select
                      value={newParty.taxGroup}
                      onChange={(e) => setNewParty((p) => ({ ...p, taxGroup: e.target.value }))}
                      className="border border-[#eceae2] rounded-lg px-3 py-2 bg-white"
                    >
                      <option value="standard">الأساسية (15%)</option>
                      <option value="zero">صفرية (0%)</option>
                      <option value="exempt">معفاة</option>
                      <option value="out">خارج نطاق الضريبة</option>
                    </select>
                  </FormField>
                  <FormField label="العملة">
                    <select
                      value={newParty.currency}
                      onChange={(e) => setNewParty((p) => ({ ...p, currency: e.target.value }))}
                      className="border border-[#eceae2] rounded-lg px-3 py-2 bg-white"
                    >
                      <option value="SAR">ريال سعودي (SAR)</option>
                      <option value="USD">دولار أمريكي (USD)</option>
                      <option value="EUR">يورو (EUR)</option>
                      <option value="AED">درهم إماراتي (AED)</option>
                    </select>
                  </FormField>
                </div>
              )}

              {partyTab === "address" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField label="الدولة">
                    <select
                      value={newParty.country}
                      onChange={(e) => setNewParty((p) => ({ ...p, country: e.target.value }))}
                      className="border border-[#eceae2] rounded-lg px-3 py-2 bg-white"
                    >
                      <option value="SA">المملكة العربية السعودية</option>
                      <option value="AE">الإمارات</option>
                      <option value="KW">الكويت</option>
                      <option value="BH">البحرين</option>
                      <option value="QA">قطر</option>
                      <option value="OM">عُمان</option>
                      <option value="EG">مصر</option>
                    </select>
                  </FormField>
                  <FormField label="المدينة">
                    <input maxLength={50} value={newParty.city} onChange={(e) => setNewParty((p) => ({ ...p, city: e.target.value }))} className="border border-[#eceae2] rounded-lg px-3 py-2" />
                  </FormField>
                  <FormField label="المنطقة">
                    <input maxLength={50} value={newParty.region} onChange={(e) => setNewParty((p) => ({ ...p, region: e.target.value }))} className="border border-[#eceae2] rounded-lg px-3 py-2" />
                  </FormField>
                  <FormField label="الحي">
                    <input maxLength={50} value={newParty.district} onChange={(e) => setNewParty((p) => ({ ...p, district: e.target.value }))} className="border border-[#eceae2] rounded-lg px-3 py-2" />
                  </FormField>
                  <FormField label="الشارع">
                    <input maxLength={100} value={newParty.street} onChange={(e) => setNewParty((p) => ({ ...p, street: e.target.value }))} className="border border-[#eceae2] rounded-lg px-3 py-2" />
                  </FormField>
                  <FormField label="رقم المبنى">
                    <input maxLength={10} value={newParty.buildingNo} onChange={(e) => setNewParty((p) => ({ ...p, buildingNo: e.target.value }))} className="border border-[#eceae2] rounded-lg px-3 py-2" />
                  </FormField>
                  <FormField label="الرمز البريدي">
                    <input maxLength={10} value={newParty.postalCode} onChange={(e) => setNewParty((p) => ({ ...p, postalCode: e.target.value.replace(/[^0-9]/g, "") }))} className="border border-[#eceae2] rounded-lg px-3 py-2" />
                  </FormField>
                  <FormField label="الرقم الإضافي">
                    <input maxLength={10} value={newParty.additionalNo} onChange={(e) => setNewParty((p) => ({ ...p, additionalNo: e.target.value.replace(/[^0-9]/g, "") }))} className="border border-[#eceae2] rounded-lg px-3 py-2" />
                  </FormField>
                  <div className="md:col-span-2">
                    <FormField label="عنوان الشحن (إن اختلف)">
                      <textarea
                        maxLength={300}
                        value={newParty.shippingAddress}
                        onChange={(e) => setNewParty((p) => ({ ...p, shippingAddress: e.target.value }))}
                        className="border border-[#eceae2] rounded-lg px-3 py-2 min-h-[70px]"
                      />
                    </FormField>
                  </div>
                </div>
              )}

              {partyTab === "financial" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField label="الرصيد الافتتاحي">
                    <input
                      type="number"
                      step="0.01"
                      value={newParty.openingBalance}
                      onChange={(e) => setNewParty((p) => ({ ...p, openingBalance: Number(e.target.value) || 0 }))}
                      className="border border-[#eceae2] rounded-lg px-3 py-2 tabular-nums"
                    />
                  </FormField>
                  <FormField label="حد الائتمان">
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      value={newParty.creditLimit}
                      onChange={(e) => setNewParty((p) => ({ ...p, creditLimit: Number(e.target.value) || 0 }))}
                      className="border border-[#eceae2] rounded-lg px-3 py-2 tabular-nums"
                    />
                  </FormField>
                  <FormField label="شروط الدفع (أيام)">
                    <select
                      value={newParty.paymentTerms}
                      onChange={(e) => setNewParty((p) => ({ ...p, paymentTerms: e.target.value }))}
                      className="border border-[#eceae2] rounded-lg px-3 py-2 bg-white"
                    >
                      <option value="0">نقدي</option>
                      <option value="7">7 أيام</option>
                      <option value="15">15 يوم</option>
                      <option value="30">30 يوم</option>
                      <option value="45">45 يوم</option>
                      <option value="60">60 يوم</option>
                      <option value="90">90 يوم</option>
                    </select>
                  </FormField>
                  <div className="md:col-span-2">
                    <FormField label="ملاحظات">
                      <textarea
                        maxLength={500}
                        value={newParty.notes}
                        onChange={(e) => setNewParty((p) => ({ ...p, notes: e.target.value }))}
                        className="border border-[#eceae2] rounded-lg px-3 py-2 min-h-[80px]"
                      />
                    </FormField>
                  </div>
                </div>
              )}

              {partyTab === "contact" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField label="اسم شخص التواصل">
                    <input maxLength={100} value={newParty.contactName} onChange={(e) => setNewParty((p) => ({ ...p, contactName: e.target.value }))} className="border border-[#eceae2] rounded-lg px-3 py-2" />
                  </FormField>
                  <FormField label="جوال شخص التواصل">
                    <input maxLength={20} value={newParty.contactPhone} onChange={(e) => setNewParty((p) => ({ ...p, contactPhone: e.target.value }))} className="border border-[#eceae2] rounded-lg px-3 py-2" />
                  </FormField>
                  <FormField label="بريد شخص التواصل">
                    <input type="email" maxLength={255} value={newParty.contactEmail} onChange={(e) => setNewParty((p) => ({ ...p, contactEmail: e.target.value }))} className="border border-[#eceae2] rounded-lg px-3 py-2" />
                  </FormField>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 px-6 py-3 border-t border-[#eceae2] bg-[#fafaf7]">
              <span className="text-[11px] text-[#0f2a1d]/50">
                {!newParty.name.trim() && "أدخل الاسم للحفظ"}
              </span>
              <div className="flex gap-2">
                <OutlineBtn type="button" onClick={() => setPartyModalOpen(false)}>إلغاء</OutlineBtn>
                <PrimaryBtn onClick={submitNewParty} disabled={!newParty.name.trim()}>حفظ</PrimaryBtn>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="mt-6">
        <DocumentSidePanel
          orgId={currentOrgId}
          dbDocId={dbId}
          enabling={enablingCloud}
          onEnable={enableCloud}
          onUploadingChange={setUploading}
        />
      </div>
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

function ImagePicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="border border-[#eceae2] rounded-lg p-2 text-center">
      <div className="text-[11px] text-[#0f2a1d]/60 mb-1">{label}</div>
      {value ? (
        <div className="relative">
          <img src={value} alt={label} className="max-h-20 mx-auto object-contain" />
          <div className="flex gap-1 justify-center mt-1">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="text-[11px] px-2 py-0.5 rounded border border-[#eceae2] hover:bg-[#f7f6f0] inline-flex items-center gap-1"
            >
              <Pencil className="w-3 h-3" /> تغيير
            </button>
            <button
              type="button"
              onClick={() => onChange("")}
              className="text-[11px] px-2 py-0.5 rounded border border-red-200 text-red-600 hover:bg-red-50 inline-flex items-center gap-1"
            >
              <Trash2 className="w-3 h-3" /> حذف
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="w-full py-4 border-2 border-dashed border-[#eceae2] rounded text-xs text-[#0f2a1d]/60 hover:bg-[#faf9f4] inline-flex flex-col items-center gap-1"
        >
          <Upload className="w-4 h-4" /> رفع {label}
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          const url = await fileToDataURL(f);
          onChange(url);
          e.target.value = "";
        }}
      />
    </div>
  );
}
