import { generateCaptions } from "./caption-service";
import type { LlmTarget } from "./config";
import { AppError } from "./errors";
import type { LlmProvider } from "./llm";
import { clientIp, type RateLimiter } from "./rate-limit";
import { GenerateRequestSchema, type ApiErrorBody, type ErrorCode } from "./schemas";

export interface GenerateHandlerDeps {
  /** Models to try in order: the selected/default model, then fallbacks. */
  resolveTargets: (modelId: string | undefined) => Promise<LlmTarget[]>;
  getProvider: (target: LlmTarget) => LlmProvider;
  getRateLimiter: () => RateLimiter;
  log?: (message: string) => void;
}

const MAX_BODY_BYTES = 16_000;

/** Failures where trying the fallback model is worthwhile. */
const FALLBACK_ON = new Set<ErrorCode>(["MODEL_UNAVAILABLE", "TIMEOUT", "BAD_OUTPUT", "RATE_LIMITED"]);

export function errorResponse(err: AppError): Response {
  const body: ApiErrorBody = { error: { code: err.code, message: err.message } };
  const headers: Record<string, string> = { "cache-control": "no-store" };
  if (err.code === "RATE_LIMITED") headers["retry-after"] = "60";
  return Response.json(body, { status: err.status, headers });
}

export function toAppError(err: unknown): AppError {
  return err instanceof AppError
    ? err
    : new AppError("INTERNAL", undefined, err instanceof Error ? err.message : String(err));
}

/**
 * POST /api/generate built on the standard Fetch API Request/Response,
 * so it can be mounted in Next.js, Hono, a plain Worker or any other runtime.
 */
export function createGenerateHandler(deps: GenerateHandlerDeps) {
  const log = deps.log ?? ((m: string) => console.error(m));

  return async function handle(req: Request): Promise<Response> {
    const started = Date.now();
    try {
      if (!deps.getRateLimiter().check(clientIp(req))) throw new AppError("RATE_LIMITED");

      const raw = await req.text();
      if (raw.length > MAX_BODY_BYTES) throw new AppError("INVALID_INPUT", "Your request is too large.");

      let json: unknown;
      try {
        json = JSON.parse(raw);
      } catch {
        throw new AppError("INVALID_INPUT", "Invalid request body.");
      }

      const parsed = GenerateRequestSchema.safeParse(json);
      if (!parsed.success) {
        throw new AppError("INVALID_INPUT", parsed.error.issues[0]?.message ?? undefined);
      }

      const targets = await deps.resolveTargets(parsed.data.modelId);
      for (let i = 0; i < targets.length; i++) {
        const target = targets[i]!;
        try {
          const result = await generateCaptions(parsed.data, { provider: deps.getProvider(target), llm: target });
          if (i > 0) result.fallbackFrom = targets[0]!.modelLabel;
          return Response.json(result, { headers: { "cache-control": "no-store" } });
        } catch (err) {
          const next = targets[i + 1];
          if (!(err instanceof AppError) || !FALLBACK_ON.has(err.code) || !next) throw err;
          log(`[generate] ${target.modelLabel} failed (${err.code}: ${err.detail ?? err.message}); trying ${next.modelLabel}`);
        }
      }
      throw new AppError("NOT_CONFIGURED", undefined, "no models to try");
    } catch (err) {
      const appErr = toAppError(err);
      if (appErr.code !== "INVALID_INPUT" && appErr.code !== "RATE_LIMITED" && appErr.code !== "MODEL_NOT_FOUND") {
        log(`[generate] ${appErr.code} after ${Date.now() - started}ms: ${appErr.detail ?? appErr.message}`);
      }
      return errorResponse(appErr);
    }
  };
}
