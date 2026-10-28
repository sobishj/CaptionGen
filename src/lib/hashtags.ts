/**
 * Normalise hashtags from model output: ensure a single leading "#", strip
 * whitespace and punctuation, and remove case-insensitive duplicates.
 * Accepts arrays or a single space/comma separated string.
 */
export function normalizeHashtags(input: readonly string[] | string, max?: number): string[] {
  const raw = typeof input === "string" ? input.split(/[\s,]+/) : input.flatMap((t) => t.split(/[\s,]+/));

  const seen = new Set<string>();
  const out: string[] = [];

  for (const item of raw) {
    // Keep letters, numbers and underscores from any script.
    const body = item.replace(/^#+/, "").replace(/[^\p{L}\p{N}_]/gu, "");
    if (!body) continue;
    const key = body.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(`#${body}`);
    if (max !== undefined && out.length >= max) break;
  }

  return out;
}

/**
 * Models sometimes append hashtags to the caption despite instructions.
 * Move any trailing hashtag-only lines out of the caption.
 */
export function splitTrailingHashtags(caption: string): { caption: string; hashtags: string[] } {
  const lines = caption.trimEnd().split("\n");
  const tags: string[] = [];
  while (lines.length > 1) {
    const last = lines[lines.length - 1]!.trim();
    if (last === "") {
      lines.pop();
      continue;
    }
    if (!/^(#[\p{L}\p{N}_]+[\s,]*)+$/u.test(last)) break;
    tags.unshift(...last.split(/[\s,]+/).filter(Boolean));
    lines.pop();
  }
  return { caption: lines.join("\n").trimEnd(), hashtags: tags };
}
