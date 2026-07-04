import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useAuth } from "@/lib/haseem/auth";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "تسجيل الدخول — حسيم" }] }),
  component: AuthPage,
});

function AuthPage() {
  const { user, ready, login } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (ready && user) navigate({ to: "/dashboard" });
  }, [ready, user, navigate]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (login(email, password)) navigate({ to: "/dashboard" });
    else setError("تأكد من صحة البريد وأن كلمة المرور لا تقل عن 4 أحرف");
  };

  return (
    <div
      dir="rtl"
      className="min-h-screen bg-[#0f2a1d] flex items-center justify-center p-4 font-[Cairo,system-ui,sans-serif]"
    >
      <div className="bg-white rounded-2xl w-full max-w-md p-8 space-y-5 shadow-2xl">
        <div className="text-center">
          <div className="w-14 h-14 mx-auto rounded-xl bg-[#0f2a1d] flex items-center justify-center mb-3">
            <span className="text-[#d4f24a] font-black text-2xl">ح</span>
          </div>
          <h1 className="text-xl font-bold text-[#0f2a1d]">
            {mode === "login" ? "مرحبا بعودتك" : "إنشاء حساب جديد"}
          </h1>
          <p className="text-xs text-[#0f2a1d]/60 mt-1">
            {mode === "login"
              ? "سجّل دخولك للوصول إلى لوحة التحكم"
              : "ابدأ إدارة أعمالك المالية اليوم"}
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
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full border border-[#eceae2] rounded-lg px-3 py-2.5 text-sm"
              placeholder="••••••••"
              dir="ltr"
            />
          </div>
          {error && (
            <div className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
          <button
            type="submit"
            className="w-full bg-[#d4f24a] text-[#0f2a1d] rounded-lg py-2.5 font-semibold text-sm hover:bg-[#c5e63a]"
          >
            {mode === "login" ? "تسجيل الدخول" : "إنشاء الحساب"}
          </button>
          <p className="text-[11px] text-[#0f2a1d]/50 text-center">
            نسخة توضيحية — البيانات محفوظة محلياً في متصفحك فقط
          </p>
        </form>
      </div>
    </div>
  );
}
