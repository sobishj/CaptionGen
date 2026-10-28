import type { AppConfig } from "./config";
import { AppError } from "./errors";
import { normalizeHashtags, splitTrailingHashtags } from "./hashtags";
import type { LlmProvider } from "./llm";
import { parseVariations } from "./parse";
import { PLATFORM_RULES } from "./platforms";
import { buildMessages, JSON_REMINDER } from "./prompt";
import type { GenerateRequest, GenerateResponse, Variation } from "./schemas";

export interface CaptionServiceDeps {
  provider: LlmProvider;
  llm: NonNullable<AppConfig["llm"]>;
  newId?: () => string;
}

const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}]/gu;

function tidy(v: Variation, input: GenerateRequest): Variation {
  const split = splitTrailingHashtags(v.caption);
  let caption = split.caption;
  if (!input.emojis) caption = caption.replace(EMOJI, "").replace(/[ \t]{2,}/g, " ").replace(/[ \t]+$/gm, "");
  const hashtags = normalizeHashtags([...v.hashtags, ...split.hashtags], PLATFORM_RULES[input.platform].hashtags.max);
  return { caption: caption.trim(), hashtags };
}

/**
 * Generate caption variations. Pure business logic: no HTTP, framework or
 * storage concerns, so it can be reused from any backend.
 */
export async function generateCaptions(input: GenerateRequest, deps: CaptionServiceDeps): Promise<GenerateResponse> {
  const { provider, llm } = deps;
  const newId = deps.newId ?? (() => crypto.randomUUID());
  const messages = buildMessages(input);

  const call = (msgs: typeof messages) =>
    provider.generate({
      messages: msgs,
      model: llm.model,
      temperature: llm.temperature,
      maxTokens: llm.maxTokens,
      jsonMode: llm.jsonMode,
      timeoutMs: llm.timeoutMs,
    });

  const first = await call(messages);
  let variations = parseVariations(first.text);

  // One retry with an explicit reminder — enough for small models that add chatter.
  if (!variations) {
    const second = await call([
      ...messages,
      { role: "assistant", content: first.text.slice(0, 4000) },
      { role: "user", content: JSON_REMINDER },
    ]);
    variations = parseVariations(second.text);
  }

  if (!variations) {
    throw new AppError("BAD_OUTPUT", undefined, `${provider.name}: unparseable output after retry`);
  }

  const cleaned = variations
    .map((v) => tidy(v, input))
    .filter((v) => v.caption.length > 0)
    .slice(0, input.count);
  if (cleaned.length === 0) throw new AppError("BAD_OUTPUT", undefined, "all variations empty after cleanup");

  return {
    model: llm.modelLabel,
    variations: cleaned.map((v) => ({ ...v, id: newId(), model: llm.modelLabel })),
  };
}
