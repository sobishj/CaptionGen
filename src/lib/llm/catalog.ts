import { ANTHROPIC_VERSION } from "./anthropic";
import { describeFailure, trimTrailingSlash } from "./http";
import type { FetchLike } from "./types";

export interface CatalogTarget {
  provider: "openai" | "anthropic";
  baseUrl: string;
  apiKey?: string;
  headers?: Record<string, string>;
}

export type CatalogResult = { ok: true; models: string[] } | { ok: false; error: string };

/** List the model IDs a provider offers (GET /models). */
export async function listModels(
  target: CatalogTarget,
  { fetch: fetchFn = fetch, timeoutMs = 15_000 }: { fetch?: FetchLike; timeoutMs?: number } = {},
): Promise<CatalogResult> {
  const base = trimTrailingSlash(target.baseUrl);
  const isAnthropic = target.provider === "anthropic";
  const url = isAnthropic ? `${base.replace(/\/v1$/, "")}/v1/models?limit=100` : `${base}/models`;

  const headers: Record<string, string> = { ...target.headers };
  if (isAnthropic) {
    headers["x-api-key"] = target.apiKey ?? "";
    headers["anthropic-version"] = ANTHROPIC_VERSION;
  } else if (target.apiKey) {
    headers.authorization = `Bearer ${target.apiKey}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchFn(url, { headers, signal: controller.signal });
    if (!res.ok) return { ok: false, error: describeFailure(target.baseUrl, null, res.status, await res.text().catch(() => "")) };
    const data = (await res.json().catch(() => null)) as { data?: unknown; models?: unknown } | null;
    const list = Array.isArray(data?.data) ? data.data : Array.isArray(data?.models) ? data.models : [];
    const ids = list
      .map((m: unknown) => (m && typeof m === "object" ? ((m as { id?: unknown; name?: unknown }).id ?? (m as { name?: unknown }).name) : m))
      .filter((id): id is string => typeof id === "string" && id.length > 0)
      .map((id) => id.replace(/^models\//, ""));
    return { ok: true, models: [...new Set(ids)].sort((a, b) => a.localeCompare(b)) };
  } catch (err) {
    return { ok: false, error: describeFailure(target.baseUrl, controller.signal.aborted ? Object.assign(new Error("timeout"), { name: "AbortError" }) : err) };
  } finally {
    clearTimeout(timer);
  }
}
