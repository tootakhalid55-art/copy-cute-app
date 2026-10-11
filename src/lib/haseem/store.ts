import { useAuth } from "./auth";
import { useOrg } from "@/lib/db/org";
import { useCallback, useEffect, useState, useRef, useMemo } from "react";
import { CLOUD_KEYS, useCloudCollection } from "@/lib/db/collections";

type Rec = { id: string; [k: string]: any };
const listeners: Record<string, Set<() => void>> = {};

function isBrowser() {
  return typeof window !== "undefined";
}
function fullKey(key: string) {
  return key;
}
function readRaw<T extends Rec>(key: string): T[] {
  if (!isBrowser()) return [];
  try {
    return JSON.parse(localStorage.getItem(fullKey(key)) || "[]");
  } catch {
    return [];
  }
}
function writeRaw<T extends Rec>(key: string, next: T[]) {
  if (!isBrowser()) return;
  localStorage.setItem(fullKey(key), JSON.stringify(next));
  listeners[key]?.forEach((fn) => fn());
}

/**
 * Legacy localStorage collection. Kept as fallback for keys we haven't migrated yet.
 * DO NOT call directly from feature code — use `useCollection` which routes to Supabase
 * when the key is registered in CLOUD_KEYS.
 */
function useLocalCollection<T extends Rec = Rec>(name: string) {
  const { user } = useAuth();
  const { currentOrgId, ready } = useOrg();
  const key = `haseem:scoped:${user?.id ?? "none"}:${currentOrgId ?? "none"}:collection:${name}`;
  const enabled = !!user && ready && !!currentOrgId;
  const [snapshot, setSnapshot] = useState<{key: string; items: T[]}>({key, items: []});
  const items = enabled && snapshot.key === key ? snapshot.items : [];
  useEffect(() => {
    const fn = () => setSnapshot({key, items: enabled ? readRaw<T>(key) : []});
    (listeners[key] ??= new Set()).add(fn);
    fn();
    return () => {
      listeners[key]?.delete(fn);
    };
  }, [key, enabled]);

  const add = useCallback(
    (item: Omit<T, "id">) => {
      if (!enabled) throw new Error("اختر منشأة مصرحًا بها أولًا");
      const id =
        globalThis.crypto && "randomUUID" in globalThis.crypto
          ? (globalThis.crypto as any).randomUUID()
          : String(Date.now()) + Math.random().toString(36).slice(2, 8);
      const rec = { ...(item as any), id, createdAt: new Date().toISOString() } as T;
      writeRaw(key, [rec, ...readRaw<T>(key)]);
      return rec;
    },
    [key, enabled],
  );
  const update = useCallback(
    (id: string, patch: Partial<T>) => {
      if (!enabled) throw new Error("اختر منشأة مصرحًا بها أولًا");
      writeRaw(key, readRaw<T>(key).map((i) => (i.id === id ? { ...i, ...patch } : i)));
    },
    [key, enabled],
  );
  const remove = useCallback(
    (id: string) => {
      if (!enabled) throw new Error("اختر منشأة مصرحًا بها أولًا");
      writeRaw(key, readRaw<T>(key).filter((i) => i.id !== id));
    },
    [key, enabled],
  );
  return { items, add, update, remove };
}

export function useCollection<T extends Rec = Rec>(key: string) {
  const isCloud = CLOUD_KEYS.has(key);
  // Both hooks must be called unconditionally to satisfy the Rules of Hooks.
  const cloud = useCloudCollection<T>(key);
  const local = useLocalCollection<T>(key);
  if (isCloud) {
    return {
      items: cloud.enabled ? cloud.items : [],
      add: cloud.add,
      addAsync: cloud.addAsync,
      update: cloud.update,
      updateAsync: cloud.updateAsync,
      remove: cloud.remove,
    };
  }
  return {
    ...local,
    addAsync: async (item: Omit<T, "id">) => local.add(item),
    updateAsync: async (id: string, patch: Partial<T>) => local.update(id, patch),
  };
}


export function useKV<T>(key: string, initial: T) {
  const { user } = useAuth();
  const { currentOrgId, currentOrg, ready } = useOrg();
  const initialRef = useRef(initial);
  const fallback = useMemo(() => key === "org" ? {
    name: currentOrg?.name ?? "", taxNumber: currentOrg?.vat_number ?? "",
    cr: currentOrg?.cr_number ?? "", currency: currentOrg?.currency ?? "SAR",
    address: typeof currentOrg?.address === "string" ? currentOrg.address : (currentOrg?.address as {text?: string})?.text ?? "",
    phone: currentOrg?.phone ?? "", email: currentOrg?.email ?? "",
  } as T : initialRef.current, [key, currentOrg]);
  const storageKey = `haseem:scoped:${user?.id ?? "none"}:${currentOrgId ?? "none"}:kv:${key}`;
  const enabled = !!user && ready && !!currentOrgId;
  const [state, setState] = useState<{key: string; value: T} | null>(null);
  useEffect(() => {
    let value = fallback;
    if (enabled && isBrowser()) {
      try { const raw = localStorage.getItem(storageKey); if (raw !== null) value = JSON.parse(raw); } catch { /* Use safe scoped defaults. */ }
    }
    setState({key: storageKey, value});
  }, [storageKey, enabled, fallback]);
  const value = enabled && state?.key === storageKey ? state.value : fallback;
  const set = useCallback((v: T | ((prev: T) => T)) => {
    if (!enabled) throw new Error("اختر منشأة مصرحًا بها أولًا");
    setState(prev => {
      const old = prev?.key === storageKey ? prev.value : fallback;
      const next = typeof v === "function" ? (v as (prev: T) => T)(old) : v;
      if (isBrowser()) localStorage.setItem(storageKey, JSON.stringify(next));
      return {key: storageKey, value: next};
    });
  }, [enabled, storageKey, fallback]);
  return [value, set] as const;
}
