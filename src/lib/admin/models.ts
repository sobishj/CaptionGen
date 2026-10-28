import type { LlmTarget } from "../config";
import { decryptSecret, encryptSecret, maskSecret } from "../crypto";
import { AppError } from "../errors";
import type { JsonStore } from "../storage";
import { getProvider } from "./providers";
import type { AdminModel, LastTest, ModelInput } from "./schemas";

/** A stored AI model. Secrets are AES-GCM encrypted and never leave the server. */
export interface ModelRecord {
  id: string;
  name: string;
  provider: string;
  baseUrl: string;
  modelName: string;
  apiKeyEnc: string | null;
  apiKeyHint: string | null;
  /** Encrypted JSON object of extra request headers. */
  headersEnc: string | null;
  headerNames: string[];
  temperature: number;
  maxTokens: number;
  timeoutSeconds: number;
  jsonMode: boolean;
  enabled: boolean;
  lastTest: LastTest | null;
  createdAt: number;
  updatedAt: number;
}

export interface ModelsDoc {
  models: ModelRecord[];
  /** Order in which generation tries models: the first is the default. */
  priority: string[];
}

const KEY = "models";

export async function readModels(store: JsonStore): Promise<ModelsDoc> {
  const doc = (await store.get<ModelsDoc>(KEY)) ?? { models: [], priority: [] };
  const ids = new Set(doc.models.map((m) => m.id));
  const priority = doc.priority.filter((id) => ids.has(id));
  for (const m of doc.models) if (!priority.includes(m.id)) priority.push(m.id);
  return { models: doc.models, priority };
}

export async function writeModels(store: JsonStore, doc: ModelsDoc): Promise<void> {
  await store.put(KEY, doc);
}

/** Models in priority order. */
export function ordered(doc: ModelsDoc): ModelRecord[] {
  return doc.priority.map((id) => doc.models.find((m) => m.id === id)).filter((m): m is ModelRecord => Boolean(m));
}

export function toAdminModel(m: ModelRecord, doc: ModelsDoc): AdminModel {
  const firstEnabled = ordered(doc).find((x) => x.enabled);
  return {
    id: m.id,
    name: m.name,
    provider: m.provider,
    baseUrl: m.baseUrl,
    modelName: m.modelName,
    hasApiKey: Boolean(m.apiKeyEnc),
    apiKeyHint: m.apiKeyHint,
    headerNames: m.headerNames,
    temperature: m.temperature,
    maxTokens: m.maxTokens,
    timeoutSeconds: m.timeoutSeconds,
    jsonMode: m.jsonMode,
    enabled: m.enabled,
    lastTest: m.lastTest,
    isDefault: firstEnabled?.id === m.id,
  };
}

function requireKey(encryptionKey: string | undefined): string {
  if (!encryptionKey) {
    throw new AppError(
      "NOT_CONFIGURED",
      "ENCRYPTION_KEY isn't set on the server, so API keys and header values can't be stored securely. Add it as a secret and redeploy.",
    );
  }
  return encryptionKey;
}

async function readHeaders(m: Pick<ModelRecord, "headersEnc">, encryptionKey?: string): Promise<Record<string, string>> {
  if (!m.headersEnc) return {};
  return JSON.parse(await decryptSecret(m.headersEnc, requireKey(encryptionKey))) as Record<string, string>;
}

/** Build a record from form input, keeping saved secrets the admin didn't retype. */
export async function buildRecord(
  input: ModelInput,
  existing: ModelRecord | null,
  encryptionKey: string | undefined,
  now = Date.now(),
): Promise<ModelRecord> {
  const newKey = input.apiKey.trim();
  let apiKeyEnc = existing?.apiKeyEnc ?? null;
  let apiKeyHint = existing?.apiKeyHint ?? null;
  if (input.clearApiKey) {
    apiKeyEnc = null;
    apiKeyHint = null;
  }
  if (newKey) {
    apiKeyEnc = await encryptSecret(newKey, requireKey(encryptionKey));
    apiKeyHint = maskSecret(newKey);
  }

  // Headers: a blank value keeps the saved value for that header name.
  let headersEnc: string | null = null;
  const names: string[] = [];
  if (input.headers.length > 0) {
    const saved = existing ? await readHeaders(existing, encryptionKey) : {};
    const merged: Record<string, string> = {};
    for (const h of input.headers) {
      const value = h.value.trim() || saved[h.name] || "";
      if (!value) throw new AppError("INVALID_INPUT", `Enter a value for the "${h.name}" header.`);
      merged[h.name] = value;
      names.push(h.name);
    }
    headersEnc = await encryptSecret(JSON.stringify(merged), requireKey(encryptionKey));
  }

  const preset = getProvider(input.provider);
  if (preset?.needsApiKey && !apiKeyEnc) {
    throw new AppError("INVALID_INPUT", `${preset.label} needs an API key.`);
  }

  const connectionChanged =
    !existing || existing.baseUrl !== input.baseUrl || existing.modelName !== input.modelName || Boolean(newKey);

  return {
    id: existing?.id ?? crypto.randomUUID(),
    name: input.name,
    provider: input.provider,
    baseUrl: input.baseUrl.replace(/\/+$/, ""),
    modelName: input.modelName,
    apiKeyEnc,
    apiKeyHint,
    headersEnc,
    headerNames: names,
    temperature: input.temperature,
    maxTokens: input.maxTokens,
    timeoutSeconds: input.timeoutSeconds,
    jsonMode: input.jsonMode,
    enabled: input.enabled,
    lastTest: connectionChanged ? null : (existing?.lastTest ?? null),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

/**
 * Target for testing unsaved form values. Uses the typed key, or the saved key
 * of the model being edited, without storing anything.
 */
export async function targetFromInput(
  input: ModelInput,
  existing: ModelRecord | null,
  encryptionKey: string | undefined,
): Promise<LlmTarget> {
  const saved = existing ? await toTarget(existing, encryptionKey) : null;
  const apiKey = input.apiKey.trim() || (input.clearApiKey ? undefined : saved?.apiKey);
  const headers: Record<string, string> = {};
  for (const h of input.headers) {
    const value = h.value.trim() || saved?.headers?.[h.name];
    if (value) headers[h.name] = value;
  }
  return {
    id: existing?.id ?? "unsaved",
    provider: getProvider(input.provider)?.kind ?? "openai",
    baseUrl: input.baseUrl.replace(/\/+$/, ""),
    apiKey,
    headers,
    model: input.modelName,
    modelLabel: input.name,
    timeoutMs: input.timeoutSeconds * 1000,
    temperature: input.temperature,
    maxTokens: input.maxTokens,
    jsonMode: input.jsonMode,
  };
}

/** Decrypt a record into everything needed to call it. Server-side only. */
export async function toTarget(m: ModelRecord, encryptionKey: string | undefined): Promise<LlmTarget> {
  const preset = getProvider(m.provider);
  let apiKey: string | undefined;
  try {
    apiKey = m.apiKeyEnc ? await decryptSecret(m.apiKeyEnc, requireKey(encryptionKey)) : undefined;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError("MODEL_UNAVAILABLE", undefined, `Can't decrypt the API key for "${m.name}". Was ENCRYPTION_KEY changed? Re-enter the key in /admin.`);
  }
  return {
    id: m.id,
    provider: preset?.kind ?? "openai",
    baseUrl: m.baseUrl,
    apiKey,
    headers: await readHeaders(m, encryptionKey),
    model: m.modelName,
    modelLabel: m.name,
    timeoutMs: m.timeoutSeconds * 1000,
    temperature: m.temperature,
    maxTokens: m.maxTokens,
    jsonMode: m.jsonMode,
  };
}
