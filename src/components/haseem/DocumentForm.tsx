import { useState, useRef, useEffect, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Plus, Trash2, Printer, Eye, X, Pencil, Upload, Check } from "lucide-react";
import QRCode from "qrcode";
import { Shell, PrimaryBtn, OutlineBtn } from "./Shell";
import { useCollection, useKV } from "@/lib/haseem/store";
import { type DocKind, CONTENT_VARIANTS, type ContentVariant, contrastColorFor, tintColorFor } from "@/lib/haseem/templates";
import { makeZatcaQrPayload, printDoc, DOC_STRUCTURES } from "@/lib/haseem/printDoc";
import { resolveDocTitle, docTimestamp } from "@/lib/haseem/zatca";
import { InvoicePreview } from "./InvoicePreview";
import { QuotationPreview } from "./QuotationPreview";
import { CreditNotePreview } from "./CreditNotePreview";
import { PurchasePreview } from "./PurchasePreview";

import { DocumentSidePanel } from "./DocumentSidePanel";
import { useOrg } from "@/lib/db/org";
import { toDocKind } from "@/lib/db/document-bridge";
import { buildVerifyUrl, signDoc } from "@/lib/haseem/docSignature";
import { listAttachments, getSignedUrl } from "@/lib/db/attachments";

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

type Line = { description: string; qty: number; price: number; tax: number; unit?: string };

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
  const { items: parties, addAsync: addPartyAsync } = useCollection<any>(partyKey);
  const { items: docs, addAsync, update } = useCollection<any>(storageKey);
  const existing = docId ? docs.find((d) => d.id === docId) : null;
  const [org] = useKV<{ name: string; taxNumber: string; address?: string }>("org", {
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
  // Progress-billing (مستخلص) fields — only surfaced/used when the selected
  // template's layoutVariant is "contracting".
  const [contractValue, setContractValue] = useState<number>(existing?.contractValue ?? 0);
  const [previousCertified, setPreviousCertified] = useState<number>(existing?.previousCertified ?? 0);
  const [retentionPct, setRetentionPct] = useState<number>(existing?.retentionPct ?? 10);
  const [advanceRecoveryPct, setAdvanceRecoveryPct] = useState<number>(existing?.advanceRecoveryPct ?? 0);
  // Hydrate when the record loads asynchronously
  useEffect(() => {
    if (existing) {
      setRef(existing.ref);
      setDate(existing.date);
      setDueDate(existing.dueDate);
      setPartyId(existing.partyId ?? "");
      setNotes(existing.notes ?? "");
      setLines(existing.lines ?? [{ description: "", qty: 1, price: 0, tax: 15 }]);
      setContractValue(existing.contractValue ?? 0);
      setPreviousCertified(existing.previousCertified ?? 0);
      setRetentionPct(existing.retentionPct ?? 10);
      setAdvanceRecoveryPct(existing.advanceRecoveryPct ?? 0);
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

  const [savingParty, setSavingParty] = useState(false);
  const submitNewParty = async () => {
    if (!newParty.name.trim() || savingParty) return;
    setSavingParty(true);
    try {
      const rec = await addPartyAsync({ ...newParty, name: newParty.name.trim() });
      setPartyId(rec.id);
      setPartyModalOpen(false);
      setPartyTab("basic");
      setNewParty(emptyParty);
    } catch (e: any) {
      alert(`تعذّر حفظ السجل: ${e?.message ?? e}`);
    } finally {
      setSavingParty(false);
    }
  };

  const party = parties.find((p) => p.id === partyId);
  const partyName = party?.name ?? "—";
  const statusLabel = existing?.status ?? "مسودة";
  const approvalLabel = existing?.status === "مؤكد" ? "معتمد" : "";

  const { currentOrgId } = useOrg();
  const cloudKind = useMemo(() => toDocKind(kind ?? storageKey), [kind, storageKey]);
  // Template/print kind (hyphenated design-system kinds), distinct from the cloud DB kind
  const printKind: DocKind = useMemo(() => {
    if (kind) return kind;
    if (storageKey === "bills") return "bill";
    if (storageKey === "purchaseOrders") return "purchase-order";
    if (storageKey === "creditNotes") return "credit-note";
    if (storageKey === "quotations") return "quotation";
    return "invoice";
  }, [kind, storageKey]);
  // Structure+color engine: every document kind now gets an independent
  // structural layout (boxed/banner/minimal/corporate/thermal) and a free
  // color picker, instead of a fixed list of near-identical named templates.
  const DEFAULT_DOC_COLOR: Record<string, string> = {
    invoice: "#1b6ea8", quotation: "#0d9488", "credit-note": "#9f1239",
    "debit-note": "#9f1239", "purchase-order": "#0369a1", bill: "#8a6a3d",
  };
  const kindForKV = kind ?? "invoice";
  const [structureId, setStructureId] = useKV<string>(`doc-structure:${kindForKV}`, "boxed");
  const structure = structureId as "boxed" | "banner" | "minimal" | "corporate" | "thermal";
  const [docColor, setDocColor] = useKV<string>(`doc-color:${kindForKV}`, DEFAULT_DOC_COLOR[kindForKV] ?? "#1b6ea8");
  // Content variant (progress billing / supply / services) only makes sense
  // where line items represent billable work — invoices and purchase bills.
  const supportsContentVariant = kind === "invoice" || kind === "bill";
  const [contentVariant, setContentVariant] = useKV<ContentVariant>(`doc-content-variant:${kindForKV}`, "standard");
  const tpl = {
    name: "مخصص",
    accent: docColor,
    onAccent: contrastColorFor(docColor),
    soft: tintColorFor(docColor),
    layoutVariant: supportsContentVariant && contentVariant !== "standard" ? contentVariant : undefined,
  };
  // ZATCA QR is exclusive to sales invoices (usesZatcaQr) and purchase bills
  // (usesSupplierZatcaQr below) — every other document kind (quotations, POs,
  // credit/debit notes, vouchers) must never show it.
  const usesZatcaQr = useMemo(
    () => ["sales_invoice", "simplified_tax_invoice", "standard_tax_invoice"].includes(cloudKind),
    [cloudKind],
  );
  const usesVerifyQr = useMemo(
    () => ["sales_quotation", "purchase_order", "credit_note", "debit_note", "payment_voucher", "receipt_voucher", "journal_voucher", "expense_voucher"].includes(cloudKind),
    [cloudKind],
  );
  // A purchase bill is the supplier's own tax invoice to us — its ZATCA QR
  // must encode the supplier (party) as the seller, not our org.
  const usesSupplierZatcaQr = useMemo(() => cloudKind === "purchase_invoice", [cloudKind]);

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

  // مستخلص (progress billing) summary — additive on top of the normal
  // subtotal/tax/total above, never replaces them. The line items represent
  // the work billed *this* period; contractValue/previousCertified are
  // entered manually since there's no cross-document running ledger yet.
  const progressBilling = useMemo(() => {
    const cumulativeCompleted = r2(previousCertified + subtotal);
    const cumulativePct = contractValue > 0 ? r2((cumulativeCompleted / contractValue) * 100) : 0;
    const retentionAmt = r2((subtotal * retentionPct) / 100);
    const advanceRecoveryAmt = r2((subtotal * advanceRecoveryPct) / 100);
    const netPayable = r2(total - retentionAmt - advanceRecoveryAmt);
    return {
      contractValue, previousCertified, retentionPct, advanceRecoveryPct,
      currentCertificate: subtotal,
      cumulativeCompleted, cumulativePct, retentionAmt, advanceRecoveryAmt, netPayable,
    };
  }, [contractValue, previousCertified, retentionPct, advanceRecoveryPct, subtotal, total]);

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
    if (usesSupplierZatcaQr) {
      const payload = makeZatcaQrPayload({
        sellerName: party?.name || "",
        vatNumber: party?.taxNumber || "",
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
  }, [org.name, org.taxNumber, date, total, tax, usesZatcaQr, usesSupplierZatcaQr, party?.name, party?.taxNumber, usesVerifyQr, cloudKind, ref]);

  // ZATCA-aware document heading — never the "إنشاء/تعديل" form title
  const docTitle = useMemo(
    () => resolveDocTitle(kind ?? cloudKind, party?.taxNumber),
    [kind, cloudKind, party?.taxNumber],
  );
  // Shared "verify" QR block (non-tax documents: quotations, purchase orders,
  // vouchers) — built once so the live preview and the print output show the
  // exact same QR + verification URL instead of two separately-assembled ones.
  const verify = useMemo(
    () => (usesVerifyQr && verifyQrDataUrl && verifyToken
      ? { qrDataUrl: verifyQrDataUrl, url: buildVerifyUrl(cloudKind, ref, verifyToken), label: "التحقق من المستند · Verify Document" }
      : undefined),
    [usesVerifyQr, verifyQrDataUrl, verifyToken, cloudKind, ref],
  );
  const issuedAtIso = useMemo(() => docTimestamp(date, existing?.issuedAt), [date, existing?.issuedAt]);
  const partyAddress = useMemo(() => {
    if (!party) return "";
    return [party.street, party.district, party.city, party.region].filter(Boolean).join("، ");
  }, [party]);

  const [printing, setPrinting] = useState(false);
  const handlePrint = async () => {
    setPrinting(true);
    try {
      // For a purchase bill, fetch the supplier's original scanned file (if
      // one is linked in cloud storage) so it prints merged after the
      // generated digital invoice — one combined job for audit/review.
      let attachment: { url: string; mime?: string; label?: string } | undefined;
      if (printKind === "bill" && currentOrgId && dbId) {
        try {
          const atts = await listAttachments(currentOrgId, "document", dbId);
          const latest = atts[0];
          if (latest) {
            const url = await getSignedUrl(latest.storage_path);
            if (url) attachment = { url, mime: latest.mime_type ?? undefined, label: `النسخة الأصلية · ${latest.filename}` };
          }
        } catch (e) {
          console.error("[print] failed to load original attachment", e);
        }
      }

      await printDoc({
        kind: printKind,
        title: docTitle.ar,
        titleEn: docTitle.en,
        variant: docTitle.variant,
        issuedAtIso,
        ref, date, dueDate,
        expiry: printKind === "quotation" ? dueDate : undefined,
        terms: printKind === "quotation" ? notes : undefined,
        org,
        party: party ? { ...party, address: partyAddress } : party,
        partyLabel,
        lines, lineCalcs,
        subtotal, tax, total,
        notes,
        partyRole: printKind === "bill" ? "العميل" : printKind === "purchase-order" ? "المورد" : "العميل",
        currency: CUR,
        qrDataUrl: usesZatcaQr || usesSupplierZatcaQr ? qrDataUrl : undefined,
        branding,
        tpl,
        verify,
        attachment,
        layoutVariant: tpl.layoutVariant,
        progressBilling: tpl.layoutVariant === "contracting" ? progressBilling : undefined,
        structure,
      });
    } finally {
      setPrinting(false);
    }
  };




  const updateLine = (i: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  // Cloud-native documents: the record id IS the database id.
  const [dbId, setDbId] = useState<string | null>(existing?.dbId ?? existing?.id ?? null);
  useEffect(() => {
    setDbId(existing?.dbId ?? existing?.id ?? null);
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
    // The collections adapter persists to the `documents` table; when the
    // status is "مؤكد" it also calls the atomic `post_document` RPC so the
    // journal entry commits in the same server transaction.
    const payload: any = {
      ref, date, dueDate, partyId, partyName, notes,
      status: finalStatus, lines, subtotal, tax, total,
      contractValue, previousCertified, retentionPct, advanceRecoveryPct,
    };
    try {
      if (existing) update(existing.id, payload);
      else await addAsync(payload);
      navigate({ to: backTo });
    } catch (e: any) {
      alert(`تعذّر الحفظ: ${e?.message ?? e}`);
    }
  };

  // Documents are cloud-native now — the old per-document "enable cloud"
  // opt-in is a no-op kept only so the layout below stays stable.
  const enableCloud = async () => {};

  return (
    <Shell>
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">{title}</h1>
          {subtitle && (
            <p className="text-xs text-[#0f2a1d]/60 mt-1">{subtitle}</p>
          )}
          <div className="flex flex-wrap gap-2 mt-3">
            <BadgeChip label={statusLabel} tone="status" />
            {approvalLabel && <BadgeChip label={approvalLabel} tone="approval" />}
            {kind === "quotation" && <BadgeChip label="عرض سعر" tone="accent" />}
            {kind === "credit-note" && <BadgeChip label="إشعار دائن" tone="accent" />}
            {(kind === "purchase-order" || kind === "bill") && <BadgeChip label={kind === "bill" ? "فاتورة مشتريات" : "أمر شراء"} tone="accent" />}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <div className="flex items-center gap-1.5 border border-[#eceae2] rounded-lg px-2 py-1 bg-white">
            <span className="text-xs text-[#0f2a1d]/60">الهيكل:</span>
            <select
              value={structureId}
              onChange={(e) => setStructureId(e.target.value)}
              className="bg-transparent text-sm outline-none max-w-[180px]"
              title="تغيير الهيكل التصميمي للمستند"
            >
              {DOC_STRUCTURES.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          {supportsContentVariant && (
            <div className="flex items-center gap-1.5 border border-[#eceae2] rounded-lg px-2 py-1 bg-white">
              <span className="text-xs text-[#0f2a1d]/60">نوع النشاط:</span>
              <select
                value={contentVariant}
                onChange={(e) => setContentVariant(e.target.value as ContentVariant)}
                className="bg-transparent text-sm outline-none max-w-[180px]"
                title="تغيير نوع محتوى المستند"
              >
                {CONTENT_VARIANTS.map((v) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
            </div>
          )}
          <label
            className="flex items-center gap-1.5 border border-[#eceae2] rounded-lg px-2 py-1 bg-white cursor-pointer"
            title="لون الهوية للمستند"
          >
            <span className="text-xs text-[#0f2a1d]/60">اللون:</span>
            <input
              type="color"
              value={docColor}
              onChange={(e) => setDocColor(e.target.value)}
              className="w-6 h-6 rounded border border-[#eceae2] cursor-pointer bg-transparent p-0"
            />
          </label>
          <OutlineBtn type="button" onClick={() => navigate({ to: backTo })}>
            رجوع
          </OutlineBtn>
          <OutlineBtn type="button" onClick={() => setPreviewOpen(true)}>
            <Eye className="w-4 h-4" /> معاينة
          </OutlineBtn>
          <OutlineBtn type="button" onClick={handlePrint} disabled={printing}>
            <Printer className="w-4 h-4" /> {printing ? "جارٍ التحضير…" : "طباعة"}
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

      <div className="rounded-xl border border-[#eceae2] bg-white p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
          <div>
            <div className="text-xs text-[#0f2a1d]/60">المعاينة الحية · Live View</div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {usesZatcaQr && qrDataUrl && <BadgeChip label="ZATCA QR" tone="approval" />}
            {usesVerifyQr && verifyQrDataUrl && <BadgeChip label="Verify QR" tone="status" />}
            {branding.stamp && <BadgeChip label="ختم معتمد" tone="accent" />}
          </div>
        </div>
        <DocumentLivePreview
          kind={kind ?? cloudKind}
          tpl={tpl}
          org={org}
          party={party}
          partyName={partyName}
          partyLabel={partyLabel}
          partyAddress={partyAddress}
          ref_={ref}
          date={date}
          dueDate={dueDate}
          issuedAtIso={issuedAtIso}
          lines={lines}
          lineCalcs={lineCalcs}
          subtotal={subtotal}
          tax={tax}
          total={total}
          notes={notes}
          terms={notes}
          originalRef={existing?.reference ?? existing?.originalRef}
          reason={existing?.reason}
          usesZatcaQr={usesZatcaQr}
          usesSupplierZatcaQr={usesSupplierZatcaQr}
          qrDataUrl={qrDataUrl}
          usesVerifyQr={usesVerifyQr}
          verifyQrDataUrl={verifyQrDataUrl}
          verify={verify}
          branding={branding}
          docTitle={docTitle}
          currency={CUR}
          layoutVariant={tpl.layoutVariant}
          progressBilling={tpl.layoutVariant === "contracting" ? progressBilling : undefined}
          structure={structure}
        />
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
                {tpl.layoutVariant === "supply" && <th className="w-20">الوحدة</th>}
                <th className="w-20">{tpl.layoutVariant === "services" ? "الساعات" : "الكمية"}</th>
                <th className="w-28">{tpl.layoutVariant === "services" ? "الأجر / ساعة" : "السعر"}</th>
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
                  {tpl.layoutVariant === "supply" && (
                    <td>
                      <input
                        value={l.unit ?? ""}
                        onChange={(e) => updateLine(i, { unit: e.target.value })}
                        placeholder="قطعة"
                        className="border border-[#eceae2] rounded px-2 py-1 w-full"
                      />
                    </td>
                  )}
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

        {tpl.layoutVariant === "contracting" && (
          <div className="rounded-lg border border-[#eceae2] bg-[#fafaf7] p-4 space-y-3">
            <div className="text-sm font-bold text-[#0f2a1d]">تفاصيل المستخلص</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <FormField label="قيمة العقد الإجمالية">
                <input
                  type="number" min={0} step="0.01" value={contractValue}
                  onChange={(e) => setContractValue(Number(e.target.value))}
                  className="border border-[#eceae2] rounded-lg px-3 py-2 w-full"
                />
              </FormField>
              <FormField label="المستخلصات السابقة">
                <input
                  type="number" min={0} step="0.01" value={previousCertified}
                  onChange={(e) => setPreviousCertified(Number(e.target.value))}
                  className="border border-[#eceae2] rounded-lg px-3 py-2 w-full"
                />
              </FormField>
              <FormField label="نسبة الحجز الاحتياطي %">
                <input
                  type="number" min={0} max={100} step="0.5" value={retentionPct}
                  onChange={(e) => setRetentionPct(Number(e.target.value))}
                  className="border border-[#eceae2] rounded-lg px-3 py-2 w-full"
                />
              </FormField>
              <FormField label="نسبة استرداد الدفعة المقدمة %">
                <input
                  type="number" min={0} max={100} step="0.5" value={advanceRecoveryPct}
                  onChange={(e) => setAdvanceRecoveryPct(Number(e.target.value))}
                  className="border border-[#eceae2] rounded-lg px-3 py-2 w-full"
                />
              </FormField>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs bg-white rounded-lg border border-[#eceae2] p-3">
              <div>نسبة الإنجاز التراكمية: <strong>{progressBilling.cumulativePct}%</strong></div>
              <div>المحجوز من هذا المستخلص: <strong>{fmt(progressBilling.retentionAmt)} {CUR}</strong></div>
              <div>استرداد الدفعة المقدمة: <strong>{fmt(progressBilling.advanceRecoveryAmt)} {CUR}</strong></div>
              <div className="col-span-2 md:col-span-3 pt-1 border-t border-[#eceae2] font-bold">
                الصافي المستحق بعد الحجز والاسترداد: {fmt(progressBilling.netPayable)} {CUR}
              </div>
            </div>
          </div>
        )}

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
              <h2>{docTitle.ar}</h2>
              <div style={{ fontSize: 11, opacity: 0.6 }}>{docTitle.en}</div>
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
        <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 overflow-auto print:static print:bg-white print:p-0 print:overflow-visible" onClick={() => setPreviewOpen(false)}>
          <div className="bg-white rounded-xl max-w-3xl w-full my-8 overflow-hidden print:my-0 print:max-w-none print:rounded-none" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-3 border-b border-[#eceae2] bg-[#fafaf7] print:hidden">
              <div className="flex items-center gap-3">
                <h2 className="text-base font-bold">{ref}</h2>
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
              <div className="p-8 text-sm print:p-0">
              <DocumentLivePreview
                kind={kind ?? cloudKind}
                tpl={tpl}
                org={org}
                party={party}
                partyName={partyName}
                partyLabel={partyLabel}
                partyAddress={partyAddress}
                ref_={ref}
                date={date}
                dueDate={dueDate}
                issuedAtIso={issuedAtIso}
                lines={lines}
                lineCalcs={lineCalcs}
                subtotal={subtotal}
                tax={tax}
                total={total}
                notes={notes}
                terms={notes}
                originalRef={existing?.reference ?? existing?.originalRef}
                reason={existing?.reason}
                usesZatcaQr={usesZatcaQr}
                usesSupplierZatcaQr={usesSupplierZatcaQr}
                qrDataUrl={qrDataUrl}
                usesVerifyQr={usesVerifyQr}
                verifyQrDataUrl={verifyQrDataUrl}
                verify={verify}
                branding={branding}
                docTitle={docTitle}
                currency={CUR}
                layoutVariant={tpl.layoutVariant}
                progressBilling={tpl.layoutVariant === "contracting" ? progressBilling : undefined}
                structure={structure}
              />
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

function BadgeChip({ label, tone }: { label: string; tone: "status" | "approval" | "accent" }) {
  const cls =
    tone === "status"
      ? "bg-[#f2f0e8] text-[#0f2a1d]/75 border-[#eceae2]"
      : tone === "approval"
        ? "bg-[#ecfdf5] text-[#0f6b3a] border-[#bbf7d0]"
        : "bg-[#f3f9fe] text-[#1b6ea8] border-[#dbeafe]";
  return <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold border ${cls}`}>{label}</span>;
}

function DocumentLivePreview({
  kind,
  tpl,
  org,
  party,
  partyName,
  partyLabel,
  partyAddress,
  ref_,
  date,
  dueDate,
  issuedAtIso,
  lines,
  lineCalcs,
  subtotal,
  tax,
  total,
  notes,
  terms,
  originalRef,
  reason,
  usesZatcaQr,
  usesSupplierZatcaQr,
  qrDataUrl,
  usesVerifyQr,
  verifyQrDataUrl,
  verify,
  branding,
  docTitle,
  currency,
  layoutVariant,
  progressBilling,
  structure,
}: any) {
  if (kind === "quotation") {
    return <QuotationPreview {...{ tpl, org, party, partyName, partyLabel, partyAddress, ref_, date, dueDate, issuedAtIso, lines, lineCalcs, subtotal, tax, total, notes, terms, branding, currency, verify, structure }} />;
  }
  if (kind === "credit-note" || kind === "debit-note") {
    return <CreditNotePreview {...{ tpl, org, party, partyName, partyLabel, partyAddress, ref_, date, issuedAtIso, lines, lineCalcs, subtotal, tax, total, notes, originalRef, reason, branding, qrDataUrl, usesZatcaQr, verify, currency, structure, kind }} />;
  }
  if (kind === "purchase-order" || kind === "bill") {
    return <PurchasePreview {...{
      tpl, org, party, partyName, partyLabel, partyAddress, ref_, date, dueDate, issuedAtIso,
      lines, lineCalcs, subtotal, tax, total, notes, branding, currency, kind,
      qrDataUrl, usesZatcaQr: usesSupplierZatcaQr, verify,
      layoutVariant, progressBilling, structure,
    }} />;
  }
  return <InvoicePreview {...{ tpl, org, party, partyName, partyLabel, partyAddress, ref_, date, dueDate, issuedAtIso, lines, lineCalcs, subtotal, tax, total, notes, branding, qrDataUrl, usesZatcaQr, docTitle, currency, layoutVariant, progressBilling, structure }} />;
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
