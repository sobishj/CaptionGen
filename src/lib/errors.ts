import type { ErrorCode } from "./schemas";

const DEFAULTS: Record<ErrorCode, { status: number; message: string }> = {
  INVALID_INPUT: { status: 400, message: "Please check your input and try again." },
  RATE_LIMITED: {
    status: 429,
    message: "You're generating very quickly. Please wait a moment and try again.",
  },
  MODEL_UNAVAILABLE: {
    status: 503,
    message: "The AI model is temporarily unavailable. Please try again in a moment.",
  },
  MODEL_NOT_FOUND: {
    status: 400,
    message: "The selected AI model is no longer available. Please choose another model and try again.",
  },
  TIMEOUT: { status: 504, message: "The AI model took too long to respond. Please try again." },
  BAD_OUTPUT: {
    status: 502,
    message: "The AI returned an unexpected response. Please try again.",
  },
  NOT_CONFIGURED: {
    status: 503,
    message: "The caption generator isn't configured yet. Please contact the site owner.",
  },
  INTERNAL: { status: 500, message: "Something went wrong on our side. Please try again." },
};

/**
 * An error that is safe to show to end users. Provider details belong in
 * `detail` (server logs only) and are never sent to the browser.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly detail?: string;

  constructor(code: ErrorCode, message?: string, detail?: string) {
    super(message ?? DEFAULTS[code].message);
    this.name = "AppError";
    this.code = code;
    this.status = DEFAULTS[code].status;
    this.detail = detail;
  }
}
