import { describe, expect, it } from "vitest";
import { CulinaryCanonicalMatcher } from "../../../src/features/kitchen/CulinaryCanonicalMatcher";

describe("CulinaryCanonicalMatcher", () => {
  const matcher = new CulinaryCanonicalMatcher();
  const records = [
    {
      _id: "a",
      name: "Macaroni Salad",
      editionNumber: 1,
      status: "active",
    },
    {
      _id: "b",
      name: "Macaroni Salad",
      editionNumber: 2,
      canonicalDishId: "a",
      status: "active",
    },
    {
      _id: "c",
      name: "Lemonade",
      mergedIntoDishId: "a",
      status: "retired",
    },
  ];

  it("finds name matches and prefers non-merged rows", () => {
    const matches = matcher.findNameMatches(records, "macaroni");
    expect(matches.map((row) => row._id)).toEqual(["a", "b"]);
  });

  it("detects likely duplicates by exact normalized name", () => {
    expect(matcher.likelyDuplicate(records, "  MACARONI salad ")?._id).toBe(
      "a",
    );
    expect(matcher.likelyDuplicate(records, "Mac")).toBeNull();
  });

  it("resolves canonical id from edition rows", () => {
    expect(matcher.resolveCanonicalId(records[1]!)).toBe("a");
    expect(matcher.resolveCanonicalId(records[0]!)).toBe("a");
  });
});
