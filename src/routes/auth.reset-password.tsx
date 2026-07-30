import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/haseem/auth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth/reset-password")({
  head: () => ({ meta: [{ title: "إعادة تعيين كلمة المرور — كنار المحاسبية" }] }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { user, ready } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  const canSubmit = useMemo(
    () => password.length >= 6 && password === confirmPassword && sessionReady,
    [password, confirmPassword, sessionReady],
  );

  useEffect(() => {
    let mounted = true;
    const syncRecoverySession = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (!mounted) return;
        if (error) {
          setError(error.message);
          return;
        }
        setSessionReady(Boolean(data.session));
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "تعذر تحميل جلسة الاستعادة.");
      }
    };

    void syncRecoverySession();
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      if (!mounted) return;
      setSessionReady(Boolean(s));
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (ready && user) navigate({ to: "/dashboard", replace: true });
  }, [ready, user, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setInfo("");

    if (!sessionReady) {
      setError("رابط الاستعادة غير صالح أو منتهي. اطلب رابطًا جديدًا من شاشة الدخول.");
      return;
    }
    if (password.length < 6) {
      setError("كلمة المرور يجب أن تكون 6 أحرف على الأقل.");
      return;
    }
    if (password !== confirmPassword) {
      setError("كلمتا المرور غير متطابقتين.");
      return;
    }

    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setError(error.message);
        return;
      }
      setInfo("تم تحديث كلمة المرور بنجاح. سيتم تحويلك إلى شاشة الدخول.");
      setTimeout(() => {
        void navigate({ to: "/auth", replace: true });
      }, 1000);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div dir="rtl" className="min-h-screen bg-[#0f2a1d] flex items-center justify-center p-4 font-[Cairo,system-ui,sans-serif]">
      <div className="bg-white rounded-2xl w-full max-w-md p-8 space-y-5 shadow-2xl">
        <div className="text-center">
          <div className="w-14 h-14 mx-auto rounded-xl bg-[#0f2a1d] flex items-center justify-center mb-3">
            <span className="text-[#d4f24a] font-black text-2xl">ح</span>
          </div>
          <h1 className="text-xl font-bold text-[#0f2a1d]">إعادة تعيين كلمة المرور</h1>
          <p className="text-xs text-[#0f2a1d]/60 mt-1">اكتب كلمة مرور جديدة وآمنة للحساب.</p>
        </div>

        <form className="space-y-4" onSubmit={submit}>
          <div>
            <label className="text-xs text-[#0f2a1d]/70">كلمة المرور الجديدة</label>
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
          <div>
            <label className="text-xs text-[#0f2a1d]/70">تأكيد كلمة المرور</label>
            <input
              type="password"
              required
              minLength={6}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="mt-1 w-full border border-[#eceae2] rounded-lg px-3 py-2.5 text-sm"
              placeholder="••••••••"
              dir="ltr"
            />
          </div>
          {!sessionReady && (
            <div className="text-xs text-amber-800 bg-amber-50 rounded-lg px-3 py-2">
              نحن نتحقق من رابط الاستعادة الآن. إذا لم يصل الرابط بشكل صحيح فاطلب رابطًا جديدًا من شاشة الدخول.
            </div>
          )}
          {error && <div className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>}
          {info && <div className="text-xs text-[#0f6b3a] bg-[#eaf6ef] rounded-lg px-3 py-2">{info}</div>}
          <button
            type="submit"
            disabled={busy || !canSubmit}
            className="w-full bg-[#d4f24a] text-[#0f2a1d] rounded-lg py-2.5 font-semibold text-sm hover:bg-[#c5e63a] disabled:opacity-60"
          >
            {busy ? "جارٍ الحفظ..." : "حفظ كلمة المرور الجديدة"}
          </button>
          <button
            type="button"
            onClick={() => navigate({ to: "/auth" })}
            className="w-full border border-[#eceae2] text-[#0f2a1d] rounded-lg py-2.5 font-semibold text-sm hover:bg-[#f8f7f2]"
          >
            العودة إلى شاشة الدخول
          </button>
        </form>
      </div>
    </div>
  );
}

