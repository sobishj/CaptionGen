import { describe, expect, it } from "vitest";
import { loadConfig } from "@/lib/config";
import { createMemoryRateLimiter } from "@/lib/rate-limit";

describe("loadConfig", () => {
  it("is not configured without a model or key", () => {
    expect(loadConfig({}).llm).toBeNull();
    expect(loadConfig({ LLM_MODEL: "gpt-4o-mini" }).llm).toBeNull();
    expect(loadConfig({ LLM_PROVIDER: "anthropic", LLM_MODEL: "claude-haiku-4-5" }).llm).toBeNull();
  });

  it("applies defaults", () => {
    const c = loadConfig({ LLM_MODEL: "gpt-4o-mini", LLM_API_KEY: "sk" });
    expect(c.llm).toMatchObject({
      provider: "openai",
      baseUrl: "https://api.openai.com/v1",
      modelLabel: "gpt-4o-mini",
      timeoutMs: 30000,
      temperature: 0.8,
      jsonMode: true,
    });
    expect(c.rateLimitPerMinute).toBe(10);
  });

  it("allows a self-hosted server with no API key", () => {
    const c = loadConfig({ LLM_BASE_URL: "http://localhost:11434/v1", LLM_MODEL: "qwen2.5:7b", LLM_JSON_MODE: "false" });
    expect(c.llm).toMatchObject({ apiKey: undefined, jsonMode: false });
  });

  it("uses the Anthropic default base URL and treats blank values as unset", () => {
    const c = loadConfig({
      LLM_PROVIDER: "anthropic",
      LLM_API_KEY: "k",
      LLM_MODEL: "claude-haiku-4-5",
      LLM_BASE_URL: " ",
    });
    expect(c.llm?.baseUrl).toBe("https://api.anthropic.com");
  });

  it("throws on invalid values", () => {
    expect(() => loadConfig({ LLM_PROVIDER: "foo" })).toThrow(/LLM_PROVIDER/);
    expect(() => loadConfig({ RATE_LIMIT_PER_MINUTE: "abc" })).toThrow(/RATE_LIMIT_PER_MINUTE/);
  });
});

describe("createMemoryRateLimiter", () => {
  it("resets after the window", () => {
    let t = 0;
    const rl = createMemoryRateLimiter(1, 1000, () => t);
    expect(rl.check("a")).toBe(true);
    expect(rl.check("a")).toBe(false);
    t = 1001;
    expect(rl.check("a")).toBe(true);
  });
});
