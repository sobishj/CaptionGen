/**
 * AES-GCM encryption for secrets stored at rest (API keys, header values),
 * using only the Web Crypto API so it runs on Cloudflare Workers and Node.
 */

const enc = new TextEncoder();
const dec = new TextDecoder();
const VERSION = "v1";

function toB64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromB64(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

const keyCache = new Map<string, Promise<CryptoKey>>();

/** Derive a 256-bit AES key from ENCRYPTION_KEY (any long random string). */
function aesKey(secret: string): Promise<CryptoKey> {
  let key = keyCache.get(secret);
  if (!key) {
    key = crypto.subtle
      .digest("SHA-256", enc.encode(secret))
      .then((raw) => crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]));
    keyCache.set(secret, key);
  }
  return key;
}

export async function encryptSecret(plain: string, secret: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(secret), enc.encode(plain));
  return `${VERSION}.${toB64(iv)}.${toB64(new Uint8Array(ct))}`;
}

/** Throws if the value was tampered with or encrypted with a different key. */
export async function decryptSecret(payload: string, secret: string): Promise<string> {
  const [version, iv, ct] = payload.split(".");
  if (version !== VERSION || !iv || !ct) throw new Error("Unsupported encrypted value");
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(iv) }, await aesKey(secret), fromB64(ct));
  return dec.decode(plain);
}

/** "sk-proj-abc…a1b2" -> "sk-••••••••a1b2". Never reveals more than a short prefix and the last 4 characters. */
export function maskSecret(value: string): string {
  const v = value.trim();
  if (v.length < 12) return "••••••••";
  const prefix = /^[A-Za-z]{2,4}[-_]/.exec(v)?.[0] ?? "";
  return `${prefix}••••••••${v.slice(-4)}`;
}
