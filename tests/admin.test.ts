import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAdminHandler } from "@/lib/admin/handler";
import { readModels, toTarget } from "@/lib/admin/models";
import type { ModelsListing } from "@/lib/admin/schemas";
import { loadConfig } from "@/lib/config";
import { listModels } from "@/lib/llm/catalog";
import { publicModels, resolveTargets } from "@/lib/model-selection";
import { createMemoryRateLimiter } from "@/lib/rate-limit";
import { createMemoryStore, type JsonStore } from "@/lib/storage";

const ORIGIN = "https://captiongen.test";
const ENV = {
  ADMIN_EMAIL: "Owner@Example.com",
  ADMIN_PASSWORD: "owner-password-123",
  ENCRYPTION_KEY: "test-encryption-key-0123456789abcdef",
};

const okCompletion = () =>
  Response.json({
    choices: [{ message: { content: JSON.stringify({ variations: [{ caption: "Lavender evenings.", hashtags: ["candles"] }] }) } }],
  });

let store: JsonStore;
let fetchMock: ReturnType<typeof vi.fn>;
let env: Record<string, string>;

function makeHandler(limit = 5) {
  return createAdminHandler({
    getConfig: () => loadConfig(env),
    getStore: () => store,
    runtime: "cloudflare",
    loginLimiter: createMemoryRateLimiter(limit, 15 * 60_000),
    fetch: fetchMock as unknown as typeof fetch,
    failDelayMs: 0,
  });
}

let handle: ReturnType<typeof makeHandler>;

function call(method: string, path: string, body?: unknown, cookie?: string, origin = ORIGIN) {
  const headers: Record<string, string> = { origin, "cf-connecting-ip": "9.9.9.9" };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (cookie) headers.cookie = cookie;
  const req = new Request(`${ORIGIN}/api/admin/${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return handle(req, path.split("/"));
}

async function login(email = ENV.ADMIN_EMAIL, password = ENV.ADMIN_PASSWORD) {
  const res = await call("POST", "auth/login", { email, password });
  expect(res.status).toBe(200);
  return res.headers.get("set-cookie")!.split(";")[0]!;
}

const OPENAI_MODEL = {
  name: "GPT-4o mini",
  provider: "openai",
  baseUrl: "https://api.openai.com/v1",
  modelName: "gpt-4o-mini",
  apiKey: "sk-proj-SECRET1234567890a1b2",
  jsonMode: true,
};

const QWEN_MODEL = {
  name: "Qwen 2.5 7B (our server)",
  provider: "ollama",
  baseUrl: "https://qwen.example.com/v1",
  modelName: "qwen2.5:7b-instruct",
  headers: [{ name: "CF-Access-Client-Secret", value: "tunnel-token-xyz" }],
  timeoutSeconds: 120,
};

beforeEach(() => {
  store = createMemoryStore();
  fetchMock = vi.fn(async () => okCompletion());
  env = { ...ENV };
  handle = makeHandler();
});

describe("admin authentication", () => {
  it("reports session state without signing in", async () => {
    const res = await call("GET", "auth/me");
    expect(await res.json()).toMatchObject({ user: null, configured: true, encryption: true, storage: "memory" });
  });

  it("protects every admin route", async () => {
    for (const [method, path] of [
      ["GET", "models"],
      ["POST", "models"],
      ["GET", "users"],
      ["POST", "models/test"],
    ] as const) {
      expect((await call(method, path, method === "POST" ? {} : undefined)).status).toBe(401);
    }
  });

  it("rejects a wrong password and rate limits after 5 attempts", async () => {
    for (let i = 0; i < 5; i++) {
      expect((await call("POST", "auth/login", { email: ENV.ADMIN_EMAIL, password: "nope" })).status).toBe(401);
    }
    const res = await call("POST", "auth/login", { email: ENV.ADMIN_EMAIL, password: ENV.ADMIN_PASSWORD });
    expect(res.status).toBe(429);
  });

  it("signs the owner in with a secure, httpOnly, strict cookie (email is case-insensitive)", async () => {
    const res = await call("POST", "auth/login", { email: "owner@example.com", password: ENV.ADMIN_PASSWORD });
    const cookie = res.headers.get("set-cookie")!;
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Strict/);
    expect(cookie).toMatch(/Secure/);
    const me = await (await call("GET", "auth/me", undefined, cookie.split(";")[0])).json();
    expect(me.user).toMatchObject({ id: "owner", owner: true });
  });

  it("signs the owner out everywhere when ADMIN_PASSWORD changes", async () => {
    const cookie = await login();
    env.ADMIN_PASSWORD = "a-brand-new-password";
    expect((await call("GET", "models", undefined, cookie)).status).toBe(401);
  });

  it("rejects cross-origin writes", async () => {
    const cookie = await login();
    expect((await call("POST", "models", OPENAI_MODEL, cookie, "https://evil.test")).status).toBe(403);
  });

  it("can't sign in when ADMIN_PASSWORD isn't set", async () => {
    env = { ENCRYPTION_KEY: ENV.ENCRYPTION_KEY };
    expect((await (await call("GET", "auth/me")).json()).configured).toBe(false);
    expect((await call("POST", "auth/login", { email: "admin", password: "x" })).status).toBe(503);
  });
});

describe("AI models admin", () => {
  it("stores API keys encrypted and only ever returns a masked hint", async () => {
    const cookie = await login();
    const res = await call("POST", "models", OPENAI_MODEL, cookie);
    expect(res.status).toBe(201);
    const text = await res.text();
    expect(text).not.toContain("SECRET1234567890");
    const listing = JSON.parse(text) as ModelsListing;
    expect(listing.models[0]).toMatchObject({ hasApiKey: true, apiKeyHint: "sk-••••••••a1b2", isDefault: true });

    const raw = JSON.stringify(await store.get("models"));
    expect(raw).not.toContain("SECRET1234567890");
    const doc = await readModels(store);
    expect((await toTarget(doc.models[0]!, ENV.ENCRYPTION_KEY)).apiKey).toBe(OPENAI_MODEL.apiKey);
  });

  it("keeps the saved key when editing with a blank key, and can remove it", async () => {
    const cookie = await login();
    const created = (await (await call("POST", "models", { ...QWEN_MODEL, apiKey: "local-key-123456789" }, cookie)).json()) as ModelsListing;
    const id = created.models[0]!.id;

    await call("PUT", `models/${id}`, { ...QWEN_MODEL, name: "Renamed", headers: [{ name: "CF-Access-Client-Secret", value: "" }] }, cookie);
    let rec = (await readModels(store)).models[0]!;
    let target = await toTarget(rec, ENV.ENCRYPTION_KEY);
    expect(rec.name).toBe("Renamed");
    expect(target.apiKey).toBe("local-key-123456789");
    expect(target.headers).toEqual({ "CF-Access-Client-Secret": "tunnel-token-xyz" });
    expect(JSON.stringify(rec)).not.toContain("tunnel-token-xyz");

    await call("PUT", `models/${id}`, { ...QWEN_MODEL, clearApiKey: true, headers: [] }, cookie);
    rec = (await readModels(store)).models[0]!;
    target = await toTarget(rec, ENV.ENCRYPTION_KEY);
    expect(target.apiKey).toBeUndefined();
    expect(target.headers).toEqual({});
  });

  it("requires a key for cloud providers but not for self-hosted ones", async () => {
    const cookie = await login();
    const res = await call("POST", "models", { ...OPENAI_MODEL, apiKey: "" }, cookie);
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toMatch(/needs an API key/);
    expect((await call("POST", "models", { ...QWEN_MODEL, headers: [] }, cookie)).status).toBe(201);
  });

  it("validates input with readable messages", async () => {
    const cookie = await login();
    const bad = await call("POST", "models", { ...OPENAI_MODEL, baseUrl: "not a url" }, cookie);
    expect((await bad.json()).error.message).toMatch(/full URL/);
    const cf = await call(
      "POST",
      "models",
      { ...OPENAI_MODEL, provider: "workers-ai", baseUrl: "https://api.cloudflare.com/client/v4/accounts/ACCOUNT_ID/ai/v1" },
      cookie,
    );
    expect((await cf.json()).error.message).toMatch(/ACCOUNT_ID/);
  });

  it("refuses to save keys without ENCRYPTION_KEY", async () => {
    env = { ADMIN_PASSWORD: ENV.ADMIN_PASSWORD };
    handle = makeHandler();
    const cookie = await login("admin");
    const res = await call("POST", "models", OPENAI_MODEL, cookie);
    expect(res.status).toBe(503);
    expect((await res.json()).error.message).toMatch(/ENCRYPTION_KEY/);
  });

  it("orders models, sets the default and deletes", async () => {
    const cookie = await login();
    await call("POST", "models", OPENAI_MODEL, cookie);
    const l2 = (await (await call("POST", "models", { ...QWEN_MODEL, headers: [] }, cookie)).json()) as ModelsListing;
    const [gpt, qwen] = l2.models;
    expect(gpt!.isDefault).toBe(true);

    const l3 = (await (await call("POST", `models/${qwen!.id}/default`, undefined, cookie)).json()) as ModelsListing;
    expect(l3.models.map((m) => m.name)).toEqual([QWEN_MODEL.name, OPENAI_MODEL.name]);
    expect(l3.models[0]!.isDefault).toBe(true);

    const l4 = (await (await call("PUT", "models/priority", { modelIds: [gpt!.id, qwen!.id] }, cookie)).json()) as ModelsListing;
    expect(l4.priority).toEqual([gpt!.id, qwen!.id]);

    const l5 = (await (await call("DELETE", `models/${gpt!.id}`, undefined, cookie)).json()) as ModelsListing;
    expect(l5.models.map((m) => m.id)).toEqual([qwen!.id]);
    expect(l5.priority).toEqual([qwen!.id]);
  });

  it("tests a saved model with a sample caption and records the result", async () => {
    const cookie = await login();
    const { models } = (await (await call("POST", "models", OPENAI_MODEL, cookie)).json()) as ModelsListing;
    const res = await (await call("POST", `models/${models[0]!.id}/test`, undefined, cookie)).json();
    expect(res.result).toMatchObject({ ok: true, reply: expect.stringContaining("Lavender evenings.") });
    expect(res.listing.models[0].lastTest).toMatchObject({ ok: true });
    const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${OPENAI_MODEL.apiKey}`);
  });

  it("tests unsaved form values and explains connection failures", async () => {
    const cookie = await login();
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    const res = await (
      await call("POST", "models/test", { config: { ...QWEN_MODEL, baseUrl: "http://10.0.0.5:11434/v1", headers: [] } }, cookie)
    ).json();
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/Cannot reach http:\/\/10\.0\.0\.5:11434/);
    expect(await store.get("models")).toBeNull(); // nothing saved
  });

  it("fetches the provider's model list", async () => {
    const cookie = await login();
    fetchMock.mockResolvedValueOnce(Response.json({ data: [{ id: "qwen2.5:7b-instruct" }, { id: "llama3.2:3b" }] }));
    const res = await (await call("POST", "models/discover", { config: { ...QWEN_MODEL, headers: [] } }, cookie)).json();
    expect(res).toEqual({ ok: true, models: ["llama3.2:3b", "qwen2.5:7b-instruct"] });
  });
});

describe("admin users", () => {
  it("lets the owner add an admin who can then sign in", async () => {
    const owner = await login();
    const created = await call("POST", "users", { name: "Sam", email: "sam@example.com", password: "sam-password-1" }, owner);
    expect(created.status).toBe(201);
    const { users } = await created.json();
    expect(users.map((u: { email: string }) => u.email)).toEqual(["owner@example.com", "sam@example.com"]);
    expect(JSON.stringify(users)).not.toMatch(/pbkdf2/);

    const sam = await login("sam@example.com", "sam-password-1");
    expect((await call("GET", "models", undefined, sam)).status).toBe(200);
  });

  it("rejects duplicate emails and weak passwords", async () => {
    const owner = await login();
    expect((await call("POST", "users", { name: "X", email: "owner@example.com", password: "long-enough-pw" }, owner)).status).toBe(400);
    expect((await call("POST", "users", { name: "X", email: "x@example.com", password: "short" }, owner)).status).toBe(400);
  });

  it("signs an admin out when their password changes, and they can't remove themselves", async () => {
    const owner = await login();
    await call("POST", "users", { name: "Sam", email: "sam@example.com", password: "sam-password-1" }, owner);
    const sam = await login("sam@example.com", "sam-password-1");
    const samId = (await (await call("GET", "users", undefined, sam)).json()).me;

    expect((await call("DELETE", `users/${samId}`, undefined, sam)).status).toBe(400);

    const changed = await call("POST", "auth/password", { currentPassword: "sam-password-1", newPassword: "sam-password-2" }, sam);
    expect(changed.status).toBe(200);
    expect((await call("GET", "models", undefined, sam)).status).toBe(401); // old cookie
    const fresh = changed.headers.get("set-cookie")!.split(";")[0]!;
    expect((await call("GET", "models", undefined, fresh)).status).toBe(200);

    expect((await call("DELETE", `users/${samId}`, undefined, owner)).status).toBe(200);
    expect((await call("GET", "models", undefined, fresh)).status).toBe(401);
  });

  it("does not let the owner account be edited in the panel", async () => {
    const owner = await login();
    expect((await call("PUT", "users/owner", { name: "x", email: "x@example.com" }, owner)).status).toBe(400);
    expect((await call("POST", "auth/password", { currentPassword: "a", newPassword: "b-long-enough" }, owner)).status).toBe(400);
  });
});

describe("model selection for users", () => {
  async function setupModels() {
    const cookie = await login();
    await call("POST", "models", OPENAI_MODEL, cookie);
    await call("POST", "models", { ...QWEN_MODEL, headers: [] }, cookie);
    await call("POST", "models", { ...QWEN_MODEL, name: "Hidden", headers: [], enabled: false }, cookie);
    return readModels(store);
  }

  it("lists only enabled models without provider details", async () => {
    const doc = await setupModels();
    const list = publicModels(doc, null);
    expect(list).toEqual([
      { id: expect.any(String), label: "GPT-4o mini", isDefault: true },
      { id: expect.any(String), label: "Qwen 2.5 7B (our server)", isDefault: false },
    ]);
  });

  it("resolves the chosen model plus one fallback, and rejects disabled models", async () => {
    const doc = await setupModels();
    const [gpt, qwen, hidden] = doc.models;
    const chain = await resolveTargets(doc, qwen!.id, null, ENV.ENCRYPTION_KEY);
    expect(chain.map((t) => t.modelLabel)).toEqual(["Qwen 2.5 7B (our server)", "GPT-4o mini"]);
    expect(chain[0]).toMatchObject({ provider: "openai", timeoutMs: 120_000, apiKey: undefined });
    expect((await resolveTargets(doc, undefined, null, ENV.ENCRYPTION_KEY))[0]!.id).toBe(gpt!.id);
    await expect(resolveTargets(doc, hidden!.id, null, ENV.ENCRYPTION_KEY)).rejects.toMatchObject({ code: "MODEL_NOT_FOUND" });
  });

  it("uses the built-in env model until an admin adds one", async () => {
    const builtin = loadConfig({ LLM_MODEL: "gpt-4o-mini", LLM_API_KEY: "sk-env", LLM_MODEL_LABEL: "Built-in" }).llm;
    const empty = await readModels(store);
    expect(publicModels(empty, builtin)).toEqual([{ id: "builtin", label: "Built-in", isDefault: true }]);
    expect((await resolveTargets(empty, undefined, builtin, undefined))[0]!.apiKey).toBe("sk-env");
    await expect(resolveTargets(empty, undefined, null, undefined)).rejects.toMatchObject({ code: "NOT_CONFIGURED" });
  });
});

describe("listModels", () => {
  it("lists OpenAI-compatible and Gemini-style model IDs", async () => {
    const f = vi.fn(async () => Response.json({ data: [{ id: "models/gemini-2.5-flash" }, { id: "gpt-4o-mini" }] }));
    const r = await listModels({ provider: "openai", baseUrl: "https://x.test/v1/", apiKey: "k" }, { fetch: f as unknown as typeof fetch });
    expect(r).toEqual({ ok: true, models: ["gemini-2.5-flash", "gpt-4o-mini"] });
    expect((f.mock.calls[0] as unknown as [string])[0]).toBe("https://x.test/v1/models");
  });

  it("uses Anthropic's headers and explains auth errors", async () => {
    const f = vi.fn(async () => new Response("unauthorized", { status: 401 }));
    const r = await listModels({ provider: "anthropic", baseUrl: "https://api.anthropic.com", apiKey: "ak" }, { fetch: f as unknown as typeof fetch });
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/rejected the API key/) });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.anthropic.com/v1/models?limit=100");
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe("ak");
  });
});
