import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Words the owner banned from user-visible copy (2026-09-23).
const FORBIDDEN =
  /\b(idempotency|tenant|seam|projection|canonical|hydrate|mapped|reaction|guard|policy|constraint|manifest|convex|builder|directory|record)\b/i;

function expectPlain(text: string) {
  expect(text).not.toMatch(FORBIDDEN);
  expect(text).not.toContain("CONVEX_FIELD_ENCRYPTION_KEY");
  expect(text).not.toContain("bun run");
}

describe("plain words on leftover culinary import constraint copy", () => {
  it("keeps leftover culinary import parsed-and-reviewed name constraint copy free of component jargon", () => {
    const manifest = readFileSync(
      "src/culinary/component-import.manifest",
      "utf8",
    );
    // Strip // comments the same way the culinary leftover tests do.
    const visible = manifest.replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
    // Old component wording is gone from the parsed/reviewed name refusals.
    expect(visible).not.toContain("Parsed component name is required");
    expect(visible).not.toContain("Reviewed component name is required");
    // The refusals now say recipe.
    expect(visible).toContain("Parsed recipe name is required");
    expect(visible).toContain("Reviewed recipe name is required");
    expectPlain("Parsed recipe name is required");
    expectPlain("Reviewed recipe name is required");
    // The generated mutation file carries the same recipe wording.
    const mutations = readFileSync("convex/mutations.ts", "utf8");
    expect(mutations).not.toContain("Parsed component name is required");
    expect(mutations).not.toContain("Reviewed component name is required");
    expect(mutations).toContain("Parsed recipe name is required");
    expect(mutations).toContain("Reviewed recipe name is required");
    // The finished-import refusal now says recipe.
    expect(visible).not.toContain(
      "Completed imports require a resulting component",
    );
    expect(visible).toContain("Completed imports require a resulting recipe");
    expectPlain("Completed imports require a resulting recipe");
    // The generated summary carries the same recipe wording.
    const summary = readFileSync("manifest-context-summary.json", "utf8");
    expect(summary).not.toContain(
      "Completed imports require a resulting component",
    );
    expect(summary).toContain("Completed imports require a resulting recipe");
    // Later leftovers keep their current wording.
    expect(visible).toContain("Source line is required");
    // Already-landed recipe leftovers stay.
    expect(visible).toContain("Kitchen staff may see recipe imports");
    expect(visible).toContain("Kitchen staff may update recipe imports");
    expect(visible).toContain("Kitchen staff may change recipe imports");
  });

  it("keeps leftover culinary import parsed line-count and yield copy free of parsed jargon", () => {
    const manifest = readFileSync(
      "src/culinary/component-import.manifest",
      "utf8",
    );
    // Strip // comments the same way the culinary leftover tests do.
    const visible = manifest.replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
    // The old parsed line-count and yield refusals are gone.
    expect(visible).not.toContain("Parsed line count cannot be negative");
    expect(visible).not.toContain(
      "Parsed yield quantity must be positive when present",
    );
    // The refusals now speak in plain catering words.
    expect(visible).toContain(
      "This recipe can't have a negative number of lines. Use zero or more.",
    );
    expect(visible).toContain(
      "When you enter a yield, it must be more than zero.",
    );
    expectPlain(
      "This recipe can't have a negative number of lines. Use zero or more.",
    );
    expectPlain("When you enter a yield, it must be more than zero.");
    // The generated mutation file carries the same plain wording.
    const mutations = readFileSync("convex/mutations.ts", "utf8");
    expect(mutations).not.toContain("Parsed line count cannot be negative");
    expect(mutations).not.toContain(
      "Parsed yield quantity must be positive when present",
    );
    expect(mutations).toContain(
      "This recipe can't have a negative number of lines. Use zero or more.",
    );
    expect(mutations).toContain(
      "When you enter a yield, it must be more than zero.",
    );
    // Already-landed copy stays.
    expect(visible).toContain("Parsed recipe name is required");
    expect(visible).toContain("Reviewed recipe name is required");
    expect(visible).toContain("Completed imports require a resulting recipe");
    // Later leftovers keep their current wording.
    expect(visible).toContain("Source line is required");
  });

  it("keeps leftover culinary import reviewed-yield and parsed-batch copy free of quantity jargon", () => {
    const manifest = readFileSync(
      "src/culinary/component-import.manifest",
      "utf8",
    );
    // Strip // comments the same way the culinary leftover tests do.
    const visible = manifest.replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
    // The old reviewed-yield and parsed-batch refusals are gone.
    expect(visible).not.toContain(
      "Reviewed yield quantity must be positive when present",
    );
    expect(visible).not.toContain(
      "Parsed batch multiplier must be positive when present",
    );
    // The refusals now speak in plain catering words.
    expect(visible).toContain(
      "When you enter a yield on this review, it must be more than zero.",
    );
    expect(visible).toContain(
      "When you enter a batch size, it must be more than zero.",
    );
    expectPlain(
      "When you enter a yield on this review, it must be more than zero.",
    );
    expectPlain("When you enter a batch size, it must be more than zero.");
    // The generated mutation file carries the same plain wording.
    const mutations = readFileSync("convex/mutations.ts", "utf8");
    expect(mutations).not.toContain(
      "Reviewed yield quantity must be positive when present",
    );
    expect(mutations).not.toContain(
      "Parsed batch multiplier must be positive when present",
    );
    expect(mutations).toContain(
      "When you enter a yield on this review, it must be more than zero.",
    );
    expect(mutations).toContain(
      "When you enter a batch size, it must be more than zero.",
    );
    // Already-landed copy stays.
    expect(visible).toContain("Parsed recipe name is required");
    expect(visible).toContain("Reviewed recipe name is required");
    expect(visible).toContain("Completed imports require a resulting recipe");
    expect(visible).toContain(
      "This recipe can't have a negative number of lines. Use zero or more.",
    );
    expect(visible).toContain(
      "When you enter a yield, it must be more than zero.",
    );
    // Later leftovers keep their current wording.
    expect(visible).toContain("Source line is required");
  });

  it("keeps leftover culinary import reviewed-batch and line-count copy free of multiplier jargon", () => {
    const manifest = readFileSync(
      "src/culinary/component-import.manifest",
      "utf8",
    );
    // Strip // comments the same way the culinary leftover tests do.
    const visible = manifest.replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
    // The old reviewed-batch and line-count refusals are gone.
    expect(visible).not.toContain(
      "Reviewed batch multiplier must be positive when present",
    );
    expect(visible).not.toContain("Import line counts cannot be negative");
    // The refusals now speak in plain catering words.
    expect(visible).toContain(
      "When you enter a batch size on this review, it must be more than zero.",
    );
    expect(visible).toContain(
      "This recipe's line counts can't be negative. Use zero or more.",
    );
    expectPlain(
      "When you enter a batch size on this review, it must be more than zero.",
    );
    expectPlain(
      "This recipe's line counts can't be negative. Use zero or more.",
    );
    // The generated mutation file carries the reviewed-batch wording.
    const mutations = readFileSync("convex/mutations.ts", "utf8");
    expect(mutations).not.toContain(
      "Reviewed batch multiplier must be positive when present",
    );
    expect(mutations).toContain(
      "When you enter a batch size on this review, it must be more than zero.",
    );
    // The line-count refusal projects into the summary, not the mutation file.
    const summary = readFileSync("manifest-context-summary.json", "utf8");
    expect(summary).not.toContain("Import line counts cannot be negative");
    expect(summary).toContain(
      "This recipe's line counts can't be negative. Use zero or more.",
    );
    // Already-landed copy stays.
    expect(visible).toContain("Parsed recipe name is required");
    expect(visible).toContain("Reviewed recipe name is required");
    expect(visible).toContain("Completed imports require a resulting recipe");
    expect(visible).toContain(
      "This recipe can't have a negative number of lines. Use zero or more.",
    );
    expect(visible).toContain(
      "When you enter a yield, it must be more than zero.",
    );
    expect(visible).toContain(
      "When you enter a yield on this review, it must be more than zero.",
    );
    expect(visible).toContain(
      "When you enter a batch size, it must be more than zero.",
    );
    // Later leftovers keep their current wording.
    expect(visible).toContain("Source line is required");
  });

  it("keeps leftover culinary import resolved-line-count copy free of parsed jargon", () => {
    const manifest = readFileSync(
      "src/culinary/component-import.manifest",
      "utf8",
    );
    // Strip // comments the same way the culinary leftover tests do.
    const visible = manifest.replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
    // The old resolved-line-count refusals are gone.
    expect(visible).not.toContain(
      "Resolved line count cannot exceed parsed line count",
    );
    expect(visible).not.toContain("Resolved line count cannot be negative");
    // The refusals now speak in plain catering words.
    expect(visible).toContain(
      "You can't finish more lines than this recipe has. Check the numbers.",
    );
    expect(visible).toContain(
      "You can't have a negative number of finished lines. Use zero or more.",
    );
    expectPlain(
      "You can't finish more lines than this recipe has. Check the numbers.",
    );
    expectPlain(
      "You can't have a negative number of finished lines. Use zero or more.",
    );
    // The generated mutation file carries the same plain wording.
    const mutations = readFileSync("convex/mutations.ts", "utf8");
    expect(mutations).not.toContain(
      "Resolved line count cannot exceed parsed line count",
    );
    expect(mutations).not.toContain("Resolved line count cannot be negative");
    expect(mutations).toContain(
      "You can't finish more lines than this recipe has. Check the numbers.",
    );
    expect(mutations).toContain(
      "You can't have a negative number of finished lines. Use zero or more.",
    );
    // The generated summary carries the same plain wording too.
    const summary = readFileSync("manifest-context-summary.json", "utf8");
    expect(summary).not.toContain(
      "Resolved line count cannot exceed parsed line count",
    );
    expect(summary).not.toContain("Resolved line count cannot be negative");
    expect(summary).toContain(
      "You can't finish more lines than this recipe has. Check the numbers.",
    );
    expect(summary).toContain(
      "You can't have a negative number of finished lines. Use zero or more.",
    );
    // Already-landed copy stays.
    expect(visible).toContain("Parsed recipe name is required");
    expect(visible).toContain("Reviewed recipe name is required");
    expect(visible).toContain("Completed imports require a resulting recipe");
    expect(visible).toContain(
      "This recipe can't have a negative number of lines. Use zero or more.",
    );
    expect(visible).toContain(
      "When you enter a yield, it must be more than zero.",
    );
    expect(visible).toContain(
      "When you enter a yield on this review, it must be more than zero.",
    );
    expect(visible).toContain(
      "When you enter a batch size, it must be more than zero.",
    );
    expect(visible).toContain(
      "This recipe's line counts can't be negative. Use zero or more.",
    );
    // Later leftovers keep their current wording.
    expect(visible).toContain("Source line is required");
  });

  it("keeps leftover culinary import source-present copy free of source-content jargon", () => {
    const manifest = readFileSync(
      "src/culinary/component-import.manifest",
      "utf8",
    );
    // Strip // comments the same way the culinary leftover tests do.
    const visible = manifest.replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
    // The old source-content refusals are gone.
    expect(visible).not.toContain("Import source content is required");
    // The refusals now speak in plain catering words.
    expect(visible).toContain("Paste recipe text before parsing.");
    expectPlain("Paste recipe text before parsing.");
    // The generated mutation file carries the same plain wording.
    const mutations = readFileSync("convex/mutations.ts", "utf8");
    expect(mutations).not.toContain("Import source content is required");
    // Both the command-level and entity-level refusals use the plain wording.
    expect(
      mutations.split("Paste recipe text before parsing.").length - 1,
    ).toBe(2);
    // Later leftovers keep their current wording.
    expect(visible).toContain("Source line is required");
  });

  it("keeps leftover culinary import stage-import match copy free of importId jargon", () => {
    const manifest = readFileSync(
      "src/culinary/component-import.manifest",
      "utf8",
    );
    // Strip // comments the same way the culinary leftover tests do.
    const visible = manifest.replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
    // The old stage-import match refusal is gone.
    expect(visible).not.toContain(
      "Stage importId must match the seeded import reference",
    );
    // The refusal now speaks in plain catering words.
    expect(visible).toContain(
      "This line is for a different recipe import. Pick the recipe import already on this line.",
    );
    expectPlain(
      "This line is for a different recipe import. Pick the recipe import already on this line.",
    );
    // The generated mutation file carries the same plain wording.
    const mutations = readFileSync("convex/mutations.ts", "utf8");
    expect(mutations).not.toContain(
      "Stage importId must match the seeded import reference",
    );
    expect(mutations).toContain(
      "This line is for a different recipe import. Pick the recipe import already on this line.",
    );
    // Later leftovers keep their current wording.
    expect(visible).toContain("Source line is required");
    expect(visible).toContain("Source line is required");
    expect(visible).toContain("Source order cannot be negative");
  });
});
