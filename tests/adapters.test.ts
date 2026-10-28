import { describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";
import { createAnthropicProvider } from "@/lib/llm/anthropic";
import { createOpenAiCompatibleProvider } from "@/lib/llm/openai";
import { describeFailure } from "@/lib/llm/http";
import type { GenerateOptions } from "@/lib/llm";

const OPTS: GenerateOptions = {
  messages: [
    { role: "system", content: "sys" },
    { role: "user", content: "hi" },
  ],
  model: "m",
  temperature: 1.2,
  maxTokens: 500,
  jsonMode: true,
  timeoutMs: 1000,
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

type FetchCall = [string, RequestInit];
const callOf = (mock: { mock: { calls: unknown[][] } }, i = 0) => mock.mock.calls[i] as unknown as FetchCall;

async function expectAppError(p: Promise<unknown>, code: string) {
  const err = await p.catch((e: unknown) => e);
  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).code).toBe(code);
  return err as AppError;
}

/** A fetch that never resolves until aborted. */
const hangingFetch = (_url: string | URL | Request, init?: RequestInit) =>
  new Promise<Response>((_, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
  });

describe("OpenAI-compatible adapter", () => {
  it("sends a chat completion request and returns text + usage", async () => {
    const fetchMock = vi.fn(async (..._args: unknown[]) =>
      json({ choices: [{ message: { content: "ok" } }], usage: { prompt_tokens: 5, completion_tokens: 7 } }),
    );
    const p = createOpenAiCompatibleProvider({ baseUrl: "https://api.x.com/v1/", apiKey: "sk-1", fetch: fetchMock });
    const r = await p.generate(OPTS);

    expect(r).toEqual({ text: "ok", usage: { inputTokens: 5, outputTokens: 7 } });
    const [url, init] = callOf(fetchMock);
    expect(url).toBe("https://api.x.com/v1/chat/completions");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer sk-1");
    expect(JSON.parse(init.body as string)).toMatchObject({
      model: "m",
      max_tokens: 500,
      temperature: 1.2,
      response_format: { type: "json_object" },
    });
  });

  it("works without an API key (local server) and without JSON mode", async () => {
    const fetchMock = vi.fn(async (..._args: unknown[]) => json({ choices: [{ message: { content: "ok" } }] }));
    const p = createOpenAiCompatibleProvider({ baseUrl: "http://localhost:11434/v1", fetch: fetchMock });
    await p.generate({ ...OPTS, jsonMode: false });
    const [, init] = callOf(fetchMock);
    expect((init.headers as Record<string, string>).authorization).toBeUndefined();
    expect(JSON.parse(init.body as string).response_format).toBeUndefined();
  });

  it("maps HTTP errors without leaking them in the user message", async () => {
    const p = createOpenAiCompatibleProvider({
      baseUrl: "https://api.x.com/v1",
      fetch: async () => json({ error: "invalid key sk-secret" }, 401),
    });
    const err = await expectAppError(p.generate(OPTS), "MODEL_UNAVAILABLE");
    expect(err.message).not.toContain("sk-secret");
    expect(err.detail).toContain("401");
  });

  it("maps 429 to RATE_LIMITED", async () => {
    const p = createOpenAiCompatibleProvider({ baseUrl: "https://api.x.com/v1", fetch: async () => json({}, 429) });
    await expectAppError(p.generate(OPTS), "RATE_LIMITED");
  });

  it("maps network failures to MODEL_UNAVAILABLE", async () => {
    const p = createOpenAiCompatibleProvider({
      baseUrl: "http://10.0.0.5:11434/v1",
      fetch: async () => {
        throw new TypeError("fetch failed");
      },
    });
    const err = await expectAppError(p.generate(OPTS), "MODEL_UNAVAILABLE");
    expect(err.detail).toContain("http://10.0.0.5:11434");
  });

  it("times out", async () => {
    const p = createOpenAiCompatibleProvider({ baseUrl: "https://api.x.com/v1", fetch: hangingFetch });
    await expectAppError(p.generate({ ...OPTS, timeoutMs: 20 }), "TIMEOUT");
  });

  it("rejects an empty completion", async () => {
    const p = createOpenAiCompatibleProvider({
      baseUrl: "https://api.x.com/v1",
      fetch: async () => json({ choices: [{ message: { content: "" } }] }),
    });
    await expectAppError(p.generate(OPTS), "BAD_OUTPUT");
  });
});

describe("Anthropic adapter", () => {
  it("uses the Messages API with x-api-key, version header and separate system prompt", async () => {
    const fetchMock = vi.fn(async (..._args: unknown[]) =>
      json({ content: [{ type: "text", text: "hello" }], usage: { input_tokens: 3, output_tokens: 4 } }),
    );
    const r = await createAnthropicProvider({ apiKey: "ak-1", fetch: fetchMock }).generate(OPTS);

    expect(r).toEqual({ text: "hello", usage: { inputTokens: 3, outputTokens: 4 } });
    const [url, init] = callOf(fetchMock);
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    const headers = init.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("ak-1");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    const body = JSON.parse(init.body as string);
    expect(body.system).toBe("sys");
    expect(body.messages).toEqual([{ role: "user", content: "hi" }]);
    expect(body.temperature).toBe(1); // clamped to Anthropic's range
    expect(body.response_format).toBeUndefined();
  });

  it("accepts a base URL that already ends in /v1", async () => {
    const fetchMock = vi.fn(async (..._args: unknown[]) => json({ content: [{ type: "text", text: "x" }] }));
    await createAnthropicProvider({ baseUrl: "https://proxy.example.com/v1", apiKey: "k", fetch: fetchMock }).generate(OPTS);
    expect(callOf(fetchMock)[0]).toBe("https://proxy.example.com/v1/messages");
  });

  it("maps errors and timeouts", async () => {
    await expectAppError(
      createAnthropicProvider({ apiKey: "k", fetch: async () => json({}, 500) }).generate(OPTS),
      "MODEL_UNAVAILABLE",
    );
    await expectAppError(
      createAnthropicProvider({ apiKey: "k", fetch: hangingFetch }).generate({ ...OPTS, timeoutMs: 20 }),
      "TIMEOUT",
    );
  });
});

describe("describeFailure", () => {
  const GEMINI = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

  it("explains Gemini's region restriction", () => {
    const body = '{ "error": { "code": 400, "message": "User location is not supported for the API use.", "status": "FAILED_PRECONDITION" } }';
    const msg = describeFailure(GEMINI, null, 400, body);
    expect(msg).toMatch(/doesn't offer its API in the country/);
    expect(msg).toMatch(/OpenRouter/);
    expect(msg).toContain('"User location is not supported for the API use."');
  });

  it("points at the model name on 404 and quotes the provider (Gemini array body)", () => {
    const body = '[{"error":{"code":404,"message":"models/gemini-pro is not found for API version v1main","status":"NOT_FOUND"}}]';
    const msg = describeFailure(GEMINI, null, 404, body);
    expect(msg).toMatch(/model name is wrong or retired/);
    expect(msg).toContain("models/gemini-pro is not found");
  });

  it("keeps plain-text bodies and auth hints", () => {
    expect(describeFailure("https://x.test/v1", null, 500, "upstream exploded")).toBe(
      'The provider returned HTTP 500. The provider said: "upstream exploded"',
    );
    expect(describeFailure("https://x.test/v1", null, 401, '{"error":{"message":"Incorrect API key provided"}}')).toMatch(
      /rejected the API key \(HTTP 401\).*Incorrect API key provided/,
    );
  });
});
