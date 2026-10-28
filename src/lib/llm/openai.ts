import { AppError } from "../errors";
import { postJson, trimTrailingSlash } from "./http";
import type { FetchLike, GenerateOptions, GenerateResult, LlmProvider } from "./types";

export interface OpenAiCompatibleConfig {
  baseUrl: string;
  apiKey?: string;
  headers?: Record<string, string>;
  fetch?: FetchLike;
}

interface ChatCompletionResponse {
  choices?: { message?: { content?: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

const NAME = "openai-compatible";

/**
 * OpenAI Chat Completions adapter. Works with OpenAI and every compatible API:
 * Gemini, Groq, OpenRouter, DeepSeek, Mistral, Cloudflare Workers AI,
 * Ollama, vLLM, LM Studio and llama.cpp server.
 */
export function createOpenAiCompatibleProvider(config: OpenAiCompatibleConfig): LlmProvider {
  const fetchFn = config.fetch ?? fetch;
  const url = `${trimTrailingSlash(config.baseUrl)}/chat/completions`;

  return {
    name: NAME,
    async generate(opts: GenerateOptions): Promise<GenerateResult> {
      const headers: Record<string, string> = { ...config.headers };
      if (config.apiKey) headers.authorization = `Bearer ${config.apiKey}`;

      const body: Record<string, unknown> = {
        model: opts.model,
        messages: opts.messages,
        temperature: opts.temperature,
        max_tokens: opts.maxTokens,
      };
      if (opts.jsonMode) body.response_format = { type: "json_object" };

      const data = (await postJson(fetchFn, url, headers, body, opts.timeoutMs, NAME)) as ChatCompletionResponse;
      const text = data.choices?.[0]?.message?.content;
      if (typeof text !== "string" || text.trim() === "") {
        throw new AppError("BAD_OUTPUT", undefined, `${NAME}: empty completion`);
      }

      return {
        text,
        usage: {
          inputTokens: data.usage?.prompt_tokens,
          outputTokens: data.usage?.completion_tokens,
        },
      };
    },
  };
}
