/** Provider presets for the "Add model" form. Shared by the admin UI and the server. */

export type ProviderKind = "openai" | "anthropic";

export interface ProviderPreset {
  key: string;
  label: string;
  kind: ProviderKind;
  defaultBaseUrl: string;
  /** Sends prompts to a third-party cloud (vs. a server you run). */
  cloud: boolean;
  needsApiKey: boolean;
  exampleModel: string;
  /** Whether to ask for response_format JSON by default. */
  jsonMode: boolean;
  /** Short help shown under the provider select. */
  hint?: string;
}

export const PROVIDERS: ProviderPreset[] = [
  { key: "openai", label: "OpenAI (GPT)", kind: "openai", defaultBaseUrl: "https://api.openai.com/v1", cloud: true, needsApiKey: true, exampleModel: "gpt-4o-mini", jsonMode: true },
  { key: "anthropic", label: "Anthropic (Claude)", kind: "anthropic", defaultBaseUrl: "https://api.anthropic.com", cloud: true, needsApiKey: true, exampleModel: "claude-haiku-4-5", jsonMode: false },
  { key: "gemini", label: "Google (Gemini)", kind: "openai", defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", cloud: true, needsApiKey: true, exampleModel: "gemini-2.5-flash", jsonMode: true },
  { key: "groq", label: "Groq", kind: "openai", defaultBaseUrl: "https://api.groq.com/openai/v1", cloud: true, needsApiKey: true, exampleModel: "llama-3.3-70b-versatile", jsonMode: true },
  { key: "openrouter", label: "OpenRouter", kind: "openai", defaultBaseUrl: "https://openrouter.ai/api/v1", cloud: true, needsApiKey: true, exampleModel: "qwen/qwen-2.5-72b-instruct", jsonMode: false },
  { key: "deepseek", label: "DeepSeek", kind: "openai", defaultBaseUrl: "https://api.deepseek.com/v1", cloud: true, needsApiKey: true, exampleModel: "deepseek-chat", jsonMode: true },
  { key: "mistral", label: "Mistral", kind: "openai", defaultBaseUrl: "https://api.mistral.ai/v1", cloud: true, needsApiKey: true, exampleModel: "mistral-small-latest", jsonMode: true },
  { key: "deepinfra", label: "DeepInfra (Qwen, Llama and other open models)", kind: "openai", defaultBaseUrl: "https://api.deepinfra.com/v1/openai", cloud: true, needsApiKey: true, exampleModel: "Qwen/Qwen2.5-72B-Instruct", jsonMode: true },
  { key: "dashscope", label: "Alibaba Cloud Model Studio (Qwen)", kind: "openai", defaultBaseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1", cloud: true, needsApiKey: true, exampleModel: "qwen-plus", jsonMode: true },
  {
    key: "workers-ai",
    label: "Cloudflare Workers AI",
    kind: "openai",
    defaultBaseUrl: "https://api.cloudflare.com/client/v4/accounts/ACCOUNT_ID/ai/v1",
    cloud: true,
    needsApiKey: true,
    exampleModel: "@cf/meta/llama-3.1-8b-instruct",
    jsonMode: false,
    hint: "Replace ACCOUNT_ID in the URL with your Cloudflare account ID, and use an API token with Workers AI permission.",
  },
  { key: "ollama", label: "Ollama (self-hosted)", kind: "openai", defaultBaseUrl: "http://localhost:11434/v1", cloud: false, needsApiKey: false, exampleModel: "qwen2.5:7b-instruct", jsonMode: false },
  { key: "vllm", label: "vLLM (self-hosted)", kind: "openai", defaultBaseUrl: "http://localhost:8000/v1", cloud: false, needsApiKey: false, exampleModel: "Qwen/Qwen2.5-7B-Instruct", jsonMode: false },
  { key: "lmstudio", label: "LM Studio (self-hosted)", kind: "openai", defaultBaseUrl: "http://localhost:1234/v1", cloud: false, needsApiKey: false, exampleModel: "qwen2.5-7b-instruct", jsonMode: false },
  { key: "llamacpp", label: "llama.cpp server (self-hosted)", kind: "openai", defaultBaseUrl: "http://localhost:8080/v1", cloud: false, needsApiKey: false, exampleModel: "qwen2.5-7b-instruct", jsonMode: false },
  { key: "openai-compatible", label: "Other OpenAI-compatible server", kind: "openai", defaultBaseUrl: "", cloud: false, needsApiKey: false, exampleModel: "model-name", jsonMode: false },
];

export const PROVIDER_KEYS = PROVIDERS.map((p) => p.key) as [string, ...string[]];

export function getProvider(key: string): ProviderPreset | undefined {
  return PROVIDERS.find((p) => p.key === key);
}

/** True for localhost, private LAN ranges and bare Docker-style hostnames. */
export function isPrivateUrl(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^\[|\]$/g, "");
  } catch {
    return false;
  }
  if (host === "localhost" || host === "::1" || host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (!host.includes(".") && !host.includes(":")) return true; // e.g. "ollama"
  const m = /^(\d+)\.(\d+)\.\d+\.\d+$/.exec(host);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    return a === 10 || a === 127 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254);
  }
  return host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80");
}
