import { z } from "zod";

/**
 * All runtime configuration is read from environment variables in this one
 * place. On Cloudflare they are wrangler "vars" and secrets; on Node they come
 * from .env files or the host. AI models are normally managed in /admin; the
 * LLM_* variables only define a built-in model used until one is added there.
 */

const EnvSchema = z.object({
  LLM_PROVIDER: z.enum(["openai", "anthropic"]).default("openai"),
  LLM_BASE_URL: z.string().url().optional(),
  LLM_API_KEY: z.string().optional(),
  LLM_MODEL: z.string().min(1).optional(),
  /** Optional display name shown on result cards, e.g. "GPT-4o mini". */
  LLM_MODEL_LABEL: z.string().optional(),
  LLM_TIMEOUT_MS: z.coerce.number().int().min(1000).max(300_000).default(30_000),
  LLM_TEMPERATURE: z.coerce.number().min(0).max(1.5).default(0.8),
  LLM_MAX_TOKENS: z.coerce.number().int().min(256).max(16_000).default(2000),
  /** Set to "false" for OpenAI-compatible servers that reject response_format. */
  LLM_JSON_MODE: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).max(1000).default(10),
  ADMIN_EMAIL: z.string().default("admin"),
  ADMIN_PASSWORD: z.string().optional(),
  SESSION_SECRET: z.string().optional(),
  ENCRYPTION_KEY: z.string().optional(),
});

/** Everything needed to call one model. */
export interface LlmTarget {
  /** Model record id ("builtin" for the env-configured model). */
  id: string;
  provider: "openai" | "anthropic";
  baseUrl: string;
  apiKey?: string;
  headers?: Record<string, string>;
  model: string;
  modelLabel: string;
  timeoutMs: number;
  temperature: number;
  maxTokens: number;
  jsonMode: boolean;
}

export interface AppConfig {
  /** Built-in model from LLM_* env vars, or null. */
  llm: LlmTarget | null;
  rateLimitPerMinute: number;
  admin: {
    email: string;
    password?: string;
    sessionSecret?: string;
    encryptionKey?: string;
  };
}

export const BUILTIN_MODEL_ID = "builtin";

const DEFAULT_BASE_URL = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com",
} as const;

type Env = Record<string, string | undefined>;

/** Treat empty strings as unset so placeholder lines in env files are harmless. */
function clean(env: Env): Env {
  const out: Env = {};
  for (const [k, v] of Object.entries(env)) if (typeof v === "string" && v.trim() !== "") out[k] = v.trim();
  return out;
}

export function loadConfig(env: Env = process.env): AppConfig {
  const parsed = EnvSchema.safeParse(clean(env));
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Invalid environment configuration: ${fields}`);
  }
  const e = parsed.data;
  const baseUrl = e.LLM_BASE_URL ?? DEFAULT_BASE_URL[e.LLM_PROVIDER];

  // A model is required; a key is required for the hosted defaults but not for self-hosted servers.
  const needsKey = e.LLM_PROVIDER === "anthropic" || baseUrl === DEFAULT_BASE_URL.openai;
  const configured = Boolean(e.LLM_MODEL) && (!needsKey || Boolean(e.LLM_API_KEY));

  return {
    llm: configured
      ? {
          id: BUILTIN_MODEL_ID,
          provider: e.LLM_PROVIDER,
          baseUrl,
          apiKey: e.LLM_API_KEY,
          model: e.LLM_MODEL!,
          modelLabel: e.LLM_MODEL_LABEL ?? e.LLM_MODEL!,
          timeoutMs: e.LLM_TIMEOUT_MS,
          temperature: e.LLM_TEMPERATURE,
          maxTokens: e.LLM_MAX_TOKENS,
          jsonMode: e.LLM_JSON_MODE,
        }
      : null,
    rateLimitPerMinute: e.RATE_LIMIT_PER_MINUTE,
    admin: {
      email: e.ADMIN_EMAIL.toLowerCase(),
      password: e.ADMIN_PASSWORD,
      sessionSecret: e.SESSION_SECRET,
      encryptionKey: e.ENCRYPTION_KEY,
    },
  };
}
