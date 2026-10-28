import { describe, expect, it } from "vitest";
import { normalizeHashtags, splitTrailingHashtags } from "@/lib/hashtags";

describe("normalizeHashtags", () => {
  it("adds a leading # and removes duplicates case-insensitively", () => {
    expect(normalizeHashtags(["candles", "#Candles", "##soy", "#SOY"])).toEqual(["#candles", "#soy"]);
  });

  it("strips spaces and punctuation, splitting on whitespace and commas", () => {
    expect(normalizeHashtags(["#small business", "#self-care!", "a,b"])).toEqual([
      "#small",
      "#business",
      "#selfcare",
      "#a",
      "#b",
    ]);
  });

  it("accepts a single string and keeps non-latin letters", () => {
    expect(normalizeHashtags("#café #日本 #")).toEqual(["#café", "#日本"]);
  });

  it("enforces a maximum", () => {
    expect(normalizeHashtags(["a", "b", "c", "d"], 2)).toEqual(["#a", "#b"]);
  });
});

describe("splitTrailingHashtags", () => {
  it("moves trailing hashtag lines out of the caption", () => {
    const r = splitTrailingHashtags("Great news!\nCome visit.\n\n#candles #soy\n#handmade");
    expect(r.caption).toBe("Great news!\nCome visit.");
    expect(r.hashtags).toEqual(["#candles", "#soy", "#handmade"]);
  });

  it("leaves inline hashtags and single-line captions alone", () => {
    expect(splitTrailingHashtags("Love our #candles today")).toEqual({ caption: "Love our #candles today", hashtags: [] });
    expect(splitTrailingHashtags("#justhashtag")).toEqual({ caption: "#justhashtag", hashtags: [] });
  });
});
