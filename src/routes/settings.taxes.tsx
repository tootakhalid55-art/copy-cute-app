import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CheckCircle2, Link2, ShieldCheck, Upload, KeyRound, Copy, RefreshCw } from "lucide-react";
import { CrudModule } from "@/components/haseem/CrudModule";
import { useKV } from "@/lib/haseem/store";

type Step = 1 | 2 | 3 | 4;

type EInvCfg = {
  enabled: boolean;
  env: "sandbox" | "production";
  vatNumber: string;
  crNumber: string;
  sellerName: string;
  otp: string;
  issuedOtp: string; // رمز OTP الصادر من بوابة فاتورة (محاكاة)
  otpExpiresAt: string;
  otpRequestId: string;
  step: Step;
  csid: string;
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
  issuedOtp: "",
  otpExpiresAt: "",
  otpRequestId: "",
  step: 1,
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

  const validateStep1 = () => {
    if (!/^3\d{13}3$/.test(cfg.vatNumber))
      return "الرقم الضريبي يجب أن يكون 15 رقماً ويبدأ وينتهي بالرقم 3";
    if (!cfg.sellerName.trim()) return "أدخل اسم البائع كما في الشهادة";
    return null;
  };

  // الخطوة 2: طلب رمز OTP من بوابة فاتورة (محاكاة)
  const requestOtp = async () => {
    const err = validateStep1();
    if (err) return setMsg({ kind: "err", text: err });
    setBusy("otp");
    setMsg(null);
    await new Promise((r) => setTimeout(r, 700));
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const rid = "REQ-" + Math.random().toString(36).slice(2, 8).toUpperCase();
    const exp = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    patch({
      step: 3,
      issuedOtp: code,
      otpRequestId: rid,
      otpExpiresAt: exp,
      otp: "",
    });
    setBusy(null);
    setMsg({
      kind: "ok",
      text: `تم إرسال طلب رمز OTP إلى بوابة فاتورة (رقم الطلب ${rid}). في الوضع الحقيقي يظهر الرمز في حساب المكلّف على بوابة ZATCA.`,
    });
  };

  const resendOtp = () => requestOtp();

  // الخطوة 3: التحقق من الرمز وإصدار CSID (محاكاة)
  const verifyAndIssue = async () => {
    if (!/^\d{6}$/.test(cfg.otp)) return setMsg({ kind: "err", text: "أدخل رمز OTP المكوّن من 6 أرقام" });
    if (cfg.otpExpiresAt && new Date(cfg.otpExpiresAt).getTime() < Date.now())
      return setMsg({ kind: "err", text: "انتهت صلاحية الرمز، يرجى طلب رمز جديد" });
    if (cfg.otp !== cfg.issuedOtp) return setMsg({ kind: "err", text: "الرمز غير صحيح" });

    setBusy("issue");
    setMsg(null);
    await new Promise((r) => setTimeout(r, 900));
    const csid = btoa(`${cfg.vatNumber}:${cfg.otpRequestId}:${Date.now()}`);
    const expiry = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    patch({
      enabled: true,
      step: 4,
      csid,
      csidExpiry: expiry,
      lastSync: new Date().toISOString(),
      status: cfg.env === "production" ? "مربوط - إنتاج" : "مربوط - تجريبي",
      otp: "",
      issuedOtp: "",
    });
    setBusy(null);
    setMsg({ kind: "ok", text: "تم إصدار شهادة CSID وربط المنشأة مع بوابة فاتورة بنجاح." });
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
  const step: Step = linked ? 4 : (cfg.step || 1);

  const steps = [
    { n: 1, label: "بيانات المنشأة" },
    { n: 2, label: "طلب رمز OTP" },
    { n: 3, label: "التحقق وإصدار CSID" },
    { n: 4, label: "مربوط" },
  ];

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

      {/* شريط الخطوات */}
      <div className="flex items-center gap-2 flex-wrap text-xs">
        {steps.map((s, i) => {
          const done = step > s.n;
          const active = step === s.n;
          return (
            <div key={s.n} className="flex items-center gap-2">
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center border ${
                  done
                    ? "bg-emerald-600 border-emerald-600 text-white"
                    : active
                    ? "bg-[#0f2a1d] border-[#0f2a1d] text-white"
                    : "bg-white border-[#eceae2] text-[#0f2a1d]/50"
                }`}
              >
                {done ? "✓" : s.n}
              </span>
              <span className={active ? "text-[#0f2a1d] font-medium" : "text-[#0f2a1d]/60"}>
                {s.label}
              </span>
              {i < steps.length - 1 && <span className="w-6 h-px bg-[#eceae2]" />}
            </div>
          );
        })}
      </div>

      {/* الخطوة 1 & 2: بيانات المنشأة */}
      {(step === 1 || step === 2) && (
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
              className="w-full border border-[#eceae2] rounded-md px-3 py-2 tracking-widest"
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
        </div>
      )}

      {/* الخطوة 3: إدخال رمز OTP */}
      {step === 3 && (
        <div className="space-y-3">
          <div className="rounded-lg bg-[#f7f6f0] border border-[#eceae2] p-3 text-xs text-[#0f2a1d]/80 space-y-1">
            <div>رقم الطلب: <span className="font-mono">{cfg.otpRequestId}</span></div>
            <div>
              الرمز الصادر من بوابة فاتورة (محاكاة):{" "}
              <span className="font-mono text-base tracking-widest text-[#0f2a1d]">{cfg.issuedOtp}</span>
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(cfg.issuedOtp)}
                className="inline-flex items-center gap-1 mx-2 text-[#0f2a1d]/70 hover:text-[#0f2a1d]"
                title="نسخ"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>
            <div>
              تنتهي صلاحيته:{" "}
              {cfg.otpExpiresAt ? new Date(cfg.otpExpiresAt).toLocaleTimeString("ar-SA") : "-"}
            </div>
            <div className="text-[#0f2a1d]/50">
              في بيئة الإنتاج الحقيقية يظهر الرمز في حساب المكلّف على بوابة ZATCA ويجب نسخه ولصقه أدناه.
            </div>
          </div>

          <label className="text-sm block max-w-xs">
            <span className="block text-xs text-[#0f2a1d]/60 mb-1">أدخل رمز OTP (6 أرقام)</span>
            <input
              value={cfg.otp}
              onChange={(e) => patch({ otp: e.target.value.replace(/\D/g, "").slice(0, 6) })}
              placeholder="——————"
              className="w-full border border-[#eceae2] rounded-md px-3 py-2 tracking-[0.6em] text-center text-lg font-mono"
            />
          </label>
        </div>
      )}

      {/* الخطوة 4: بيانات الربط */}
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

      {/* أزرار الإجراءات لكل خطوة */}
      <div className="flex flex-wrap gap-2 pt-1">
        {step === 1 && (
          <button
            onClick={() => {
              const err = validateStep1();
              if (err) return setMsg({ kind: "err", text: err });
              setMsg(null);
              patch({ step: 2 });
            }}
            className="inline-flex items-center gap-2 bg-[#0f2a1d] text-white px-4 py-2 rounded-md text-sm hover:opacity-90"
          >
            التالي
          </button>
        )}

        {step === 2 && (
          <>
            <button
              onClick={requestOtp}
              disabled={busy === "otp"}
              className="inline-flex items-center gap-2 bg-[#0f2a1d] text-white px-4 py-2 rounded-md text-sm hover:opacity-90 disabled:opacity-60"
            >
              <KeyRound className="w-4 h-4" />
              {busy === "otp" ? "جارٍ طلب الرمز..." : "طلب رمز OTP من فاتورة"}
            </button>
            <button
              onClick={() => patch({ step: 1 })}
              className="inline-flex items-center gap-2 border border-[#eceae2] px-4 py-2 rounded-md text-sm hover:bg-[#fafaf7]"
            >
              رجوع
            </button>
          </>
        )}

        {step === 3 && (
          <>
            <button
              onClick={verifyAndIssue}
              disabled={busy === "issue"}
              className="inline-flex items-center gap-2 bg-[#0f2a1d] text-white px-4 py-2 rounded-md text-sm hover:opacity-90 disabled:opacity-60"
            >
              <Upload className="w-4 h-4" />
              {busy === "issue" ? "جارٍ إصدار CSID..." : "تأكيد الرمز وإصدار CSID"}
            </button>
            <button
              onClick={resendOtp}
              disabled={busy === "otp"}
              className="inline-flex items-center gap-2 border border-[#eceae2] px-4 py-2 rounded-md text-sm hover:bg-[#fafaf7]"
            >
              <RefreshCw className="w-4 h-4" />
              إعادة إرسال الرمز
            </button>
            <button
              onClick={() => patch({ step: 2, otp: "", issuedOtp: "" })}
              className="inline-flex items-center gap-2 border border-[#eceae2] px-4 py-2 rounded-md text-sm hover:bg-[#fafaf7]"
            >
              رجوع
            </button>
          </>
        )}

        {linked && (
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
  head: () => ({ meta: [{ title: "الضرائب والربط — كنار المحاسبية" }] }),
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

