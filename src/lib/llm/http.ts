import { AppError } from "../errors";
import type { FetchLike } from "./types";

/** POST JSON with a timeout, mapping transport failures to AppErrors. */
export async function postJson(
  fetchFn: FetchLike,
  url: string,
  headers: Record<string, string>,
  body: unknown,
  timeoutMs: number,
  providerName: string,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetchFn(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    if (controller.signal.aborted) {
      throw new AppError(
        "TIMEOUT",
        undefined,
        `${new URL(url).origin} did not respond within ${Math.round(timeoutMs / 1000)}s. Check the server is running, or raise the timeout for slow local models.`,
      );
    }
    throw new AppError("MODEL_UNAVAILABLE", undefined, describeFailure(url, err));
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const detail = describeFailure(url, null, res.status, text);
    if (res.status === 429) {
      throw new AppError(
        "RATE_LIMITED",
        "The AI provider is busy right now. Please wait a few seconds and try again.",
        detail,
      );
    }
    throw new AppError("MODEL_UNAVAILABLE", undefined, detail);
  }

  try {
    return await res.json();
  } catch {
    throw new AppError("BAD_OUTPUT", undefined, `${providerName}: the server's response was not JSON. Check the base URL points at the API.`);
  }
}

export function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

/** The provider's own error message from a JSON error body (OpenAI, Anthropic and Gemini shapes), or the raw text. */
export function providerMessage(body: string): string {
  const text = body.trim();
  try {
    let data: unknown = JSON.parse(text);
    if (Array.isArray(data)) data = data[0];
    const d = data as { error?: { message?: unknown } | string; message?: unknown } | null;
    const msg = typeof d?.error === "string" ? d.error : (d?.error?.message ?? d?.message);
    if (typeof msg === "string" && msg.trim()) return msg.replace(/\s+/g, " ").trim().slice(0, 300);
  } catch {
    // not JSON
  }
  return text.replace(/\s+/g, " ").slice(0, 200);
}

/** Turn a transport/HTTP failure into a message an admin can act on. */
export function describeFailure(baseUrl: string, err: unknown, status?: number, body = ""): string {
  let origin = baseUrl;
  try {
    origin = new URL(baseUrl).origin;
  } catch {
    // keep as typed
  }
  const said = status ? providerMessage(body) : "";
  const quote = said ? ` The provider said: "${said}"` : "";

  if (/location is not supported|unsupported_country|not available in your (country|region)/i.test(said)) {
    return `This provider doesn't offer its API in the country the request comes from (HTTP ${status}). Use another provider, or reach the same model through one that serves your region, e.g. OpenRouter.${quote}`;
  }
  if (status === 401 || status === 403) return `The provider rejected the API key (HTTP ${status}). Check the key and its permissions.${quote}`;
  if (status === 404) {
    return `Not found (HTTP 404). Usually the model name is wrong or retired. Check the exact name in the provider's model list. If the name is right, check the base URL (OpenAI-compatible servers usually end in /v1).${quote}`;
  }
  if (status === 429) return `The provider is rate-limiting this key (HTTP 429). Try again shortly or check your plan's limits.${quote}`;
  if (status) return `The provider returned HTTP ${status}.${quote}`;
  if (err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError")) {
    return `${origin} did not respond in time. Check the server is running, or raise the timeout for slow local models.`;
  }
  return `Cannot reach ${origin} — check the server is running and reachable from the app.`;
}
