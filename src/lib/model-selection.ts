import { ordered, toTarget, type ModelsDoc } from "./admin/models";
import type { LlmTarget } from "./config";
import { AppError } from "./errors";
import type { PublicModel } from "./schemas";

/** How many models a single generation may try (selected + one fallback). */
export const MAX_ATTEMPTS = 2;

/** Models users can choose from, in priority order. Falls back to the built-in env model. */
export function publicModels(doc: ModelsDoc, builtin: LlmTarget | null): PublicModel[] {
  const enabled = ordered(doc).filter((m) => m.enabled);
  if (enabled.length === 0) {
    return builtin ? [{ id: builtin.id, label: builtin.modelLabel, isDefault: true }] : [];
  }
  return enabled.map((m, i) => ({ id: m.id, label: m.name, isDefault: i === 0 }));
}

/**
 * The models to try for a request: the selected (or default) model first,
 * then the next enabled model in the priority list as a fallback.
 */
export async function resolveTargets(
  doc: ModelsDoc,
  modelId: string | undefined,
  builtin: LlmTarget | null,
  encryptionKey: string | undefined,
): Promise<LlmTarget[]> {
  const enabled = ordered(doc).filter((m) => m.enabled);

  if (enabled.length === 0) {
    if (!builtin) throw new AppError("NOT_CONFIGURED", undefined, "No AI models enabled in /admin and no LLM_* env model");
    if (modelId && modelId !== builtin.id) throw new AppError("MODEL_NOT_FOUND");
    return [builtin];
  }

  let first = enabled[0]!;
  if (modelId) {
    const chosen = enabled.find((m) => m.id === modelId);
    if (!chosen) throw new AppError("MODEL_NOT_FOUND");
    first = chosen;
  }
  const fallbacks = enabled.filter((m) => m.id !== first.id).slice(0, MAX_ATTEMPTS - 1);
  const targets = [await toTarget(first, encryptionKey)];
  // A broken fallback (e.g. undecryptable key) must not block the selected model.
  for (const m of fallbacks) {
    try {
      targets.push(await toTarget(m, encryptionKey));
    } catch {
      // skip
    }
  }
  return targets;
}
