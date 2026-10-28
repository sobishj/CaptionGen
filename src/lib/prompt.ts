import { PLATFORM_RULES, TONE_GUIDANCE } from "./platforms";
import type { GenerateRequest } from "./schemas";
import type { ChatMessage } from "./llm/types";

export const JSON_REMINDER =
  'Your previous reply was not valid JSON. Reply with ONLY the JSON object in the format {"variations":[{"caption":"...","hashtags":["#..."]}]} and nothing else.';

export function buildMessages(input: GenerateRequest): ChatMessage[] {
  const rules = PLATFORM_RULES[input.platform];
  const { min, max } = rules.hashtags;

  const system = [
    "You are an expert social media copywriter for small businesses and content creators.",
    "You write ready-to-post captions and relevant hashtags.",
    "You always reply with a single valid JSON object and no other text, no markdown and no code fences.",
  ].join(" ");

  const lines = [
    `Write ${input.count} distinct ${rules.label} caption variation${input.count === 1 ? "" : "s"} for the following:`,
    `"""${input.description}"""`,
    "",
    `Platform style (${rules.label}): ${rules.style}`,
    `Tone: ${TONE_GUIDANCE[input.tone]}`,
    input.emojis
      ? "Emojis: use relevant emojis naturally to add personality."
      : "Emojis: do NOT use any emojis.",
    `Hashtags: provide between ${min} and ${max} relevant hashtags per variation in the "hashtags" array. Do not put hashtags inside the caption text.`,
    `Length: each caption must be under ${rules.recommendedLength} characters.`,
    "Each variation must take a different angle or hook. Do not invent prices, dates or facts that were not given.",
  ];

  if (input.avoid && input.avoid.length > 0) {
    lines.push(
      "",
      "The user already has these captions. Write something clearly different from them:",
      ...input.avoid.map((c, i) => `${i + 1}. ${c.slice(0, 600)}`),
    );
  }

  lines.push(
    "",
    "Respond with ONLY this JSON shape:",
    '{"variations":[{"caption":"caption text","hashtags":["#tag1","#tag2"]}]}',
    `The "variations" array must contain exactly ${input.count} item${input.count === 1 ? "" : "s"}.`,
  );

  return [
    { role: "system", content: system },
    { role: "user", content: lines.join("\n") },
  ];
}
