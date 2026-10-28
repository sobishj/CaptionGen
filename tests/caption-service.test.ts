import { describe, expect, it } from "vitest";
import { generateCaptions } from "@/lib/caption-service";
import { AppError } from "@/lib/errors";
import { LLM, scriptedProvider, VALID_INPUT, variationsJson } from "./helpers";

let n = 0;
const newId = () => `id-${++n}`;

describe("generateCaptions", () => {
  it("returns normalised variations tagged with the model label", async () => {
    const { provider, calls } = scriptedProvider(variationsJson(3, ["candles", "#Candles", "soy"]));
    const r = await generateCaptions(VALID_INPUT, { provider, llm: LLM, newId });

    expect(r.model).toBe("Test Model");
    expect(r.variations).toHaveLength(3);
    expect(r.variations[0]).toMatchObject({ caption: "Caption 1", hashtags: ["#candles", "#soy"], model: "Test Model" });
    expect(calls[0]).toMatchObject({ model: "test-model", jsonMode: true, timeoutMs: 1000 });
  });

  it("retries once with a JSON reminder when the first output is invalid", async () => {
    const { provider, calls } = scriptedProvider("Sure! Here are captions...", variationsJson(3));
    const r = await generateCaptions(VALID_INPUT, { provider, llm: LLM, newId });
    expect(r.variations).toHaveLength(3);
    expect(calls).toHaveLength(2);
    expect(calls[1]!.messages.at(-1)!.content).toMatch(/not valid JSON/);
  });

  it("throws BAD_OUTPUT when both attempts fail", async () => {
    const { provider } = scriptedProvider("nope", "still nope");
    const err = await generateCaptions(VALID_INPUT, { provider, llm: LLM }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe("BAD_OUTPUT");
  });

  it("trims extra variations and caps hashtags per platform", async () => {
    const tags = Array.from({ length: 10 }, (_, i) => `#t${i}`);
    const { provider } = scriptedProvider(variationsJson(5, tags));
    const r = await generateCaptions({ ...VALID_INPUT, platform: "linkedin", count: 3 }, { provider, llm: LLM });
    expect(r.variations).toHaveLength(3);
    expect(r.variations[0]!.hashtags).toHaveLength(5);
  });

  it("strips emojis when disabled and moves trailing hashtags out of the caption", async () => {
    const text = JSON.stringify({
      variations: [{ caption: "New candles 🕯️✨ are here!\n\n#candles #soy", hashtags: ["#handmade"] }],
    });
    const { provider } = scriptedProvider(text);
    const r = await generateCaptions({ ...VALID_INPUT, count: 1, emojis: false }, { provider, llm: LLM });
    expect(r.variations[0]!.caption).toBe("New candles are here!");
    expect(r.variations[0]!.hashtags).toEqual(["#handmade", "#candles", "#soy"]);
  });

  it("propagates provider errors", async () => {
    const { provider } = scriptedProvider(new AppError("TIMEOUT"));
    await expect(generateCaptions(VALID_INPUT, { provider, llm: LLM })).rejects.toMatchObject({ code: "TIMEOUT" });
  });
});
