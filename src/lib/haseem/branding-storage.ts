const databaseName = "canar-branding";
const storeName = "images";
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Image storage is blocked"));
  });
}
async function access<T>(key: string, write: boolean, value?: T): Promise<T | undefined> {
  const db = await openDatabase();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const transaction = db.transaction(storeName, write ? "readwrite" : "readonly");
      const store = transaction.objectStore(storeName);
      const request = write ? store.put(value, key) : store.get(key);
      // A successful request is not yet a committed transaction.
      transaction.oncomplete = () => resolve(write ? value : request.result);
      transaction.onabort = () => reject(transaction.error ?? new Error("Image transaction aborted"));
      transaction.onerror = () => reject(transaction.error);
    });
  } finally { db.close(); }
}
export async function readBranding<T>(key: string, fallback: T): Promise<T> {
  const saved = await access<T>(key, false);
  if (saved !== undefined) return saved;
  // Read only this account's old value. Never erase legacy or unsaved records.
  try { const old = localStorage.getItem(key); if (old !== null) return JSON.parse(old); } catch { /* Storage may be unavailable. */ }
  return fallback;
}
const queues = new Map<string, Promise<unknown>>();
export function writeBranding<T>(key: string, fallback: T, update: T | ((value: T) => T)): Promise<T> {
  const pending = (queues.get(key) ?? Promise.resolve()).catch(() => {}).then(async () => {
    const previous = await readBranding(key, fallback);
    const next = typeof update === "function" ? (update as (value: T) => T)(previous) : update;
    await access(key, true, next);
    return next;
  });
  queues.set(key, pending);
  const cleanup = () => { if (queues.get(key) === pending) queues.delete(key); };
  pending.then(cleanup, cleanup);
  return pending;
}
