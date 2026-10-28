import { z } from "zod";
import { PROVIDER_KEYS } from "./providers";

/** Admin API contracts, shared by the admin UI and the server. */

export const HeaderInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Header name is required.")
    .max(100)
    .regex(/^[A-Za-z0-9-]+$/, "Header names may contain only letters, numbers and dashes."),
  /** Blank keeps the saved value for an existing header. */
  value: z.string().max(4000),
});

export const ModelInputSchema = z.object({
  name: z.string().trim().min(1, "Display name is required.").max(100),
  provider: z.enum(PROVIDER_KEYS, { message: "Choose a provider." }),
  baseUrl: z
    .string()
    .trim()
    .url("Enter a full URL, e.g. https://api.openai.com/v1")
    .refine((u) => /^https?:\/\//i.test(u), "The URL must start with http:// or https://")
    .refine((u) => !u.includes("ACCOUNT_ID"), "Replace ACCOUNT_ID in the URL with your Cloudflare account ID."),
  modelName: z.string().trim().min(1, "Model name is required.").max(300),
  /** New key. Blank keeps the saved key. */
  apiKey: z.string().max(4000).default(""),
  clearApiKey: z.boolean().default(false),
  headers: z.array(HeaderInputSchema).max(10).default([]),
  temperature: z.number().min(0).max(1.5).default(0.8),
  maxTokens: z.number().int().min(256).max(16000).default(2000),
  timeoutSeconds: z.number().int().min(5).max(300).default(30),
  jsonMode: z.boolean().default(false),
  enabled: z.boolean().default(true),
});

export type ModelInput = z.infer<typeof ModelInputSchema>;
export type ModelInputDraft = z.input<typeof ModelInputSchema>;

export interface LastTest {
  ok: boolean;
  at: number;
  ms: number;
  message: string;
}

/** A model as the admin UI sees it: never includes secrets. */
export interface AdminModel {
  id: string;
  name: string;
  provider: string;
  baseUrl: string;
  modelName: string;
  hasApiKey: boolean;
  apiKeyHint: string | null;
  headerNames: string[];
  temperature: number;
  maxTokens: number;
  timeoutSeconds: number;
  jsonMode: boolean;
  enabled: boolean;
  lastTest: LastTest | null;
  isDefault: boolean;
}

export interface ModelsListing {
  models: AdminModel[];
  /** Model ids in the order generation tries them. */
  priority: string[];
  builtin: { label: string; model: string } | null;
}

export interface TestResult {
  ok: boolean;
  ms: number;
  reply?: string;
  error?: string;
}

export interface DiscoverResult {
  ok: boolean;
  models?: string[];
  error?: string;
}

export const UserInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(100),
  email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(320),
  /** Required when creating; blank keeps the current password when editing. */
  password: z.string().max(200).default(""),
});

export interface AdminUserView {
  id: string;
  name: string;
  email: string;
  owner: boolean;
  lastLoginAt: number | null;
  createdAt: number | null;
}

export interface SessionInfo {
  user: AdminUserView | null;
  /** ADMIN_PASSWORD is set, so sign-in is possible. */
  configured: boolean;
  encryption: boolean;
  storage: "kv" | "memory";
  runtime: "cloudflare" | "node";
}
