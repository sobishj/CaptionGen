import { AppError } from "../errors";
import { postJson, trimTrailingSlash } from "./http";
import type { FetchLike, GenerateOptions, GenerateResult, LlmProvider } from "./types";

export const ANTHROPIC_VERSION = "2023-06-01";
const NAME = "anthropic";

export interface AnthropicConfig {
  baseUrl?: string;
  apiKey: string;
  headers?: Record<string, string>;
  fetch?: FetchLike;
}

interface MessagesResponse {
  content?: { type: string; text?: string }[];
  usage?: { input_tokens?: number; output_tokens?: number };
}

/** Anthropic Claude Messages API adapter. */
export function createAnthropicProvider(config: AnthropicConfig): LlmProvider {
  const fetchFn = config.fetch ?? fetch;
  const base = trimTrailingSlash(config.baseUrl || "https://api.anthropic.com").replace(/\/v1$/, "");
  const url = `${base}/v1/messages`;

  return {
    name: NAME,
    async generate(opts: GenerateOptions): Promise<GenerateResult> {
      // The Messages API takes the system prompt separately.
      const system = opts.messages
        .filter((m) => m.role === "system")
        .map((m) => m.content)
        .join("\n\n");
      const messages = opts.messages
        .filter((m) => m.role !== "system")
        .map((m) => ({ role: m.role, content: m.content }));

      const body: Record<string, unknown> = {
        model: opts.model,
        max_tokens: opts.maxTokens,
        // Anthropic accepts temperature in the 0–1 range.
        temperature: Math.min(1, Math.max(0, opts.temperature)),
        messages,
      };
      if (system) body.system = system;

      const headers = { ...config.headers, "x-api-key": config.apiKey, "anthropic-version": ANTHROPIC_VERSION };
      const data = (await postJson(fetchFn, url, headers, body, opts.timeoutMs, NAME)) as MessagesResponse;

      const text = (data.content ?? [])
        .filter((b) => b.type === "text" && typeof b.text === "string")
        .map((b) => b.text)
        .join("");
      if (!text.trim()) throw new AppError("BAD_OUTPUT", undefined, `${NAME}: empty response`);

      return {
        text,
        usage: { inputTokens: data.usage?.input_tokens, outputTokens: data.usage?.output_tokens },
      };
    },
  };
}
