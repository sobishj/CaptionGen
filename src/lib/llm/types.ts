export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface GenerateOptions {
  messages: ChatMessage[];
  model: string;
  temperature: number;
  maxTokens: number;
  /** Ask the provider for a JSON response where supported. */
  jsonMode: boolean;
  timeoutMs: number;
}

export interface GenerateResult {
  text: string;
  usage?: { inputTokens?: number; outputTokens?: number };
}

/**
 * Every AI provider implements this one method. To add a provider,
 * write an adapter and register it in ./index.ts — nothing else changes.
 */
export interface LlmProvider {
  readonly name: string;
  generate(options: GenerateOptions): Promise<GenerateResult>;
}

export type FetchLike = typeof fetch;
