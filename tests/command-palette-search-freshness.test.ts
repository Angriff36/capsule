import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  freshSearchHits,
  isSearchPending,
} from "../src/features/search/useNaturalLanguageSearch";

const harborview = [
  {
    kind: "client",
    id: "c1",
    label: "E2E-0728 Harborview Tech",
    hint: "CLIENT",
    path: "/clients/c1",
    score: 1,
  },
  {
    kind: "proposal",
    id: "p1",
    label: "E2E-0728 Harborview Tech catering proposal",
    hint: "PROPOSAL",
    path: "/clients/proposals/p1",
    score: 1,
  },
  {
    kind: "lead",
    id: "l1",
    label: "E2E-0728 Harborview Tech",
    hint: "LEAD",
    path: "/clients/l1",
    score: 1,
  },
] as const;

describe("Ctrl-K search is not one keystroke behind", () => {
  it("does not paint Harborview hits under a Northside query", () => {
    expect(freshSearchHits("Northside", harborview)).toEqual([]);
    expect(freshSearchHits("Harborview", harborview)).toHaveLength(3);
  });

  it("treats an in-flight debounce as pending so the palette says Searching… not No matches.", () => {
    // Type Harborview quickly: live is the full term, debounce still "".
    expect(
      isSearchPending({
        enabled: true,
        liveQuery: "Harborview",
        debouncedQuery: "",
        hitsPending: true,
      }),
    ).toBe(true);
    expect(freshSearchHits("Harborview", [])).toEqual([]);
  });

  it("useNaturalLanguageSearch paints freshSearchHits from the live rawQuery", () => {
    // Harborview cached hits under a typed Northside must drop immediately.
    // Passing debounced/trimmed as the first arg keeps the suite green while
    // the palette still paints one keystroke behind.
    const hook = readFileSync(
      "src/features/search/useNaturalLanguageSearch.ts",
      "utf8",
    );
    expect(hook).toContain("freshSearchHits(rawQuery,");
    expect(hook).not.toContain("freshSearchHits(debounced");
    expect(hook).not.toContain("freshSearchHits(trimmed");
  });

  it("is pending while live query and debounce disagree, even with cached hits", () => {
    // Northside with Harborview still on screen: hitsPending is false.
    // Pending must be the live !== debounce disjunct, or the palette flashes
    // No matches. and this suite still passes.
    expect(
      isSearchPending({
        enabled: true,
        liveQuery: "Northside",
        debouncedQuery: "Harborview",
        hitsPending: false,
      }),
    ).toBe(true);
  });

  it("CommandPalette withholds No matches. while search is pending", () => {
    const page = readFileSync("src/app/shell/CommandPalette.tsx", "utf8");
    expect(page).toContain("No matches.");
    expect(page).toContain("Searching…");
    expect(page).toContain("!searchLoading");
    expect(page).toContain("useNaturalLanguageSearch");
  });
});
