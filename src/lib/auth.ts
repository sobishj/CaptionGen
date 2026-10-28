/**
 * Stateless admin sessions: the cookie holds the user id, a session version and
 * an expiry, signed with HMAC, so no session store is needed. Bumping a user's
 * session version (password change, removal) invalidates their sessions.
 * Web Crypto only, so it runs on Cloudflare Workers and Node.
 */

export const SESSION_COOKIE = "cg_admin";
export const SESSION_SECONDS = 60 * 60 * 8;

const enc = new TextEncoder();

export interface SessionClaims {
  uid: string;
  ver: string;
}

const b64url = (buf: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

export async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const SAFE = /^[A-Za-z0-9_-]+$/;

export async function createSessionToken(secret: string, claims: SessionClaims, nowMs = Date.now()): Promise<string> {
  if (!SAFE.test(claims.uid) || !SAFE.test(claims.ver)) throw new Error("Invalid session claims");
  const exp = Math.floor(nowMs / 1000) + SESSION_SECONDS;
  const body = `${claims.uid}.${claims.ver}.${exp}`;
  return `${body}.${await hmac(secret, `admin:${body}`)}`;
}

/** Returns the claims of a valid, unexpired token, or null. */
export async function verifySessionToken(
  secret: string,
  token: string | undefined,
  nowMs = Date.now(),
): Promise<SessionClaims | null> {
  if (!secret || !token) return null;
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [uid, ver, exp, sig] = parts as [string, string, string, string];
  if (!/^\d+$/.test(exp) || Number(exp) < nowMs / 1000) return null;
  if (!safeEqual(sig, await hmac(secret, `admin:${uid}.${ver}.${exp}`))) return null;
  return { uid, ver };
}

export function readCookie(req: Request, name = SESSION_COOKIE): string | undefined {
  const header = req.headers.get("cookie") ?? "";
  for (const part of header.split(/;\s*/)) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i) === name) return part.slice(i + 1);
  }
  return undefined;
}

export function isSecureRequest(req: Request): boolean {
  return new URL(req.url).protocol === "https:" || req.headers.get("x-forwarded-proto") === "https";
}

export function sessionCookie(token: string, secure: boolean): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_SECONDS}${secure ? "; Secure" : ""}`;
}

export function clearSessionCookie(secure: boolean): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure ? "; Secure" : ""}`;
}

/** Rejects cross-site writes. The SameSite cookie already blocks most of these; this is belt and braces. */
export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  // Behind proxies (Cloudflare, wrangler dev, reverse proxies) req.url may not carry the public host.
  const hosts = [new URL(req.url).host, req.headers.get("x-forwarded-host"), req.headers.get("host")];
  return hosts.some((h) => h !== null && h.toLowerCase() === originHost.toLowerCase());
}
