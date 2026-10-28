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

/** Turn a transport/HTTP failure into a message an admin can act on. */
export function describeFailure(baseUrl: string, err: unknown, status?: number, body = ""): string {
  let origin = baseUrl;
  try {
    origin = new URL(baseUrl).origin;
  } catch {
    // keep as typed
  }
  if (status === 401 || status === 403) return `The provider rejected the API key (HTTP ${status}). Check the key and its permissions.`;
  if (status === 404) return `Nothing found at ${baseUrl} (HTTP 404). Check the base URL — OpenAI-compatible servers usually end in /v1.`;
  if (status === 429) return "The provider is rate-limiting this key (HTTP 429). Try again shortly or check your plan's limits.";
  if (status) {
    const detail = body.replace(/\s+/g, " ").trim().slice(0, 200);
    return `The provider returned HTTP ${status}${detail ? `: ${detail}` : ""}.`;
  }
  if (err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError")) {
    return `${origin} did not respond in time. Check the server is running, or raise the timeout for slow local models.`;
  }
  return `Cannot reach ${origin} — check the server is running and reachable from the app.`;
}
