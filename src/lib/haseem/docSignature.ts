// Lightweight client-side document signing for demo verification.
// Uses Web Crypto (SubtleCrypto) with a persistent per-browser secret.

const SECRET_KEY = "haseem:kv:doc-sign-secret";

function isBrowser() {
  return typeof window !== "undefined";
}

function getOrCreateSecret(): string {
  if (!isBrowser()) return "server";
  let s = "";
  try {
    s = JSON.parse(localStorage.getItem(SECRET_KEY) || '""');
  } catch { /* noop */ }
  if (!s) {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    s = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
    localStorage.setItem(SECRET_KEY, JSON.stringify(s));
  }
  return s;
}

function b64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(secret: string, msg: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
  return b64url(sig).slice(0, 22);
}

export type SignInput = {
  kind: string;   // "quotation" | "invoice" | "credit-note" ...
  ref: string;    // document reference number
  total: number;  // grand total
};

function payload(i: SignInput): string {
  return `${i.kind}|${i.ref}|${Number(i.total).toFixed(2)}`;
}

export async function signDoc(i: SignInput): Promise<string> {
  const secret = getOrCreateSecret();
  return hmac(secret, payload(i));
}

export async function verifyDoc(i: SignInput, token: string): Promise<boolean> {
  const expected = await signDoc(i);
  if (expected.length !== token.length) return false;
  let diff = 0;
  for (let n = 0; n < expected.length; n++) diff |= expected.charCodeAt(n) ^ token.charCodeAt(n);
  return diff === 0;
}

export function buildVerifyUrl(kind: string, ref: string, token: string): string {
  const origin = isBrowser() ? window.location.origin : "";
  const q = new URLSearchParams({ k: kind, r: ref, t: token });
  return `${origin}/verify?${q.toString()}`;
}

/** Server-verified URL (no `k` param): the verify page resolves it through
 *  /api/public/verify against the document's stored verify_token, so the QR
 *  works from any device — not just the issuing browser. */
export function buildTokenVerifyUrl(ref: string, token: string): string {
  const origin = isBrowser() ? window.location.origin : "";
  const q = new URLSearchParams({ r: ref, t: token });
  return `${origin}/verify?${q.toString()}`;
}

/** Stable per-document verification token (UUID). */
export function newVerifyToken(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}
