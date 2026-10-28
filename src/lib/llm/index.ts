import type { LlmTarget } from "../config";
import { createAnthropicProvider } from "./anthropic";
import { createOpenAiCompatibleProvider } from "./openai";
import type { FetchLike, LlmProvider } from "./types";

export type { ChatMessage, GenerateOptions, GenerateResult, LlmProvider } from "./types";

/** Build the adapter for a model target. */
export function createProvider(target: LlmTarget, fetchFn?: FetchLike): LlmProvider {
  switch (target.provider) {
    case "anthropic":
      return createAnthropicProvider({
        baseUrl: target.baseUrl,
        apiKey: target.apiKey ?? "",
        headers: target.headers,
        fetch: fetchFn,
      });
    case "openai":
      return createOpenAiCompatibleProvider({
        baseUrl: target.baseUrl,
        apiKey: target.apiKey,
        headers: target.headers,
        fetch: fetchFn,
      });
  }
}
