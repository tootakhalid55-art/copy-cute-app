// One-time migration UI: scans localStorage for legacy haseem: keys and uploads
// the ones we support to Supabase under the current org.
import { useEffect, useMemo, useState } from "react";
import { UploadCloud, CheckCircle2, X, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "./org";
import { useAuth } from "@/lib/haseem/auth";

type LegacyRec = { id?: string; [k: string]: any };
const FLAG_KEY_PREFIX = "haseem:migrated:v1:"; // per-org flag

function readLegacy(key: string): LegacyRec[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(`haseem:${key}`) || "[]");
  } catch {
    return [];
  }
}

const SUPPORTED = ["customers", "suppliers", "items"] as const;

export function MigrationGate() {
  const { user, ready: authReady } = useAuth();
  const { currentOrgId, ready: orgReady } = useOrg();
  const [state, setState] = useState<"idle" | "prompt" | "running" | "done" | "dismissed">("idle");
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [progress, setProgress] = useState<string>("");
  const [errors, setErrors] = useState<string[]>([]);

  const flagKey = currentOrgId ? `${FLAG_KEY_PREFIX}${currentOrgId}` : null;

  useEffect(() => {
    if (!authReady || !orgReady) return;
    if (!user || !currentOrgId || !flagKey) return;
    if (localStorage.getItem(flagKey)) return; // already migrated
    const cs: Record<string, number> = {};
    for (const k of SUPPORTED) {
      const n = readLegacy(k).length;
      if (n > 0) cs[k] = n;
    }
    if (Object.keys(cs).length === 0) {
      localStorage.setItem(flagKey, new Date().toISOString());
      return;
    }
    setCounts(cs);
    setState("prompt");
  }, [authReady, orgReady, user, currentOrgId, flagKey]);

  const total = useMemo(() => Object.values(counts).reduce((a, b) => a + b, 0), [counts]);

  async function run() {
    if (!currentOrgId || !flagKey) return;
    setState("running");
    setErrors([]);
    let ok = 0;
    for (const k of SUPPORTED) {
      const rows = readLegacy(k);
      if (rows.length === 0) continue;
      setProgress(`جاري رفع ${k}...`);
      try {
        if (k === "customers" || k === "suppliers") {
          const partyType = k === "customers" ? "customer" : "supplier";
          const payload = rows.map((r) => ({
            org_id: currentOrgId,
            type: partyType,
            name: String(r.name ?? "").trim() || "بدون اسم",
            code: r.code ?? null,
            vat_number: r.taxNumber ?? null,
            phone: r.phone ?? null,
            email: r.email ?? null,
            address: r.address ? { text: String(r.address) } : null,
            opening_balance: Number(r.openingBalance ?? 0) || 0,
            currency: r.currency ?? "SAR",
            meta: { imported: true, imported_from: k, legacy_id: r.id ?? null, type: r.type ?? null },
          }));
          const { error } = await (supabase.from("parties") as any).insert(payload);
          if (error) throw error;
          ok += payload.length;
        } else if (k === "items") {
          const payload = rows.map((r) => ({
            org_id: currentOrgId,
            name: String(r.name ?? "").trim() || "بدون اسم",
            sku: r.sku ?? null,
            kind: r.type === "خدمة" ? "service" : "product",
            unit: r.unit ?? null,
            price: Number(r.price ?? 0) || 0,
            cost: Number(r.cost ?? 0) || 0,
            stock: Number(r.stock ?? 0) || 0,
            tax_rate: Number(r.taxRate ?? 15) || 0,
            meta: { imported: true, legacy_id: r.id ?? null },
          }));
          const { error } = await (supabase.from("items") as any).insert(payload);
          if (error) throw error;
          ok += payload.length;
        }
      } catch (e: any) {
        console.error("[migrate]", k, e);
        setErrors((prev) => [...prev, `${k}: ${e?.message ?? String(e)}`]);
      }
    }
    setProgress(`تم رفع ${ok} سجل`);
    // Only remove local rows we actually migrated (customers/suppliers/items).
    for (const k of SUPPORTED) {
      localStorage.removeItem(`haseem:${k}`);
    }
    localStorage.setItem(flagKey, new Date().toISOString());
    setState("done");
  }

  function skip() {
    if (!flagKey) return;
    localStorage.setItem(flagKey, "skipped:" + new Date().toISOString());
    setState("dismissed");
  }

  if (state === "idle" || state === "dismissed") return null;

  return (
    <div className="fixed inset-0 z-[1000] bg-black/50 flex items-center justify-center p-4 font-[Cairo,system-ui,sans-serif]" dir="rtl">
      <div className="bg-white rounded-2xl w-full max-w-lg p-6 shadow-2xl">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-lg bg-[#0f2a1d] flex items-center justify-center">
              <UploadCloud className="w-5 h-5 text-[#d4f24a]" />
            </div>
            <div>
              <h2 className="font-bold text-[#0f2a1d]">ترحيل البيانات إلى السحابة</h2>
              <p className="text-xs text-[#0f2a1d]/60">وجدنا بيانات محفوظة محلياً في هذا المتصفح</p>
            </div>
          </div>
          {state !== "running" && (
            <button onClick={skip} className="text-[#0f2a1d]/60 hover:text-[#0f2a1d]" aria-label="إغلاق">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {state === "prompt" && (
          <div className="space-y-3">
            <div className="bg-[#f7f5ec] rounded-lg p-3 text-sm">
              <div className="font-semibold mb-1">إجمالي: {total} سجل</div>
              <ul className="text-xs space-y-0.5 text-[#0f2a1d]/80">
                {Object.entries(counts).map(([k, n]) => (
                  <li key={k} className="flex justify-between">
                    <span>{k === "customers" ? "العملاء" : k === "suppliers" ? "الموردون" : "الأصناف"}</span>
                    <span>{n}</span>
                  </li>
                ))}
              </ul>
            </div>
            <p className="text-xs text-[#0f2a1d]/70">
              سيتم رفعها إلى المنشأة الحالية ثم حذف النسخة المحلية بعد التأكد من نجاح العملية.
            </p>
            <div className="flex gap-2 justify-end pt-1">
              <button
                onClick={skip}
                className="text-xs px-3 py-2 rounded-lg border border-[#eceae2] hover:bg-[#f7f5ec]"
              >
                لاحقاً
              </button>
              <button
                onClick={run}
                className="text-xs px-3 py-2 rounded-lg bg-[#0f2a1d] text-[#d4f24a] font-semibold hover:opacity-90"
              >
                رفع الآن
              </button>
            </div>
          </div>
        )}

        {state === "running" && (
          <div className="py-6 text-center space-y-3">
            <Loader2 className="w-6 h-6 mx-auto animate-spin text-[#0f2a1d]" />
            <div className="text-sm text-[#0f2a1d]/80">{progress || "جاري الترحيل..."}</div>
          </div>
        )}

        {state === "done" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-[#0f6b3a]">
              <CheckCircle2 className="w-5 h-5" />
              <span className="text-sm font-semibold">اكتمل الترحيل</span>
            </div>
            <div className="text-xs text-[#0f2a1d]/70">{progress}</div>
            {errors.length > 0 && (
              <div className="text-xs text-red-600 bg-red-50 rounded-lg p-2 max-h-32 overflow-auto">
                <div className="font-semibold mb-1">تعذّر ترحيل بعض السجلات:</div>
                <ul className="list-disc pr-4 space-y-0.5">
                  {errors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </div>
            )}
            <div className="flex justify-end">
              <button
                onClick={() => setState("dismissed")}
                className="text-xs px-3 py-2 rounded-lg bg-[#0f2a1d] text-[#d4f24a] font-semibold"
              >
                تم
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
