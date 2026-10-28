import type { LlmTarget } from "@/lib/config";
import type { GenerateOptions, LlmProvider } from "@/lib/llm";

export const LLM: LlmTarget = {
  id: "m1",
  provider: "openai",
  baseUrl: "https://api.example.com/v1",
  apiKey: "sk-test",
  model: "test-model",
  modelLabel: "Test Model",
  timeoutMs: 1000,
  temperature: 0.8,
  maxTokens: 1000,
  jsonMode: true,
};

/** A provider that returns the given outputs in order and records calls. */
export function scriptedProvider(...outputs: (string | Error)[]) {
  const calls: GenerateOptions[] = [];
  const provider: LlmProvider = {
    name: "scripted",
    async generate(opts) {
      calls.push(opts);
      const next = outputs.shift();
      if (next === undefined) throw new Error("no more scripted outputs");
      if (next instanceof Error) throw next;
      return { text: next };
    },
  };
  return { provider, calls };
}

export function variationsJson(n: number, tags = ["#one", "#two"]) {
  return JSON.stringify({
    variations: Array.from({ length: n }, (_, i) => ({ caption: `Caption ${i + 1}`, hashtags: tags })),
  });
}

export const VALID_INPUT = {
  description: "Handmade soy candles, lavender scent, launching this Friday",
  platform: "instagram" as const,
  tone: "friendly" as const,
  count: 3,
  emojis: true,
};
