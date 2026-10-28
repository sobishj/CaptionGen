import { LlmOutputSchema, type Variation } from "./schemas";

/**
 * Remove reasoning blocks (<think>…</think>) emitted by some models
 * and unwrap a markdown code fence if present.
 */
export function cleanModelText(text: string): string {
  let t = text.replace(/<think>[\s\S]*?<\/think>/gi, "");

  // Some chat templates omit the opening tag: keep only what follows the last </think>.
  const closeIdx = t.toLowerCase().lastIndexOf("</think>");
  if (closeIdx !== -1) t = t.slice(closeIdx + "</think>".length);

  // Unterminated <think> (output cut off mid-reasoning): keep any JSON answer after it.
  const openIdx = t.search(/<think>/i);
  if (openIdx !== -1) {
    const answer = t.indexOf('{"variations"', openIdx);
    t = t.slice(0, openIdx) + (answer !== -1 ? t.slice(answer) : "");
  }

  const fence = t.match(/```(?:json|JSON)?\s*([\s\S]*?)```/);
  if (fence?.[1]) t = fence[1];
  return t.trim();
}

/** Extract the first balanced top-level JSON object or array from a string. */
export function extractJson(text: string): string | null {
  const start = text.search(/[{[]/);
  if (start === -1) return null;

  const open = text[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/** Fix common small-model JSON mistakes: trailing commas and smart quotes. */
function repairJson(json: string): string {
  return json.replace(/,\s*([}\]])/g, "$1").replace(/[“”]/g, '"');
}

/**
 * Parse model output into variations. Accepts the expected
 * {"variations":[...]} object, a bare array, or a single variation object.
 * Returns null when the output can't be understood.
 */
export function parseVariations(text: string): Variation[] | null {
  const json = extractJson(cleanModelText(text));
  if (!json) return null;

  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    try {
      data = JSON.parse(repairJson(json));
    } catch {
      return null;
    }
  }

  if (Array.isArray(data)) data = { variations: data };
  else if (data && typeof data === "object" && !("variations" in data) && "caption" in data) {
    data = { variations: [data] };
  }

  // Some models return hashtags as a single string.
  if (data && typeof data === "object" && "variations" in data && Array.isArray(data.variations)) {
    data = {
      variations: data.variations.map((v: unknown) =>
        v && typeof v === "object" && "hashtags" in v && typeof v.hashtags === "string"
          ? { ...v, hashtags: [v.hashtags] }
          : v && typeof v === "object" && !("hashtags" in v)
            ? { ...v, hashtags: [] }
            : v,
      ),
    };
  }

  const result = LlmOutputSchema.safeParse(data);
  if (!result.success) return null;

  const variations = result.data.variations
    .map((v) => ({ caption: v.caption.trim(), hashtags: v.hashtags }))
    .filter((v) => v.caption.length > 0);
  return variations.length > 0 ? variations : null;
}
