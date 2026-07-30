import { Outlet, createFileRoute, useLocation, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useAuth } from "@/lib/haseem/auth";
import { BRAND } from "@/lib/brand";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: `تسجيل الدخول — ${BRAND.nameAr}` }] }),
  component: AuthPage,
});

function AuthPage() {
  const { user, ready, signIn, signUp, resetPassword } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const [forgotBusy, setForgotBusy] = useState(false);

  useEffect(() => {
    if (ready && user) navigate({ to: "/dashboard" });
  }, [ready, user, navigate]);

  if (location.pathname !== "/auth") {
    return <Outlet />;
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setInfo("");
    setBusy(true);
    try {
      if (mode === "login") {
        const { error } = await signIn(email, password);
        if (error) setError(error);
        else navigate({ to: "/dashboard" });
      } else {
        const { error } = await signUp(email, password, name);
        if (error) setError(error);
        else setInfo("تم إنشاء الحساب. تحقق من بريدك لتفعيل الحساب ثم سجّل الدخول.");
      }
    } finally {
      setBusy(false);
    }
  };

  const requestPasswordReset = async () => {
    setError("");
    setInfo("");
    if (!email.trim()) {
      setError("أدخل البريد الإلكتروني أولًا حتى نرسل رابط الاستعادة.");
      return;
    }
    setForgotBusy(true);
    try {
      const { error } = await resetPassword(email);
      if (error) setError(error);
      else setInfo("تم إرسال رابط استعادة كلمة المرور إلى بريدك الإلكتروني.");
    } finally {
      setForgotBusy(false);
    }
  };

  return (
    <div
      dir="rtl"
      className="min-h-screen flex items-center justify-center p-4 font-[Cairo,system-ui,sans-serif] bg-[linear-gradient(135deg,#0d2d49_0%,#113f66_44%,#1b6ea8_100%)]"
    >
      <div className="bg-white/96 backdrop-blur rounded-2xl w-full max-w-md p-8 space-y-5 shadow-2xl border border-white/40">
        <div className="text-center">
          <div className="w-20 h-20 mx-auto rounded-2xl bg-white shadow-sm flex items-center justify-center mb-3 border border-[#d9ecf7] p-2">
            <img src={BRAND.logoSrc} alt={BRAND.nameEn} className="w-full h-full object-contain" />
          </div>
          <h1 className="text-xl font-bold text-[#0f2a1d]">
            {mode === "login" ? "مرحبا بعودتك" : "إنشاء حساب جديد"}
          </h1>
          <p className="text-xs text-[#0f2a1d]/60 mt-1">
            {mode === "login" ? `سجّل دخولك للوصول إلى ${BRAND.nameAr}` : `ابدأ إدارة أعمالك المالية مع ${BRAND.nameAr}`}
          </p>
        </div>

        <div className="flex bg-[#f2f0e8] rounded-lg p-1 text-sm">
          <button
            onClick={() => setMode("login")}
            className={`flex-1 py-1.5 rounded-md ${mode === "login" ? "bg-white font-semibold" : "text-[#0f2a1d]/60"}`}
          >
            تسجيل الدخول
          </button>
          <button
            onClick={() => setMode("signup")}
            className={`flex-1 py-1.5 rounded-md ${mode === "signup" ? "bg-white font-semibold" : "text-[#0f2a1d]/60"}`}
          >
            حساب جديد
          </button>
        </div>

        <form className="space-y-4" onSubmit={submit}>
          {mode === "signup" && (
            <div>
              <label className="text-xs text-[#0f2a1d]/70">الاسم</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full border border-[#eceae2] rounded-lg px-3 py-2.5 text-sm"
                placeholder="اسمك الكامل"
              />
            </div>
          )}
          <div>
            <label className="text-xs text-[#0f2a1d]/70">البريد الإلكتروني</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full border border-[#eceae2] rounded-lg px-3 py-2.5 text-sm"
              placeholder="you@example.com"
              dir="ltr"
            />
          </div>
          <div>
            <label className="text-xs text-[#0f2a1d]/70">كلمة المرور</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full border border-[#eceae2] rounded-lg px-3 py-2.5 text-sm"
              placeholder="••••••••"
              dir="ltr"
            />
          </div>
          {mode === "login" && (
            <button
              type="button"
              onClick={requestPasswordReset}
              disabled={busy || forgotBusy}
              className="text-xs text-[#0f6b3a] underline underline-offset-4 text-right disabled:opacity-60"
            >
              {forgotBusy ? "جارٍ الإرسال..." : "استعادة كلمة المرور"}
            </button>
          )}
          {error && <div className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>}
          {info && <div className="text-xs text-[#0f6b3a] bg-[#eaf6ef] rounded-lg px-3 py-2">{info}</div>}
          <button
            type="submit"
            disabled={busy}
            className="w-full bg-[#d4f24a] text-[#0f2a1d] rounded-lg py-2.5 font-semibold text-sm hover:bg-[#c5e63a] disabled:opacity-60"
          >
            {busy ? "..." : mode === "login" ? "تسجيل الدخول" : "إنشاء الحساب"}
          </button>
          <p className="text-[11px] text-[#0f2a1d]/50 text-center">
            بياناتك محفوظة في السحابة بأمان داخل Canar Accounting
          </p>
        </form>
      </div>
    </div>
  );
}
