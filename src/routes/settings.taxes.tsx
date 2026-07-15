import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CheckCircle2, Link2, ShieldCheck, Upload } from "lucide-react";
import { CrudModule } from "@/components/haseem/CrudModule";
import { useKV } from "@/lib/haseem/store";

type EInvCfg = {
  enabled: boolean;
  env: "sandbox" | "production";
  vatNumber: string;
  crNumber: string;
  sellerName: string;
  otp: string;
  csid: string; // Compliance/Production CSID (base64) - محاكاة
  csidExpiry: string;
  lastSync: string;
  status: "غير مربوط" | "مربوط - تجريبي" | "مربوط - إنتاج";
};

const DEFAULT_CFG: EInvCfg = {
  enabled: false,
  env: "sandbox",
  vatNumber: "",
  crNumber: "",
  sellerName: "",
  otp: "",
  csid: "",
  csidExpiry: "",
  lastSync: "",
  status: "غير مربوط",
};

function EInvoicingLink() {
  const [cfg, setCfg] = useKV<EInvCfg>("zatca-einvoicing", DEFAULT_CFG);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const patch = (p: Partial<EInvCfg>) => setCfg((prev) => ({ ...prev, ...p }));

  const validate = () => {
    if (!/^\d{15}$/.test(cfg.vatNumber)) return "الرقم الضريبي يجب أن يكون 15 رقماً";
    if (!cfg.sellerName.trim()) return "أدخل اسم البائع كما في الشهادة";
    if (!/^\d{4,8}$/.test(cfg.otp)) return "رمز OTP من بوابة فاتورة غير صالح";
    return null;
  };

  const onboard = async () => {
    const err = validate();
    if (err) return setMsg({ kind: "err", text: err });
    setBusy("onboard");
    setMsg(null);
    await new Promise((r) => setTimeout(r, 900));
    const csid = btoa(`${cfg.vatNumber}:${Date.now()}`);
    const expiry = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    patch({
      enabled: true,
      csid,
      csidExpiry: expiry,
      lastSync: new Date().toISOString(),
      status: cfg.env === "production" ? "مربوط - إنتاج" : "مربوط - تجريبي",
      otp: "",
    });
    setBusy(null);
    setMsg({ kind: "ok", text: "تم الربط بنجاح مع هيئة الزكاة والضريبة والجمارك (فاتورة)." });
  };

  const renew = async () => {
    setBusy("renew");
    await new Promise((r) => setTimeout(r, 700));
    const expiry = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    patch({ csidExpiry: expiry, lastSync: new Date().toISOString() });
    setBusy(null);
    setMsg({ kind: "ok", text: "تم تجديد شهادة CSID." });
  };

  const test = async () => {
    setBusy("test");
    await new Promise((r) => setTimeout(r, 600));
    patch({ lastSync: new Date().toISOString() });
    setBusy(null);
    setMsg({ kind: "ok", text: "اتصال ناجح مع بوابة فاتورة." });
  };

  const disconnect = () => {
    if (!confirm("هل تريد فصل الربط مع فاتورة؟")) return;
    setCfg(DEFAULT_CFG);
    setMsg({ kind: "ok", text: "تم فصل الربط." });
  };

  const linked = cfg.enabled;

  return (
    <div className="rounded-xl bg-white border border-[#eceae2] p-5 space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#0f2a1d] text-white flex items-center justify-center">
            <Link2 className="w-5 h-5" />
          </div>
          <div>
            <div className="font-semibold text-[#0f2a1d]">ربط الفوترة الإلكترونية (فاتورة — ZATCA)</div>
            <div className="text-xs text-[#0f2a1d]/60 mt-1">
              اربط منشأتك ببوابة هيئة الزكاة والضريبة والجمارك لإصدار الفواتير الإلكترونية المرحلة الثانية.
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`text-xs px-2 py-1 rounded-full border ${
              linked
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : "bg-amber-50 text-amber-700 border-amber-200"
            }`}
          >
            {linked ? <CheckCircle2 className="inline w-3.5 h-3.5 ml-1" /> : <ShieldCheck className="inline w-3.5 h-3.5 ml-1" />}
            {cfg.status}
          </span>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <label className="text-sm">
          <span className="block text-xs text-[#0f2a1d]/60 mb-1">البيئة</span>
          <select
            value={cfg.env}
            onChange={(e) => patch({ env: e.target.value as any })}
            className="w-full border border-[#eceae2] rounded-md px-3 py-2 bg-white"
          >
            <option value="sandbox">تجريبي (Sandbox)</option>
            <option value="production">إنتاج (Production)</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="block text-xs text-[#0f2a1d]/60 mb-1">الرقم الضريبي (15 رقم)</span>
          <input
            value={cfg.vatNumber}
            onChange={(e) => patch({ vatNumber: e.target.value.replace(/\D/g, "").slice(0, 15) })}
            placeholder="3xxxxxxxxxxxxx3"
            className="w-full border border-[#eceae2] rounded-md px-3 py-2"
          />
        </label>
        <label className="text-sm">
          <span className="block text-xs text-[#0f2a1d]/60 mb-1">السجل التجاري</span>
          <input
            value={cfg.crNumber}
            onChange={(e) => patch({ crNumber: e.target.value })}
            className="w-full border border-[#eceae2] rounded-md px-3 py-2"
          />
        </label>
        <label className="text-sm">
          <span className="block text-xs text-[#0f2a1d]/60 mb-1">اسم البائع</span>
          <input
            value={cfg.sellerName}
            onChange={(e) => patch({ sellerName: e.target.value })}
            className="w-full border border-[#eceae2] rounded-md px-3 py-2"
          />
        </label>
        <label className="text-sm md:col-span-2">
          <span className="block text-xs text-[#0f2a1d]/60 mb-1">رمز OTP من بوابة فاتورة</span>
          <input
            value={cfg.otp}
            onChange={(e) => patch({ otp: e.target.value.replace(/\D/g, "").slice(0, 8) })}
            placeholder="مثال: 123456"
            className="w-full border border-[#eceae2] rounded-md px-3 py-2 tracking-widest"
          />
        </label>
      </div>

      {linked && (
        <div className="rounded-lg bg-[#fafaf7] border border-[#eceae2] p-3 text-xs text-[#0f2a1d]/80 grid sm:grid-cols-3 gap-2">
          <div>
            <div className="text-[#0f2a1d]/50">شهادة CSID</div>
            <div className="font-mono truncate" title={cfg.csid}>{cfg.csid.slice(0, 22)}…</div>
          </div>
          <div>
            <div className="text-[#0f2a1d]/50">تنتهي في</div>
            <div>{cfg.csidExpiry || "-"}</div>
          </div>
          <div>
            <div className="text-[#0f2a1d]/50">آخر مزامنة</div>
            <div>{cfg.lastSync ? new Date(cfg.lastSync).toLocaleString("ar-SA") : "-"}</div>
          </div>
        </div>
      )}

      {msg && (
        <div
          className={`text-sm rounded-md px-3 py-2 border ${
            msg.kind === "ok"
              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
              : "bg-rose-50 text-rose-700 border-rose-200"
          }`}
        >
          {msg.text}
        </div>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        {!linked ? (
          <button
            onClick={onboard}
            disabled={busy === "onboard"}
            className="inline-flex items-center gap-2 bg-[#0f2a1d] text-white px-4 py-2 rounded-md text-sm hover:opacity-90 disabled:opacity-60"
          >
            <Upload className="w-4 h-4" />
            {busy === "onboard" ? "جارٍ الربط..." : "ربط مع فاتورة"}
          </button>
        ) : (
          <>
            <button
              onClick={test}
              disabled={busy === "test"}
              className="inline-flex items-center gap-2 border border-[#eceae2] px-4 py-2 rounded-md text-sm hover:bg-[#fafaf7]"
            >
              {busy === "test" ? "جارٍ الاختبار..." : "اختبار الاتصال"}
            </button>
            <button
              onClick={renew}
              disabled={busy === "renew"}
              className="inline-flex items-center gap-2 border border-[#eceae2] px-4 py-2 rounded-md text-sm hover:bg-[#fafaf7]"
            >
              {busy === "renew" ? "جارٍ التجديد..." : "تجديد الشهادة"}
            </button>
            <button
              onClick={disconnect}
              className="inline-flex items-center gap-2 border border-rose-200 text-rose-700 px-4 py-2 rounded-md text-sm hover:bg-rose-50"
            >
              فصل الربط
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export const Route = createFileRoute("/settings/taxes")({
  head: () => ({ meta: [{ title: "الضرائب والربط — حسيم" }] }),
  component: () => (
    <CrudModule
      storageKey="taxes"
      title="الضرائب والربط"
      subtitle="مجموعات الضرائب وربط هيئة الزكاة (فاتورة)"
      newLabel="إضافة ضريبة"
      searchIn={["name", "code"]}
      headerExtra={null}
      fields={[
        { name: "name", label: "اسم الضريبة", required: true },
        { name: "code", label: "الرمز" },
        { name: "rate", label: "النسبة %", type: "number", required: true, default: 15 },
        {
          name: "type",
          label: "النوع",
          type: "select",
          options: ["مبيعات", "مشتريات", "الاثنين"],
        },
        {
          name: "kind",
          label: "التصنيف",
          type: "select",
          options: ["أساسية", "صفرية", "معفاة", "خارج النطاق"],
          default: "أساسية",
        },
        { name: "account", label: "الحساب المحاسبي" },
      ]}
      columns={[
        { name: "name", label: "الضريبة" },
        { name: "code", label: "الرمز" },
        { name: "rate", label: "النسبة %" },
        { name: "type", label: "النوع" },
        { name: "kind", label: "التصنيف" },
      ]}
      beforeList={<EInvoicingLink />}
    />
  ),
});
