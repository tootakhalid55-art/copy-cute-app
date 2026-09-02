import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Plus, Trash2, Printer, Eye, EyeOff, X, Save, Send,
  SlidersHorizontal, Paperclip, Upload, Bookmark, Maximize2, Pencil, Check,
} from "lucide-react";
import { Shell, PrimaryBtn, OutlineBtn } from "./Shell";
import { useCollection, useKV } from "@/lib/haseem/store";
import { contrastColorFor, tintColorFor, useInvoiceTemplates } from "@/lib/haseem/templates";
import { printDoc, DOC_STRUCTURES } from "@/lib/haseem/printDoc";
import { buildTokenVerifyUrl, newVerifyToken } from "@/lib/haseem/docSignature";
import QRCode from "qrcode";
import { DocumentSidePanel } from "./DocumentSidePanel";
import { QuotationPreview } from "./QuotationPreview";
import { useOrg } from "@/lib/db/org";
import { toDocKind } from "@/lib/db/document-bridge";

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

  const { items: parties, addAsync: addPartyAsync } = useCollection<any>(partyKey);
  const { items: products } = useCollection<any>("items");
  const { items: docs, addAsync, update } = useCollection<any>(storageKey);
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
  const [structureId, setStructureId] = useKV<string>("doc-structure:quotation", "boxed");
  const structure = structureId as "boxed" | "banner" | "minimal" | "corporate" | "thermal";
  const [docColor, setDocColor] = useKV<string>("doc-color:quotation", "#0d9488");
  // Quotation-specific templates (settings → قوالب المستندات، تبويب عروض الأسعار)
  const { all: tplList, selected: selectedTpl, selectedId: tplId, setSelectedId: setTplId } = useInvoiceTemplates("quotation");
  const [tplMode, setTplMode] = useKV<"template" | "custom">("doc-tpl-mode:quotation", "template");
  const tpl = tplMode === "custom" || !selectedTpl
    ? { name: "مخصص", accent: docColor, onAccent: contrastColorFor(docColor), soft: tintColorFor(docColor) }
    : { name: selectedTpl.name, accent: selectedTpl.accent, onAccent: selectedTpl.onAccent, soft: selectedTpl.soft };

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

  const { currentOrgId } = useOrg();
  const cloudKind = useMemo(() => toDocKind("sales-quotation"), []);
  const [dbId, setDbId] = useState<string | null>((existing as any)?.dbId ?? existing?.id ?? null);
  useEffect(() => { setDbId((existing as any)?.dbId ?? existing?.id ?? null); }, [existing?.id]);

  // Server-verifiable stamp: a stable per-document token stored with the
  // document; the QR resolves through /api/public/verify from any device.
  const [verifyToken, setVerifyToken] = useState<string>(() => (existing as any)?.verifyToken ?? newVerifyToken());
  useEffect(() => {
    const t = (existing as any)?.verifyToken;
    if (t) setVerifyToken(t);
  }, [existing?.id]);
  const verifyUrl = useMemo(() => buildTokenVerifyUrl(ref, verifyToken), [ref, verifyToken]);
  const [verifyQrDataUrl, setVerifyQrDataUrl] = useState("");
  useEffect(() => {
    QRCode.toDataURL(verifyUrl, { margin: 1, width: 220 })
      .then(setVerifyQrDataUrl)
      .catch(() => setVerifyQrDataUrl(""));
  }, [verifyUrl]);
  const verify = useMemo(
    () => (verifyQrDataUrl ? { qrDataUrl: verifyQrDataUrl, url: verifyUrl, label: "التحقق من المستند · Verify Document" } : undefined),
    [verifyQrDataUrl, verifyUrl],
  );
  const [enablingCloud, setEnablingCloud] = useState(false);
  const [uploading, setUploading] = useState(false);

  const validation = useMemo(() => {
    const errs: string[] = [];
    if (!partyId) errs.push("اختر العميل");
    if (!lines.length) errs.push("أضف صنفاً واحداً على الأقل");
    lines.forEach((l, i) => {
      if (!l.description?.trim()) errs.push(`الصنف ${i + 1}: الوصف مطلوب`);
      if (!(Number(l.qty) > 0)) errs.push(`الصنف ${i + 1}: الكمية يجب أن تكون > 0`);
    });
    return errs;
  }, [partyId, lines]);
  const isValid = validation.length === 0;

  const save = async (status: string) => {
    const payload: any = {
      ref, date, expiry, dueDate: expiry, partyId,
      partyName: party?.name ?? "—",
      notes, lines, subtotal, tax, total,
      poNumber, reference, project, currency, priceMode, optCols,
      discount, discountEnabled, shipping, shippingEnabled,
      status,
      dbId,
      verifyToken,
    };
    // The collections adapter persists straight to the `documents` table now.
    try {
      if (existing) update(existing.id, payload);
      else await addAsync(payload);
      navigate({ to: backTo });
    } catch (e: any) {
      alert(`تعذّر الحفظ: ${e?.message ?? e}`);
    }
  };

  // Documents are cloud-native now — kept as a no-op for the side panel prop.
  const enableCloud = async () => {};

  // New party quick-add
  const [newParty, setNewParty] = useState<any>({ name: "", taxNumber: "", email: "", phone: "" });
  const [savingParty, setSavingParty] = useState(false);
  const submitNewParty = async () => {
    if (!newParty.name.trim() || savingParty) return;
    setSavingParty(true);
    try {
      const rec = await addPartyAsync({ ...newParty, name: newParty.name.trim() });
      setPartyId(rec.id);
      setPartyModalOpen(false);
      setNewParty({ name: "", taxNumber: "", email: "", phone: "" });
    } catch (e: any) {
      alert(`تعذّر حفظ السجل: ${e?.message ?? e}`);
    } finally {
      setSavingParty(false);
    }
  };

  // Printing
  const handlePrint = async () => {
    try {
      const verifyQr = verifyQrDataUrl || (await QRCode.toDataURL(verifyUrl, { margin: 1, width: 220 }));
      printDoc({
        kind: "quotation",
        title: "عرض سعر",
        titleEn: "Quotation",
        ref, date, expiry,
        org, party, partyLabel: "العميل",
        lines, lineCalcs,
        subtotal, tax, total,
        discAmt, shipAmt,
        notes,
        terms: notes,
        partyRole: "العميل",
        currency: CUR,
        branding,
        tpl,
        poNumber: optCols.poNumber ? poNumber : undefined,
        reference: optCols.reference ? reference : undefined,
        project: optCols.project ? project : undefined,
        bilingual: true,
        verify: { qrDataUrl: verifyQr, url: verifyUrl, label: "التحقق من المستند · Verify Document" },
        structure,
      });
    } catch (error) {
      console.warn("quotation print verification failed, printing fallback", error);
      printDoc({
        kind: "quotation",
        title: "عرض سعر",
        titleEn: "Quotation",
        ref, date, expiry,
        org, party, partyLabel: "العميل",
        lines, lineCalcs,
        subtotal, tax, total,
        discAmt: 0,
        shipAmt: 0,
        notes,
        terms: notes,
        partyRole: "العميل",
        currency: CUR,
        branding,
        tpl,
        poNumber: optCols.poNumber ? poNumber : undefined,
        reference: optCols.reference ? reference : undefined,
        project: optCols.project ? project : undefined,
        bilingual: true,
        structure,
      });
    }
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
          <div className="flex items-center gap-1.5 border border-[#eceae2] rounded px-2 py-1">
            <span className="text-xs text-[#0f2a1d]/60">القالب:</span>
            <select
              value={tplMode === "custom" ? "__custom" : tplId}
              onChange={(e) => {
                if (e.target.value === "__custom") { setTplMode("custom"); return; }
                setTplId(e.target.value); setTplMode("template");
              }}
              className="bg-transparent text-sm outline-none max-w-[190px]"
              title="قوالب عروض الأسعار (تُدار من الإعدادات ← قوالب المستندات)"
            >
              {tplList.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
              <option value="__custom">مخصص (لون يدوي)</option>
            </select>
          </div>
          <div className="flex items-center gap-1.5 border border-[#eceae2] rounded px-2 py-1">
            <span className="text-xs text-[#0f2a1d]/60">الهيكل:</span>
            <select
              value={structureId}
              onChange={(e) => setStructureId(e.target.value)}
              className="bg-transparent text-sm outline-none max-w-[180px]"
              title="تغيير الهيكل التصميمي لعرض السعر"
            >
              {DOC_STRUCTURES.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-1.5 border border-[#eceae2] rounded px-2 py-1 cursor-pointer" title="لون الهوية لعرض السعر">
            <span className="text-xs text-[#0f2a1d]/60">اللون:</span>
            <input
              type="color"
              value={docColor}
              onChange={(e) => { setDocColor(e.target.value); setTplMode("custom"); }}
              className="w-6 h-6 rounded border border-[#eceae2] cursor-pointer bg-transparent p-0"
            />
          </label>
          <button type="button" onClick={() => setPreviewHidden((v) => !v)}
            className="inline-flex items-center gap-1 text-sm px-2 py-1.5 rounded hover:bg-[#f7f6f0]">
            {previewHidden ? <><Eye className="w-4 h-4" /> إظهار المعاينة</> : <><EyeOff className="w-4 h-4" /> إخفاء المعاينة</>}
          </button>
          <button type="button" onClick={handlePrint}
            className="inline-flex items-center gap-1 text-sm px-2 py-1.5 rounded hover:bg-[#f7f6f0]">
            <Printer className="w-4 h-4" /> طباعة / تنزيل
          </button>
          <button type="button"
            onClick={() => document.getElementById("doc-attachments")?.scrollIntoView({ behavior: "smooth", block: "start" })}
            title="الانتقال إلى قسم المرفقات أسفل الصفحة"
            className="inline-flex items-center gap-1 text-sm px-2 py-1.5 rounded hover:bg-[#f7f6f0]">
            <Paperclip className="w-4 h-4" /> مرفقات
          </button>
          <button type="button" onClick={() => save("مسودة")}
            className="inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded border border-[#eceae2] hover:bg-[#f7f6f0]">
            <Bookmark className="w-4 h-4" /> حفظ
          </button>
          <PrimaryBtn
            onClick={() => save("مرسل")}
            disabled={!isValid || uploading}
            title={!isValid ? validation.join(" · ") : uploading ? "يوجد مرفقات قيد الرفع" : undefined}
          >
            <Send className="w-4 h-4" /> احفظ ثم أرسل
          </PrimaryBtn>
        </div>
      </div>

      <div className={`grid gap-5 ${previewHidden ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-2"}`}>
        {/* FORM COLUMN */}
        <div className="space-y-5 order-2 lg:order-1">
          <div className="rounded-xl bg-white border border-[#eceae2] p-5">
            <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
              <h2 className="text-base font-bold">عرض سعر</h2>
              <div className="flex items-center gap-1">
                <span className="text-xs text-[#0f2a1d]/60">الرقم:</span>
                <input
                  readOnly={!refEditing}
                  value={ref}
                  onChange={(e) => setRef(e.target.value)}
                  className={`border border-[#eceae2] rounded px-2 py-1 text-sm w-40 ${refEditing ? "bg-white" : "bg-[#f7f6f0]"}`}
                />
                <button
                  type="button"
                  onClick={() => setRefEditing((v) => !v)}
                  className="border border-[#eceae2] rounded p-1.5 hover:bg-[#f7f6f0]"
                  title={refEditing ? "تأكيد" : "تعديل الرقم"}
                >
                  {refEditing ? <Check className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              {/* Issuer */}
              <FormField label="جهة الإصدار *" action={
                <FieldMenuButton open={showFieldMenu} onToggle={() => setShowFieldMenu((v) => !v)}
                  optCols={optCols} setOptCols={setOptCols} />
              }>
                <div className="border border-[#eceae2] rounded-lg px-3 py-2 bg-white flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {branding.logo && <img src={branding.logo} alt="logo" className="h-8 w-8 object-contain rounded border border-[#eceae2]" />}
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{org.name}</div>
                      <div className="text-xs text-[#0f2a1d]/60">رقم التسجيل الضريبي: {org.taxNumber || "—"}</div>
                    </div>
                  </div>
                  <label className="cursor-pointer inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-[#eceae2] hover:bg-[#f7f6f0]">
                    <Upload className="w-3.5 h-3.5" /> {branding.logo ? "تغيير" : "الشعار"}
                    <input type="file" accept="image/*" className="hidden"
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        setBranding({ ...branding, logo: await fileToDataURL(f) });
                        e.target.value = "";
                      }} />
                  </label>
                  {branding.logo && (
                    <button type="button" onClick={() => setBranding({ ...branding, logo: "" })}
                      className="p-1 text-red-500 hover:bg-red-50 rounded" title="حذف الشعار">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
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
                {branding.stamp ? (
                  <div className="mt-3 border-2 border-dashed border-[#eceae2] rounded-lg p-3 text-center relative">
                    <img src={branding.stamp} alt="stamp" className="max-h-32 mx-auto object-contain" />
                    <button type="button" onClick={() => setBranding({ ...branding, stamp: "" })}
                      className="absolute top-1 left-1 p-1 text-red-500 hover:bg-red-50 rounded" title="حذف الختم">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <label className="cursor-pointer inline-flex items-center gap-1 text-xs mt-2 px-2 py-1 rounded border border-[#eceae2] hover:bg-[#f7f6f0]">
                      <Upload className="w-3.5 h-3.5" /> تغيير الختم
                      <input type="file" accept="image/*" className="hidden"
                        onChange={async (e) => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          setBranding({ ...branding, stamp: await fileToDataURL(f) });
                          e.target.value = "";
                        }} />
                    </label>
                  </div>
                ) : (
                  <label className="mt-3 border-2 border-dashed border-[#eceae2] rounded-lg p-4 text-center text-sm text-[#0f2a1d]/60 cursor-pointer hover:bg-[#faf9f4] block">
                    <Upload className="w-5 h-5 mx-auto mb-1" /> رفع الختم
                    <input type="file" accept="image/*" className="hidden"
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        setBranding({ ...branding, stamp: await fileToDataURL(f) });
                        e.target.value = "";
                      }} />
                  </label>
                )}
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
              <QuotationPreview
                tpl={tpl}
                org={org}
                party={party}
                ref_={ref}
                date={date}
                dueDate={expiry}
                lines={lines}
                lineCalcs={lineCalcs}
                subtotal={subtotal}
                tax={tax}
                total={total}
                notes={notes}
                terms={notes}
                currency={CUR}
                structure={structure}
                verify={verify}
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
              <QuotationPreview
                tpl={tpl} org={org} party={party} ref_={ref} date={date} dueDate={expiry}
                lines={lines} lineCalcs={lineCalcs} subtotal={subtotal} tax={tax}
                total={total} notes={notes} terms={notes} currency={CUR} structure={structure} verify={verify}
              />
            </div>
          </div>
        </div>
      )}

      <div className="mt-6" id="doc-attachments">
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

/* Preview rendering now goes through QuotationPreview (buildDocHtml) — see
   the imports/usages above; the old hand-rolled QuotePaper* JSX is gone. */
