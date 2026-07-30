import { useEffect } from "react";

function isBrowser() {
  return typeof window !== "undefined";
}

export function useCollectionChangedListener(keys: string | string[], onChange: () => void) {
  useEffect(() => {
    if (!isBrowser()) return;
    const watched = Array.isArray(keys) ? keys : [keys];
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ key?: string }>).detail;
      if (!detail?.key || watched.includes(detail.key)) {
        onChange();
      }
    };
    window.addEventListener("haseem:collection-changed", handler as EventListener);
    return () => window.removeEventListener("haseem:collection-changed", handler as EventListener);
  }, [keys, onChange]);
}
