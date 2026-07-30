import { useCallback, useEffect, useState } from "react";
import { CLOUD_KEYS, useCloudCollection } from "@/lib/db/collections";

type Rec = { id: string; [k: string]: any };
const listeners: Record<string, Set<() => void>> = {};

function isBrowser() {
  return typeof window !== "undefined";
}
function fullKey(key: string) {
  return `haseem:${key}`;
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
function useLocalCollection<T extends Rec = Rec>(key: string) {
  const [items, setItems] = useState<T[]>([]);
  useEffect(() => {
    const fn = () => setItems(readRaw<T>(key));
    (listeners[key] ??= new Set()).add(fn);
    fn();
    return () => {
      listeners[key]?.delete(fn);
    };
  }, [key]);

  const add = useCallback(
    (item: Omit<T, "id">) => {
      const id =
        globalThis.crypto && "randomUUID" in globalThis.crypto
          ? (globalThis.crypto as any).randomUUID()
          : String(Date.now()) + Math.random().toString(36).slice(2, 8);
      const rec = { ...(item as any), id, createdAt: new Date().toISOString() } as T;
      writeRaw(key, [rec, ...readRaw<T>(key)]);
      return rec;
    },
    [key],
  );
  const update = useCallback(
    (id: string, patch: Partial<T>) => {
      writeRaw(key, readRaw<T>(key).map((i) => (i.id === id ? { ...i, ...patch } : i)));
    },
    [key],
  );
  const remove = useCallback(
    (id: string) => {
      writeRaw(key, readRaw<T>(key).filter((i) => i.id !== id));
    },
    [key],
  );
  return { items, add, update, remove };
}

export function useCollection<T extends Rec = Rec>(key: string) {
  const isCloud = CLOUD_KEYS.has(key);
  // Both hooks must be called unconditionally to satisfy the Rules of Hooks.
  const cloud = useCloudCollection<T>(key);
  const local = useLocalCollection<T>(key);
  if (isCloud && cloud.enabled) {
    return {
      items: cloud.items,
      add: cloud.add,
      addAsync: cloud.addAsync,
      update: cloud.update,
      remove: cloud.remove,
    };
  }
  return { ...local, addAsync: async (item: Omit<T, "id">) => local.add(item) };
}


export function useKV<T>(key: string, initial: T) {
  const storageKey = `haseem:kv:${key}`;
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    if (!isBrowser()) return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw != null) setValue(JSON.parse(raw));
    } catch {
      // Invalid legacy local data falls back to the supplied initial value.
    }
  }, [storageKey]);
  const set = useCallback(
    (v: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const next = typeof v === "function" ? (v as any)(prev) : v;
        if (isBrowser()) localStorage.setItem(storageKey, JSON.stringify(next));
        return next;
      });
    },
    [storageKey],
  );
  return [value, set] as const;
}
