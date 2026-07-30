import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Building2, Plus, CheckCircle2, Loader2 } from "lucide-react";
import { useOrg } from "@/lib/db/org";
import { useAuth } from "@/lib/haseem/auth";

export const Route = createFileRoute("/select-organization")({
  head: () => ({ meta: [{ title: "اختيار المنشأة — كنار المحاسبية" }] }),
  component: SelectOrg,
});

function SelectOrg() {
  const { user, ready: authReady } = useAuth();
  const { orgs, currentOrgId, setCurrentOrg, createOrg, ready } = useOrg();
  const navigate = useNavigate();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [vat, setVat] = useState("");
  const [cr, setCr] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  if (authReady && !user) {
    if (typeof window !== "undefined") navigate({ to: "/auth" });
    return null;
  }

  if (!ready) {
    return (
      <div dir="rtl" className="min-h-screen flex items-center justify-center bg-[#f7f5ec]">
        <Loader2 className="w-6 h-6 animate-spin text-[#0f2a1d]" />
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    const org = await createOrg({ name: name.trim(), vat_number: vat || undefined, cr_number: cr || undefined });
    setBusy(false);
    if (!org) {
      setErr("تعذّر إنشاء المنشأة، حاول مرة أخرى.");
      return;
    }
    navigate({ to: "/dashboard" });
  }

  return (
    <div dir="rtl" className="min-h-screen bg-[#f7f5ec] font-[Cairo,system-ui,sans-serif] p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center">
          <div className="w-14 h-14 mx-auto rounded-xl bg-[#0f2a1d] flex items-center justify-center mb-3">
            <Building2 className="w-6 h-6 text-[#d4f24a]" />
          </div>
          <h1 className="text-2xl font-bold text-[#0f2a1d]">اختر المنشأة</h1>
          <p className="text-sm text-[#0f2a1d]/60 mt-1">
            {orgs.length === 0 ? "لم تنضم لأي منشأة بعد — أنشئ واحدة للبدء" : "المنشآت المتاحة لحسابك"}
          </p>
        </div>

        {orgs.length > 0 && (
          <div className="bg-white rounded-2xl border border-[#eceae2] divide-y divide-[#eceae2]">
            {orgs.map((o) => (
              <div key={o.id} className="p-4 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-[#0f2a1d] flex items-center gap-2">
                    {o.name}
                    {currentOrgId === o.id && <CheckCircle2 className="w-4 h-4 text-[#0f6b3a]" />}
                  </div>
                  <div className="text-xs text-[#0f2a1d]/60">
                    {o.vat_number ? `الرقم الضريبي: ${o.vat_number}` : "بدون رقم ضريبي"}
                  </div>
                </div>
                <button
                  onClick={() => {
                    setCurrentOrg(o.id);
                    navigate({ to: "/dashboard" });
                  }}
                  className="text-xs bg-[#0f2a1d] text-[#d4f24a] rounded-lg px-3 py-2 font-semibold"
                >
                  الدخول
                </button>
              </div>
            ))}
          </div>
        )}

        {!showForm ? (
          <div className="text-center">
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-2 bg-[#d4f24a] text-[#0f2a1d] rounded-lg px-4 py-2.5 font-semibold text-sm"
            >
              <Plus className="w-4 h-4" /> إنشاء منشأة جديدة
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="bg-white rounded-2xl border border-[#eceae2] p-5 space-y-3">
            <h2 className="font-bold text-[#0f2a1d]">منشأة جديدة</h2>
            <div>
              <label className="text-xs text-[#0f2a1d]/70">اسم المنشأة *</label>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full border border-[#eceae2] rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-[#0f2a1d]/70">الرقم الضريبي</label>
                <input
                  value={vat}
                  onChange={(e) => setVat(e.target.value)}
                  className="mt-1 w-full border border-[#eceae2] rounded-lg px-3 py-2 text-sm"
                  dir="ltr"
                />
              </div>
              <div>
                <label className="text-xs text-[#0f2a1d]/70">السجل التجاري</label>
                <input
                  value={cr}
                  onChange={(e) => setCr(e.target.value)}
                  className="mt-1 w-full border border-[#eceae2] rounded-lg px-3 py-2 text-sm"
                  dir="ltr"
                />
              </div>
            </div>
            {err && <div className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{err}</div>}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="text-xs px-3 py-2 rounded-lg border border-[#eceae2]"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={busy || !name.trim()}
                className="text-xs px-3 py-2 rounded-lg bg-[#0f2a1d] text-[#d4f24a] font-semibold disabled:opacity-60"
              >
                {busy ? "..." : "إنشاء"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

