import type { ApiErrorBody, ErrorCode, GenerateRequest, GenerateResponse, PublicModel } from "../schemas";

export type ClientErrorCode = ErrorCode | "NETWORK";

export class ClientError extends Error {
  constructor(
    readonly code: ClientErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ClientError";
  }
}

/** Base URL of the backend API. Empty = same origin. Change to point the UI at a separate backend. */
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

export async function requestCaptions(input: GenerateRequest, signal?: AbortSignal): Promise<GenerateResponse> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ClientError("NETWORK", "We couldn't reach the server. Check your internet connection and try again.");
  }

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // handled below
  }

  if (!res.ok) {
    const e = (body as ApiErrorBody | null)?.error;
    throw new ClientError(e?.code ?? "INTERNAL", e?.message ?? "Something went wrong. Please try again.");
  }
  if (!body || !Array.isArray((body as GenerateResponse).variations)) {
    throw new ClientError("BAD_OUTPUT", "The server returned an unexpected response. Please try again.");
  }
  return body as GenerateResponse;
}

/** Models the admin made available. Returns [] on failure so the form still works. */
export async function fetchModels(): Promise<PublicModel[]> {
  try {
    const res = await fetch(`${API_BASE}/api/models`, { cache: "no-store" });
    if (!res.ok) return [];
    const data = (await res.json()) as { models?: PublicModel[] };
    return Array.isArray(data.models) ? data.models : [];
  } catch {
    return [];
  }
}
