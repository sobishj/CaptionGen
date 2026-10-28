import type { Platform, Tone } from "./schemas";

export interface PlatformRules {
  label: string;
  /** Hard limit enforced by the platform. */
  maxLength: number;
  /** Length we warn above (recommended / ideal). */
  recommendedLength: number;
  hashtags: { min: number; max: number };
  emojisByDefault: boolean;
  style: string;
}

export const PLATFORM_RULES: Record<Platform, PlatformRules> = {
  instagram: {
    label: "Instagram",
    maxLength: 2200,
    recommendedLength: 2200,
    hashtags: { min: 15, max: 25 },
    emojisByDefault: true,
    style:
      "Start with a scroll-stopping hook in the first line. Keep sentences short and visual. Use line breaks between ideas. End with a clear call to action.",
  },
  linkedin: {
    label: "LinkedIn",
    maxLength: 3000,
    recommendedLength: 3000,
    hashtags: { min: 3, max: 5 },
    emojisByDefault: false,
    style:
      "Professional and insightful. Open with a strong first sentence, use short paragraphs separated by blank lines, share a takeaway or lesson, and finish with a question or call to action that invites discussion.",
  },
  facebook: {
    label: "Facebook",
    maxLength: 63206,
    recommendedLength: 500,
    hashtags: { min: 2, max: 5 },
    emojisByDefault: true,
    style:
      "Conversational and warm, like talking to a neighbour. Keep it concise (ideally under 500 characters) and encourage comments, shares or a visit.",
  },
};

export const TONE_LABELS: Record<Tone, string> = {
  professional: "Professional",
  friendly: "Friendly",
  promotional: "Promotional",
  informative: "Informative",
};

export const TONE_GUIDANCE: Record<Tone, string> = {
  professional: "Polished, credible and confident. Avoid slang.",
  friendly: "Warm, approachable and upbeat, as if speaking to a friend.",
  promotional: "Persuasive and exciting. Highlight benefits, urgency and a strong call to action.",
  informative: "Clear and educational. Share useful facts or tips and explain the value.",
};
