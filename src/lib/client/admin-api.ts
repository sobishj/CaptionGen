import type { ApiErrorBody } from "../schemas";

export class AdminApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "AdminApiError";
  }
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

/** JSON request to /api/admin/*. Throws AdminApiError with a readable message. */
export async function adminApi<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const method = options.method ?? (options.body === undefined ? "GET" : "POST");
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/admin/${path}`, {
      method,
      headers: options.body === undefined ? undefined : { "content-type": "application/json" },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      credentials: "same-origin",
    });
  } catch {
    throw new AdminApiError("Can't reach the server. Check your connection and try again.", 0);
  }
  const data = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) {
    const message = (data as ApiErrorBody | null)?.error?.message ?? `Request failed (HTTP ${res.status}).`;
    throw new AdminApiError(message, res.status);
  }
  return data as T;
}
