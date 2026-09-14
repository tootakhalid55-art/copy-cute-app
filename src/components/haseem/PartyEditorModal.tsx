// Full tabbed editor for customers/suppliers — the SAME four tabs the
// quick-add modal shows inside document forms (basic / address / financial /
// contact person), usable for both creating and editing a party record.
// The modal never closes on backdrop clicks: only حفظ / إلغاء / X close it.
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { PrimaryBtn, OutlineBtn } from "./Shell";

export type PartyDraft = Record<string, any>;

const EMPTY: PartyDraft = {
  type: "شركة",
  name: "",
  code: "",
  displayName: "",
  email: "",
  phone: "",
  mobile: "",
  website: "",
  taxNumber: "",
  commercialReg: "",
  taxGroup: "standard",
  category: "",
  currency: "SAR",
  openingBalance: 0,
  creditLimit: 0,
  paymentTerms: "0",
  country: "SA",
  city: "",
  region: "",
  district: "",
  street: "",
  buildingNo: "",
  postalCode: "",
  additionalNo: "",
  shippingAddress: "",
  contactName: "",
  contactPhone: "",
  contactEmail: "",
  notes: "",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-[#0f2a1d]/70">{label}</span>
      {children}
    </div>
  );
}

const inputCls = "border border-[#eceae2] rounded-lg px-3 py-2 bg-white w-full";

export function PartyEditorModal({
  partyLabel,
  initial,
  autoCode,
  onSave,
  onClose,
}: {
  partyLabel: string; // "عميل" | "مورد"
  initial?: PartyDraft | null;
  /** Suggested code for NEW records (editable). */
  autoCode?: string;
  onSave: (payload: PartyDraft) => Promise<void>;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"basic" | "address" | "financial" | "contact">("basic");
  const [p, setP] = useState<PartyDraft>(() => ({
    ...EMPTY,
    ...(initial ?? {}),
    code: initial?.code || autoCode || "",
    commercialReg: initial?.commercialReg || initial?.cr_number || "",
    paymentTerms: String(initial?.paymentTerms ?? initial?.payment_terms_days ?? "0"),
  }));
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setP({
      ...EMPTY,
      ...(initial ?? {}),
      code: initial?.code || autoCode || "",
      commercialReg: initial?.commercialReg || initial?.cr_number || "",
      paymentTerms: String(initial?.paymentTerms ?? initial?.payment_terms_days ?? "0"),
    });
    setTab("basic");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial?.id]);

  const set = (k: string, v: any) => setP((prev) => ({ ...prev, [k]: v }));
  const submit = async () => {
    if (!String(p.name ?? "").trim() || saving) return;
    setSaving(true);
    try {
      // Map to the columns the parties table stores directly; everything
      // else rides along in meta and round-trips untouched.
      await onSave({
        ...p,
        name: String(p.name).trim(),
        cr_number: p.commercialReg || null,
        payment_terms_days: Number(p.paymentTerms || 0) || 0,
        address:
          [p.street, p.district, p.city, p.region].filter(Boolean).join("، ") ||
          (typeof p.address === "string" ? p.address : "") ||
          "",
      });
      onClose();
    } catch {
      // The collections adapter surfaces the error toast; keep the modal open.
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 overflow-auto">
      <div className="bg-white rounded-xl w-full max-w-3xl my-6 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-3 border-b border-[#eceae2] bg-[#fafaf7]">
          <div>
            <h2 className="text-base font-bold">{initial ? `تعديل ${partyLabel}` : `إضافة ${partyLabel} جديد`}</h2>
            <p className="text-[11px] text-[#0f2a1d]/60">كل بيانات {partyLabel} في التبويبات الأربعة — الحقول المميزة بـ * إلزامية</p>
          </div>
          <button onClick={onClose} className="p-2 rounded hover:bg-[#eceae2]" title="إلغاء">
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
              onClick={() => setTab(k)}
              className={`px-4 py-2 rounded-t-lg -mb-px border-b-2 ${
                tab === k
                  ? "border-[#0f2a1d] font-semibold text-[#0f2a1d]"
                  : "border-transparent text-[#0f2a1d]/60 hover:text-[#0f2a1d]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="p-6 text-sm max-h-[60vh] overflow-auto">
          {tab === "basic" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label={`اسم ${partyLabel} *`}>
                <input value={p.name} onChange={(e) => set("name", e.target.value)} className={inputCls} />
              </Field>
              <Field label="الرمز (يُولَّد تلقائياً — قابل للتعديل)">
                <input value={p.code} onChange={(e) => set("code", e.target.value)} className={inputCls} dir="ltr" />
              </Field>
              <Field label="نوع الطرف">
                <select value={p.type} onChange={(e) => set("type", e.target.value)} className={inputCls}>
                  <option value="شركة">شركة</option>
                  <option value="فرد">فرد</option>
                  <option value="جهة حكومية">جهة حكومية</option>
                </select>
              </Field>
              <Field label="الاسم التجاري / المعروض">
                <input value={p.displayName} onChange={(e) => set("displayName", e.target.value)} className={inputCls} />
              </Field>
              <Field label="الرقم الضريبي">
                <input value={p.taxNumber} onChange={(e) => set("taxNumber", e.target.value)} className={inputCls} dir="ltr" />
              </Field>
              <Field label="السجل التجاري">
                <input value={p.commercialReg} onChange={(e) => set("commercialReg", e.target.value)} className={inputCls} dir="ltr" />
              </Field>
              <Field label="الجوال">
                <input value={p.phone} onChange={(e) => set("phone", e.target.value)} className={inputCls} dir="ltr" />
              </Field>
              <Field label="هاتف إضافي">
                <input value={p.mobile} onChange={(e) => set("mobile", e.target.value)} className={inputCls} dir="ltr" />
              </Field>
              <Field label="البريد الإلكتروني">
                <input type="email" value={p.email} onChange={(e) => set("email", e.target.value)} className={inputCls} dir="ltr" />
              </Field>
              <Field label="الموقع الإلكتروني">
                <input value={p.website} onChange={(e) => set("website", e.target.value)} className={inputCls} dir="ltr" />
              </Field>
              <Field label="التصنيف">
                <input value={p.category} onChange={(e) => set("category", e.target.value)} className={inputCls} placeholder="مقاولات / تجزئة / ..." />
              </Field>
              <Field label="المجموعة الضريبية">
                <select value={p.taxGroup} onChange={(e) => set("taxGroup", e.target.value)} className={inputCls}>
                  <option value="standard">خاضع 15%</option>
                  <option value="zero">صفرية 0%</option>
                  <option value="exempt">معفى</option>
                </select>
              </Field>
            </div>
          )}

          {tab === "address" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="الدولة">
                <select value={p.country} onChange={(e) => set("country", e.target.value)} className={inputCls}>
                  <option value="SA">السعودية</option>
                  <option value="AE">الإمارات</option>
                  <option value="KW">الكويت</option>
                  <option value="BH">البحرين</option>
                  <option value="QA">قطر</option>
                  <option value="OM">عُمان</option>
                  <option value="EG">مصر</option>
                  <option value="other">أخرى</option>
                </select>
              </Field>
              <Field label="المنطقة">
                <input value={p.region} onChange={(e) => set("region", e.target.value)} className={inputCls} />
              </Field>
              <Field label="المدينة">
                <input value={p.city} onChange={(e) => set("city", e.target.value)} className={inputCls} />
              </Field>
              <Field label="الحي">
                <input value={p.district} onChange={(e) => set("district", e.target.value)} className={inputCls} />
              </Field>
              <Field label="الشارع">
                <input value={p.street} onChange={(e) => set("street", e.target.value)} className={inputCls} />
              </Field>
              <Field label="رقم المبنى">
                <input value={p.buildingNo} onChange={(e) => set("buildingNo", e.target.value)} className={inputCls} dir="ltr" />
              </Field>
              <Field label="الرمز البريدي">
                <input value={p.postalCode} onChange={(e) => set("postalCode", e.target.value)} className={inputCls} dir="ltr" />
              </Field>
              <Field label="الرقم الإضافي">
                <input value={p.additionalNo} onChange={(e) => set("additionalNo", e.target.value)} className={inputCls} dir="ltr" />
              </Field>
              <div className="md:col-span-2">
                <Field label="عنوان الشحن (إن اختلف)">
                  <textarea value={p.shippingAddress} onChange={(e) => set("shippingAddress", e.target.value)} rows={2} className={inputCls} />
                </Field>
              </div>
            </div>
          )}

          {tab === "financial" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="العملة">
                <select value={p.currency} onChange={(e) => set("currency", e.target.value)} className={inputCls}>
                  <option value="SAR">ريال سعودي (SAR)</option>
                  <option value="USD">دولار (USD)</option>
                  <option value="EUR">يورو (EUR)</option>
                  <option value="AED">درهم (AED)</option>
                </select>
              </Field>
              <Field label="الرصيد الافتتاحي">
                <input type="number" value={p.openingBalance} onChange={(e) => set("openingBalance", Number(e.target.value))} className={inputCls} dir="ltr" />
              </Field>
              <Field label="حد الائتمان">
                <input type="number" value={p.creditLimit} onChange={(e) => set("creditLimit", Number(e.target.value))} className={inputCls} dir="ltr" />
              </Field>
              <Field label="شروط السداد (أيام)">
                <input type="number" value={p.paymentTerms} onChange={(e) => set("paymentTerms", e.target.value)} className={inputCls} dir="ltr" />
              </Field>
              <div className="md:col-span-2">
                <Field label="ملاحظات">
                  <textarea value={p.notes} onChange={(e) => set("notes", e.target.value)} rows={3} className={inputCls} />
                </Field>
              </div>
            </div>
          )}

          {tab === "contact" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="اسم شخص التواصل">
                <input value={p.contactName} onChange={(e) => set("contactName", e.target.value)} className={inputCls} />
              </Field>
              <Field label="جوال شخص التواصل">
                <input value={p.contactPhone} onChange={(e) => set("contactPhone", e.target.value)} className={inputCls} dir="ltr" />
              </Field>
              <Field label="بريد شخص التواصل">
                <input type="email" value={p.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} className={inputCls} dir="ltr" />
              </Field>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-3 border-t border-[#eceae2] bg-[#fafaf7]">
          <OutlineBtn type="button" onClick={onClose} disabled={saving}>إلغاء</OutlineBtn>
          <PrimaryBtn onClick={submit} disabled={saving || !String(p.name ?? "").trim()}>
            {saving ? "جارٍ الحفظ…" : "حفظ"}
          </PrimaryBtn>
        </div>
      </div>
    </div>
  );
}

/** Next sequential code like CLI-0007 based on the largest numeric suffix in use. */
export function nextAutoCode(rows: any[], field: string, prefix: string, pad = 4) {
  const max = rows
    .map((r) => String(r?.[field] ?? ""))
    .filter((c) => c.toUpperCase().startsWith(prefix.toUpperCase()))
    .map((c) => Number(c.replace(/^\D+/, "")))
    .filter((n) => Number.isFinite(n))
    .reduce((a, b) => Math.max(a, b), 0);
  return `${prefix}-${String(max + 1).padStart(pad, "0")}`;
}
