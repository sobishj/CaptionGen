import { describe, expect, it } from "vitest";
import { buildMessages } from "@/lib/prompt";
import { VALID_INPUT } from "./helpers";

const userText = (input: Parameters<typeof buildMessages>[0]) => buildMessages(input)[1]!.content;

describe("buildMessages", () => {
  it("returns a system and user message demanding JSON", () => {
    const msgs = buildMessages(VALID_INPUT);
    expect(msgs.map((m) => m.role)).toEqual(["system", "user"]);
    expect(msgs[0]!.content).toMatch(/valid JSON/);
    expect(msgs[1]!.content).toContain('"variations"');
    expect(msgs[1]!.content).toContain(VALID_INPUT.description);
  });

  it("applies Instagram rules: hook, 15-25 hashtags", () => {
    const t = userText(VALID_INPUT);
    expect(t).toMatch(/hook in the first line/);
    expect(t).toMatch(/between 15 and 25/);
  });

  it("applies LinkedIn rules: professional, line breaks, 3-5 hashtags", () => {
    const t = userText({ ...VALID_INPUT, platform: "linkedin", tone: "professional" });
    expect(t).toMatch(/Professional/);
    expect(t).toMatch(/blank lines/);
    expect(t).toMatch(/between 3 and 5/);
  });

  it("applies Facebook rules: conversational, 2-5 hashtags", () => {
    const t = userText({ ...VALID_INPUT, platform: "facebook" });
    expect(t).toMatch(/Conversational/);
    expect(t).toMatch(/between 2 and 5/);
  });

  it.each([
    ["professional", /Polished/],
    ["friendly", /Warm/],
    ["promotional", /Persuasive/],
    ["informative", /educational/],
  ] as const)("includes %s tone guidance", (tone, re) => {
    expect(userText({ ...VALID_INPUT, tone })).toMatch(re);
  });

  it("respects the emoji toggle", () => {
    expect(userText({ ...VALID_INPUT, emojis: true })).toMatch(/use relevant emojis/);
    expect(userText({ ...VALID_INPUT, emojis: false })).toMatch(/do NOT use any emojis/);
  });

  it("asks for the requested count and lists captions to avoid", () => {
    const t = userText({ ...VALID_INPUT, count: 1, avoid: ["Old caption here"] });
    expect(t).toMatch(/exactly 1 item\./);
    expect(t).toContain("Old caption here");
  });
});
