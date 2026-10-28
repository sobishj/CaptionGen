import { describe, expect, it } from "vitest";
import { createSessionToken, isSameOrigin, readCookie, sessionCookie, verifySessionToken, SESSION_SECONDS } from "@/lib/auth";
import { decryptSecret, encryptSecret, maskSecret } from "@/lib/crypto";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/passwords";

describe("AES-GCM secrets", () => {
  const KEY = "test-encryption-key-0123456789abcdef";

  it("round-trips and uses a fresh IV each time", async () => {
    const a = await encryptSecret("sk-proj-abcdef123456", KEY);
    const b = await encryptSecret("sk-proj-abcdef123456", KEY);
    expect(a).not.toBe(b);
    expect(a).not.toContain("abcdef");
    expect(await decryptSecret(a, KEY)).toBe("sk-proj-abcdef123456");
  });

  it("fails with the wrong key or tampered data", async () => {
    const enc = await encryptSecret("secret", KEY);
    await expect(decryptSecret(enc, "another-key")).rejects.toThrow();
    const [v, iv, ct] = enc.split(".");
    const tampered = `${v}.${iv}.${ct!.slice(0, -4)}AAAA`;
    await expect(decryptSecret(tampered, KEY)).rejects.toThrow();
    await expect(decryptSecret("garbage", KEY)).rejects.toThrow();
  });

  it("masks keys, revealing only a short prefix and the last 4 characters", () => {
    expect(maskSecret("sk-proj-1234567890a1b2")).toBe("sk-••••••••a1b2");
    expect(maskSecret("AIzaSyD-1234567890xyz9")).toBe("••••••••xyz9");
    expect(maskSecret("short")).toBe("••••••••");
  });
});

describe("password hashing", () => {
  it("verifies the right password only", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(hash).toMatch(/^pbkdf2\$100000\$/);
    expect(await verifyPassword(hash, "correct horse battery")).toBe(true);
    expect(await verifyPassword(hash, "wrong password!!")).toBe(false);
    expect(await verifyPassword("not-a-hash", "x")).toBe(false);
  });

  it("enforces a minimum length", () => {
    expect(passwordProblem("short")).toMatch(/at least 10/);
    expect(passwordProblem("long enough pw")).toBeNull();
  });
});

describe("session tokens", () => {
  const SECRET = "session-secret";
  const now = Date.UTC(2026, 0, 1);

  it("verifies a fresh token and returns its claims", async () => {
    const token = await createSessionToken(SECRET, { uid: "owner", ver: "abc" }, now);
    expect(await verifySessionToken(SECRET, token, now + 1000)).toEqual({ uid: "owner", ver: "abc" });
  });

  it("rejects expired, tampered and wrongly-signed tokens", async () => {
    const token = await createSessionToken(SECRET, { uid: "u1", ver: "1" }, now);
    expect(await verifySessionToken(SECRET, token, now + (SESSION_SECONDS + 1) * 1000)).toBeNull();
    expect(await verifySessionToken("other-secret", token, now)).toBeNull();
    expect(await verifySessionToken(SECRET, token.replace("u1.", "u2."), now)).toBeNull();
    expect(await verifySessionToken(SECRET, undefined, now)).toBeNull();
    expect(await verifySessionToken(SECRET, "a.b.c", now)).toBeNull();
  });

  it("builds an httpOnly, SameSite=Strict cookie with Secure on HTTPS", () => {
    const c = sessionCookie("tok", true);
    expect(c).toMatch(/HttpOnly/);
    expect(c).toMatch(/SameSite=Strict/);
    expect(c).toMatch(/Max-Age=28800/);
    expect(c).toMatch(/Secure/);
    expect(sessionCookie("tok", false)).not.toMatch(/Secure/);
  });

  it("reads the session cookie from a request", () => {
    const req = new Request("https://x.test/", { headers: { cookie: "a=1; cg_admin=tok.en; b=2" } });
    expect(readCookie(req)).toBe("tok.en");
  });
});

describe("isSameOrigin", () => {
  const req = (url: string, headers: Record<string, string>) => new Request(url, { method: "POST", headers });

  it("accepts same-origin and header-less requests, rejects other sites", () => {
    expect(isSameOrigin(req("https://a.test/x", {}))).toBe(true);
    expect(isSameOrigin(req("https://a.test/x", { origin: "https://a.test" }))).toBe(true);
    expect(isSameOrigin(req("https://a.test/x", { origin: "https://evil.test" }))).toBe(false);
    expect(isSameOrigin(req("https://a.test/x", { origin: "null" }))).toBe(false);
  });

  it("accepts the public host when a proxy rewrote the request URL", () => {
    expect(isSameOrigin(req("http://localhost:3000/x", { origin: "https://app.test", "x-forwarded-host": "app.test" }))).toBe(true);
    expect(isSameOrigin(req("http://localhost:3000/x", { origin: "http://127.0.0.1:8788", host: "127.0.0.1:8788" }))).toBe(true);
  });
});
