import { describe, expect, it, vi } from "vitest";
import { createGenerateHandler } from "@/lib/generate-handler";
import { AppError } from "@/lib/errors";
import { createMemoryRateLimiter } from "@/lib/rate-limit";
import type { LlmTarget } from "@/lib/config";
import type { LlmProvider } from "@/lib/llm";
import { LLM, scriptedProvider, VALID_INPUT, variationsJson } from "./helpers";

const FALLBACK: LlmTarget = { ...LLM, id: "m2", model: "backup-model", modelLabel: "Backup Model" };

function setup(
  providers: Record<string, LlmProvider> | LlmProvider,
  { limit = 100, targets = [LLM] as LlmTarget[] | AppError } = {},
) {
  const limiter = createMemoryRateLimiter(limit);
  const log = vi.fn();
  const resolveTargets = vi.fn(async (_modelId: string | undefined) => {
    if (targets instanceof AppError) throw targets;
    return targets;
  });
  const handle = createGenerateHandler({
    resolveTargets,
    getProvider: (t) => ("generate" in providers ? (providers as LlmProvider) : (providers as Record<string, LlmProvider>)[t.id]!),
    getRateLimiter: () => limiter,
    log,
  });
  return { handle, log, resolveTargets };
}

const post = (body: unknown, ip = "1.1.1.1") =>
  new Request("http://localhost/api/generate", {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": ip },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

describe("POST /api/generate handler", () => {
  it("returns variations on success", async () => {
    const { handle } = setup(scriptedProvider(variationsJson(3)).provider);
    const res = await handle(post(VALID_INPUT));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.variations).toHaveLength(3);
    expect(body.model).toBe("Test Model");
    expect(body.fallbackFrom).toBeUndefined();
    expect(body.variations[0].id).toBeTruthy();
  });

  it("passes the selected model id to model resolution", async () => {
    const { handle, resolveTargets } = setup(scriptedProvider(variationsJson(3)).provider);
    await handle(post({ ...VALID_INPUT, modelId: "m1" }));
    expect(resolveTargets).toHaveBeenCalledWith("m1");
  });

  it("rejects invalid input with 400 and a friendly message", async () => {
    const { provider, calls } = scriptedProvider();
    const { handle } = setup(provider);
    const res = await handle(post({ ...VALID_INPUT, description: "short" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatchObject({
      code: "INVALID_INPUT",
      message: expect.stringMatching(/at least 10/),
    });
    expect(calls).toHaveLength(0);
  });

  it("rejects malformed JSON", async () => {
    const { handle } = setup(scriptedProvider().provider);
    expect((await handle(post("{not json"))).status).toBe(400);
  });

  it("returns 400 MODEL_NOT_FOUND for a disabled or removed model", async () => {
    const { handle } = setup(scriptedProvider().provider, { targets: new AppError("MODEL_NOT_FOUND") });
    const res = await handle(post({ ...VALID_INPUT, modelId: "gone" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("MODEL_NOT_FOUND");
  });

  it("returns 502 BAD_OUTPUT when the model output can't be parsed", async () => {
    const { handle, log } = setup(scriptedProvider("garbage", "more garbage").provider);
    const res = await handle(post(VALID_INPUT));
    expect(res.status).toBe(502);
    expect((await res.json()).error.code).toBe("BAD_OUTPUT");
    expect(log).toHaveBeenCalled();
  });

  it("falls back to the next model and says which one answered", async () => {
    const primary = scriptedProvider(new AppError("TIMEOUT"));
    const backup = scriptedProvider(variationsJson(3));
    const { handle, log } = setup({ m1: primary.provider, m2: backup.provider }, { targets: [LLM, FALLBACK] });
    const res = await handle(post(VALID_INPUT));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.model).toBe("Backup Model");
    expect(body.fallbackFrom).toBe("Test Model");
    expect(backup.calls[0]!.model).toBe("backup-model");
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/Test Model failed \(TIMEOUT/));
  });

  it("does not fall back on unexpected errors", async () => {
    const backup = scriptedProvider(variationsJson(3));
    const { handle } = setup(
      { m1: scriptedProvider(new Error("boom: internal stack")).provider, m2: backup.provider },
      { targets: [LLM, FALLBACK] },
    );
    const res = await handle(post(VALID_INPUT));
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain("boom");
    expect(backup.calls).toHaveLength(0);
  });

  it("returns 503 when every model is unavailable, without leaking provider details", async () => {
    const { handle } = setup(
      {
        m1: scriptedProvider(new AppError("MODEL_UNAVAILABLE", undefined, "HTTP 401 invalid key sk-secret-123")).provider,
        m2: scriptedProvider(new AppError("MODEL_UNAVAILABLE", undefined, "Cannot reach http://10.0.0.5")).provider,
      },
      { targets: [LLM, FALLBACK] },
    );
    const res = await handle(post(VALID_INPUT));
    expect(res.status).toBe(503);
    const text = await res.text();
    expect(text).not.toContain("sk-secret");
    expect(text).not.toContain("10.0.0.5");
  });

  it("returns NOT_CONFIGURED when no model is available", async () => {
    const { handle } = setup(scriptedProvider().provider, { targets: new AppError("NOT_CONFIGURED") });
    const res = await handle(post(VALID_INPUT));
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe("NOT_CONFIGURED");
  });

  it("rate limits per IP", async () => {
    const { handle } = setup(scriptedProvider(variationsJson(3), variationsJson(3), variationsJson(3)).provider, { limit: 2 });
    expect((await handle(post(VALID_INPUT))).status).toBe(200);
    expect((await handle(post(VALID_INPUT))).status).toBe(200);
    const limited = await handle(post(VALID_INPUT));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("60");
    expect((await handle(post(VALID_INPUT, "2.2.2.2"))).status).toBe(200);
  });
});
