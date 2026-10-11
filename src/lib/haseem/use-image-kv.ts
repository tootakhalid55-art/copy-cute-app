import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "./auth";
import { useOrg } from "@/lib/db/org";
import { readBranding, writeBranding } from "./branding-storage";

/** Images have a separate quota from localStorage; preserve the user/org boundary. */
export function useImageKV<T>(name: string, initial: T) {
  const { user } = useAuth();
  const { currentOrgId, ready } = useOrg();
  const key = `haseem:scoped:${user?.id ?? "none"}:${currentOrgId ?? "none"}:kv:${name}`;
  const enabled = !!user && ready && !!currentOrgId;
  const initialRef = useRef(initial);
  const activeKey = useRef(key);
  activeKey.current = key;
  const revision = useRef(0);
  const [state, setState] = useState<{ key: string; value: T } | null>(null);
  useEffect(() => {
    let cancelled = false;
    const version = revision.current;
    if (enabled) readBranding<T>(key, initialRef.current).then(value => {
      if (!cancelled && version === revision.current) setState({ key, value });
    }).catch(() => { /* Keep safe defaults; writes surface storage errors. */ });
    return () => { cancelled = true; };
  }, [key, enabled]);
  const set = useCallback(async (update: T | ((value: T) => T)) => {
    if (!enabled) throw new Error("اختر منشأة مصرحًا بها أولًا");
    revision.current++;
    try {
      const value = await writeBranding(key, initialRef.current, update);
      if (activeKey.current === key) setState({ key, value });
    } catch {
      throw new Error("تعذر حفظ الصورة في تخزين المتصفح. تأكد من السماح بتخزين بيانات الموقع ثم أعد المحاولة؛ لم تُحذف الصورة السابقة.");
    }
  }, [enabled, key]);
  return [enabled && state?.key === key ? state.value : initialRef.current, set] as const;
}
