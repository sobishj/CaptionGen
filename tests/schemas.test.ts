import { describe, expect, it } from "vitest";
import { GenerateRequestSchema, LlmOutputSchema } from "@/lib/schemas";
import { VALID_INPUT } from "./helpers";

describe("GenerateRequestSchema", () => {
  it("accepts valid input and trims the description", () => {
    const r = GenerateRequestSchema.parse({ ...VALID_INPUT, description: "  " + VALID_INPUT.description + "  " });
    expect(r.description).toBe(VALID_INPUT.description);
  });

  it.each([
    ["too short description", { description: "short" }],
    ["too long description", { description: "x".repeat(501) }],
    ["unknown platform", { platform: "tiktok" }],
    ["unknown tone", { tone: "sarcastic" }],
    ["count too high", { count: 6 }],
    ["count not integer", { count: 3.5 }],
    ["emojis not boolean", { emojis: "yes" }],
  ])("rejects %s", (_, patch) => {
    expect(GenerateRequestSchema.safeParse({ ...VALID_INPUT, ...patch }).success).toBe(false);
  });

  it("gives a friendly message for short descriptions", () => {
    const r = GenerateRequestSchema.safeParse({ ...VALID_INPUT, description: "hi" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toMatch(/at least 10 characters/);
  });

  it("allows an optional avoid list", () => {
    expect(GenerateRequestSchema.safeParse({ ...VALID_INPUT, count: 1, avoid: ["old caption"] }).success).toBe(true);
  });
});

describe("LlmOutputSchema", () => {
  it("requires at least one variation", () => {
    expect(LlmOutputSchema.safeParse({ variations: [] }).success).toBe(false);
    expect(LlmOutputSchema.safeParse({ variations: [{ caption: "a", hashtags: [] }] }).success).toBe(true);
  });
});
