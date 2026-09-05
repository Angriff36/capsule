// Reference examples for llm-review.ts — Ralph learns the pattern from these.
//
// Both text and screenshots work as `artifact`; the fixture detects which by file
// extension. LLM reviews are non-deterministic, so these gate real behavior and the
// loop iterates until pass. Written for Vitest (`test`/`expect`), but the shape is
// framework-agnostic — swap in Jest/node:test as your project uses.
//
// These call a live model and cost tokens: run them in the build loop as backpressure
// for subjective criteria, not on every unit-test run. They need ANTHROPIC_API_KEY.

import { test, expect } from "vitest";
import { createReview, loadActiveCriteria } from "@/lib/llm-review";

// Stand-in for whatever copy your app generates — the example only needs a
// string artifact.
function generateWelcomeMessage(): string {
  return "Welcome back — your workspace is ready.";
}

// Example 1: Text evaluation
test("welcome message tone", async () => {
  const message = generateWelcomeMessage();
  const result = await createReview({
    criteria:
      "Message uses warm, conversational tone appropriate for design professionals " +
      "while clearly conveying value proposition",
    artifact: message, // Text content
  });
  expect(result.pass, result.feedback).toBe(true);
});

// Example 2: Vision evaluation (screenshot path)
test("dashboard visual hierarchy", async () => {
  // Capture ./tmp/dashboard.png with a browser tool first — this repo has no
  // Playwright `page` global in vitest.
  const result = await createReview({
    criteria:
      "Layout demonstrates clear visual hierarchy with obvious primary action",
    artifact: "./tmp/dashboard.png", // Screenshot path → routed as vision input
  });
  expect(result.pass, result.feedback).toBe(true);
});

// Example 3: Smart intelligence for complex judgment
test("brand visual consistency", async () => {
  // Capture ./tmp/homepage.png with a browser tool first — no `page` global.
  const result = await createReview({
    criteria:
      "Visual design maintains professional brand identity suitable for financial " +
      "services while avoiding corporate sterility",
    artifact: "./tmp/homepage.png",
    intelligence: "smart", // Complex aesthetic judgment
  });
  expect(result.pass, result.feedback).toBe(true);
});

// Example 4: Config-driven — enforce every active criterion listed in review-criteria.md.
// Keeps the project's subjective bars in one place; each row that names an `artifact`
// path runs directly. Rows without an artifact are wired up by hand (as above).
test("active review criteria pass", async () => {
  const criteria = await loadActiveCriteria();
  for (const c of criteria.filter((c) => c.artifact)) {
    const result = await createReview({
      criteria: c.criteria,
      artifact: c.artifact!,
      intelligence: c.intelligence,
    });
    expect(result.pass, `${c.id}: ${result.feedback}`).toBe(true);
  }
});
