import { z } from "zod";

/**
 * Shared request/response contracts. Used by both the browser and the server,
 * so the API shape is defined in exactly one place.
 */

export const PLATFORMS = ["instagram", "linkedin", "facebook"] as const;
export const TONES = ["professional", "friendly", "promotional", "informative"] as const;

export const DESCRIPTION_MIN = 10;
export const DESCRIPTION_MAX = 500;
export const COUNT_MIN = 3;
export const COUNT_MAX = 5;

export const PlatformSchema = z.enum(PLATFORMS);
export const ToneSchema = z.enum(TONES);

export type Platform = z.infer<typeof PlatformSchema>;
export type Tone = z.infer<typeof ToneSchema>;

export const GenerateRequestSchema = z.object({
  description: z
    .string()
    .trim()
    .min(DESCRIPTION_MIN, `Please describe your topic in at least ${DESCRIPTION_MIN} characters.`)
    .max(DESCRIPTION_MAX, `Please keep the description under ${DESCRIPTION_MAX} characters.`),
  platform: PlatformSchema,
  tone: ToneSchema,
  /** Number of variations. 1 is used internally for "Regenerate" on a single card. */
  count: z.number().int().min(1).max(COUNT_MAX),
  emojis: z.boolean(),
  /** Captions the user already has; the model is asked to write something different. */
  avoid: z.array(z.string().max(3000)).max(COUNT_MAX).optional(),
  /** Model chosen by the user; omitted = the admin's default model. */
  modelId: z.string().max(100).optional(),
});

export type GenerateRequest = z.infer<typeof GenerateRequestSchema>;

export const VariationSchema = z.object({
  caption: z.string().min(1),
  hashtags: z.array(z.string()),
});

export type Variation = z.infer<typeof VariationSchema>;

/** What we expect the LLM to return. */
export const LlmOutputSchema = z.object({
  variations: z.array(VariationSchema).min(1),
});

export interface GeneratedVariation extends Variation {
  id: string;
  model: string;
}

export interface GenerateResponse {
  variations: GeneratedVariation[];
  model: string;
  /** Set when the chosen model failed and a fallback model answered instead. */
  fallbackFrom?: string;
}

/** A model users can pick on the dashboard. No provider details or keys. */
export interface PublicModel {
  id: string;
  label: string;
  isDefault: boolean;
}

export const ERROR_CODES = [
  "INVALID_INPUT",
  "RATE_LIMITED",
  "MODEL_UNAVAILABLE",
  "MODEL_NOT_FOUND",
  "TIMEOUT",
  "BAD_OUTPUT",
  "NOT_CONFIGURED",
  "INTERNAL",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ApiErrorBody {
  error: { code: ErrorCode; message: string };
}
