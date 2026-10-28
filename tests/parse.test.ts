import { describe, expect, it } from "vitest";
import { cleanModelText, extractJson, parseVariations } from "@/lib/parse";

const OBJ = '{"variations":[{"caption":"Hello {world}","hashtags":["#a"]}]}';
const FENCE = "```";

describe("cleanModelText", () => {
  it("removes <think> blocks", () => {
    expect(cleanModelText(`<think>let me {think}</think>\n${OBJ}`)).toBe(OBJ);
  });

  it("handles a missing opening <think> tag", () => {
    expect(cleanModelText(`reasoning {here}</think>${OBJ}`)).toBe(OBJ);
  });

  it("handles an unterminated <think> followed by an answer", () => {
    expect(cleanModelText(`<think>still thinking { ${OBJ}`)).toBe(OBJ);
  });

  it("unwraps code fences", () => {
    expect(cleanModelText(`Here you go:\n${FENCE}json\n${OBJ}\n${FENCE}\nEnjoy!`)).toBe(OBJ);
  });
});

describe("extractJson", () => {
  it("finds a balanced object ignoring braces in strings", () => {
    expect(extractJson(`Sure! ${OBJ} Hope that helps {`)).toBe(OBJ);
  });

  it("returns null when there is no JSON", () => {
    expect(extractJson("no json here")).toBeNull();
  });
});

describe("parseVariations", () => {
  it("parses the expected shape", () => {
    expect(parseVariations(OBJ)).toEqual([{ caption: "Hello {world}", hashtags: ["#a"] }]);
  });

  it("parses Qwen-style output with a think block and code fences", () => {
    const text = `<think>\nThe user wants captions.\n</think>\n\n${FENCE}json\n${OBJ}\n${FENCE}`;
    expect(parseVariations(text)).toHaveLength(1);
  });

  it("accepts a bare array and a single object", () => {
    expect(parseVariations('[{"caption":"A","hashtags":[]}]')).toEqual([{ caption: "A", hashtags: [] }]);
    expect(parseVariations('{"caption":"B","hashtags":["#x"]}')).toEqual([{ caption: "B", hashtags: ["#x"] }]);
  });

  it("repairs trailing commas and tolerates missing or string hashtags", () => {
    expect(parseVariations('{"variations":[{"caption":"A","hashtags":["#a",],},]}')).toEqual([
      { caption: "A", hashtags: ["#a"] },
    ]);
    expect(parseVariations('{"variations":[{"caption":"A"},{"caption":"B","hashtags":"#b #c"}]}')).toEqual([
      { caption: "A", hashtags: [] },
      { caption: "B", hashtags: ["#b #c"] },
    ]);
  });

  it("returns null for invalid output", () => {
    expect(parseVariations("I cannot help with that.")).toBeNull();
    expect(parseVariations('{"variations":[]}')).toBeNull();
    expect(parseVariations('{"variations":[{"caption":"   ","hashtags":[]}]}')).toBeNull();
    expect(parseVariations('{"foo": 1}')).toBeNull();
  });
});
